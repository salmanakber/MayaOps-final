import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { requirePermission, PERMISSIONS } from '@/lib/permissions';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

// GET - List all SUPER_ADMIN users only
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission(request, PERMISSIONS.USERS_MANAGE_ADMINS);
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }

    // Only fetch SUPER_ADMIN users
    const where: any = {
      role: UserRole.SUPER_ADMIN,
    };

    const users = await prisma.user.findMany({
      where,
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
        isHeadSuperAdmin: true,
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
      orderBy: [
        { isHeadSuperAdmin: 'desc' }, // Head super admin first
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    console.error('Error fetching admin users:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch admin users' },
      { status: 500 }
    );
  }
}

// POST - Create a new admin user
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission(request, PERMISSIONS.USERS_MANAGE_ADMINS);
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, password, firstName, lastName, isHeadSuperAdmin, permissions } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check if trying to create another head super admin
    if (isHeadSuperAdmin) {
      const existingHead = await prisma.user.findFirst({
        where: { isHeadSuperAdmin: true },
      });
      
      if (existingHead) {
        return NextResponse.json(
          { success: false, message: 'A head super admin already exists. Only one head super admin is allowed.' },
          { status: 400 }
        );
      }
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user as SUPER_ADMIN
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: UserRole.SUPER_ADMIN,
        isHeadSuperAdmin: isHeadSuperAdmin || false,
        isActive: true,
      },
    });

    // Assign permissions if provided
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      const permissionRecords = await prisma.permission.findMany({
        where: {
          key: {
            in: permissions,
          },
        },
      });

      if (permissionRecords.length > 0) {
        await prisma.adminPermission.createMany({
          data: permissionRecords.map(perm => ({
            userId: user.id,
            permissionId: perm.id,
            grantedBy: permissionCheck.userId,
            isActive: true,
          })),
        });
      }
    }

    // Fetch created user with permissions
    const createdUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true,
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
      message: 'Admin user created successfully',
      data: createdUser,
    });
  } catch (error: any) {
    console.error('Error creating admin user:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create admin user' },
      { status: 500 }
    );
  }
}
