import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { requirePermission, PERMISSIONS } from '@/lib/permissions';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

// GET - Get a specific admin user
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const permissionCheck = await requirePermission(request, PERMISSIONS.USERS_VIEW);
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }

    const userId = parseInt(params.id);
    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        adminPermissions: {
          where: {
            isActive: true,
            revokedAt: null,
          },
          include: {
            permission: {
              select: {
                id: true,
                key: true,
                name: true,
                category: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user is SUPER_ADMIN
    if (user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { success: false, message: 'User is not a super admin' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error('Error fetching admin user:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch admin user' },
      { status: 500 }
    );
  }
}

// PATCH - Update an admin user
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const permissionCheck = await requirePermission(request, PERMISSIONS.USERS_EDIT);
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }

    const auth = requireAuth(request);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    const { tokenUser } = auth;
    const userId = parseInt(params.id);
    
    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user ID' },
        { status: 400 }
      );
    }
    
    // Prevent head super admin from modifying themselves
    if (tokenUser.userId === userId) {
      // Get the user being modified to check if they're head super admin
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isHeadSuperAdmin: true },
      });
      
      if (targetUser?.isHeadSuperAdmin) {
        return NextResponse.json(
          { success: false, message: 'Head Super Admins cannot modify their own permissions or status. Please ask another Head Super Admin to make changes.' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { email, password, firstName, lastName, isHeadSuperAdmin, isActive, permissions } = body;

    // Check if user exists and is SUPER_ADMIN
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isHeadSuperAdmin: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    if (existingUser.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { success: false, message: 'User is not a super admin' },
        { status: 400 }
      );
    }

    // Prevent changing head super admin status if trying to set another user as head
    if (isHeadSuperAdmin && !existingUser.isHeadSuperAdmin) {
      const existingHead = await prisma.user.findFirst({
        where: { 
          isHeadSuperAdmin: true,
          id: { not: userId },
        },
      });
      
      if (existingHead) {
        return NextResponse.json(
          { success: false, message: 'A head super admin already exists. Only one head super admin is allowed.' },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (email !== undefined) updateData.email = email;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isHeadSuperAdmin !== undefined) updateData.isHeadSuperAdmin = isHeadSuperAdmin;

    // Hash password if provided
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Update permissions if provided
    if (permissions !== undefined && Array.isArray(permissions)) {
      // Get all existing active permissions
      const existingPermissions = await prisma.adminPermission.findMany({
        where: {
          userId,
          isActive: true,
          revokedAt: null,
        },
        include: {
          permission: true,
        },
      });

      const existingPermissionKeys = existingPermissions.map(ep => ep.permission.key);
      const permissionsToAdd = permissions.filter((p: string) => !existingPermissionKeys.includes(p));
      const permissionsToRemove = existingPermissionKeys.filter(p => !permissions.includes(p));

      // Revoke removed permissions
      if (permissionsToRemove.length > 0) {
        const permissionsToRevoke = await prisma.permission.findMany({
          where: {
            key: {
              in: permissionsToRemove,
            },
          },
        });

        if (permissionsToRevoke.length > 0) {
          await prisma.adminPermission.updateMany({
            where: {
              userId,
              permissionId: {
                in: permissionsToRevoke.map(p => p.id),
              },
            },
            data: {
              isActive: false,
              revokedAt: new Date(),
            },
          });
        }
      }

      // Add new permissions
      if (permissionsToAdd.length > 0) {
        const permissionRecords = await prisma.permission.findMany({
          where: {
            key: {
              in: permissionsToAdd,
            },
          },
        });

        if (permissionRecords.length > 0) {
          // Check if permission already exists (revoked) and reactivate it, or create new
          for (const perm of permissionRecords) {
            const existing = await prisma.adminPermission.findUnique({
              where: {
                userId_permissionId: {
                  userId,
                  permissionId: perm.id,
                },
              },
            });

            if (existing) {
              // Reactivate if it was revoked
              await prisma.adminPermission.update({
                where: {
                  userId_permissionId: {
                    userId,
                    permissionId: perm.id,
                  },
                },
                data: {
                  isActive: true,
                  revokedAt: null,
                  grantedBy: permissionCheck.userId,
                  grantedAt: new Date(),
                },
              });
            } else {
              // Create new
              await prisma.adminPermission.create({
                data: {
                  userId,
                  permissionId: perm.id,
                  grantedBy: permissionCheck.userId,
                  isActive: true,
                },
              });
            }
          }
        }
      }
    }

    // Fetch updated user with permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        adminPermissions: {
          where: {
            isActive: true,
            revokedAt: null,
          },
          include: {
            permission: {
              select: {
                id: true,
                key: true,
                name: true,
                category: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Admin user updated successfully',
      data: user,
    });
  } catch (error: any) {
    console.error('Error updating admin user:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update admin user' },
      { status: 500 }
    );
  }
}

// DELETE - Deactivate an admin user (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const permissionCheck = await requirePermission(request, PERMISSIONS.USERS_DELETE);
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }

    const userId = parseInt(params.id);
    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Prevent self-deletion
    if (userId === permissionCheck.userId) {
      return NextResponse.json(
        { success: false, message: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    // Prevent deleting head super admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isHeadSuperAdmin: true },
    });

    if (user?.isHeadSuperAdmin) {
      return NextResponse.json(
        { success: false, message: 'Cannot deactivate head super admin' },
        { status: 400 }
      );
    }

    // Deactivate user
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Admin user deactivated successfully',
    });
  } catch (error: any) {
    console.error('Error deactivating admin user:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to deactivate admin user' },
      { status: 500 }
    );
  }
}
