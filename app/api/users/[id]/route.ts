import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// Helper: check if requester can manage target user
function canManage(requester: { role: UserRole; companyId?: number | null }, target: { role: UserRole; companyId?: number | null }) {
  const { role: rRole, companyId: rCompany } = requester;
  const { role: tRole, companyId: tCompany } = target;

  // Owner/Developer/SuperAdmin/AdminUnique can manage anyone
  if (rRole === UserRole.OWNER || rRole === UserRole.DEVELOPER || rRole === UserRole.SUPER_ADMIN || rRole === UserRole.ADMIN_UNIQUE) return true;

  // Must be same company for others
  if (!rCompany || !tCompany || rCompany !== tCompany) return false;

  // Company Admin can manage roles <= MANAGER (not global roles)
  if (rRole === UserRole.COMPANY_ADMIN) {
    return tRole === UserRole.MANAGER || tRole === UserRole.CLEANER || tRole === UserRole.COMPANY_ADMIN;
  }

  // Manager can only manage cleaners
  if (rRole === UserRole.MANAGER) {
    return tRole === UserRole.CLEANER;
  }

  // Cleaners cannot manage anyone
  return false;
}

// GET /api/users/[id]
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(_request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const requesterRole = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true, isActive: true, createdAt: true },
    });
    if (!user) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

    // Access control: Owner/Developer/SuperAdmin ok; others must have company access
    if (!(requesterRole === UserRole.OWNER || requesterRole === UserRole.DEVELOPER || requesterRole === UserRole.SUPER_ADMIN)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || !user.companyId || companyId !== user.companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({ success: true, data: { user } });
  } catch (error) {
    console.error('User GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/users/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const requesterRole = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, companyId: true },
    });
    if (!target) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

    // Owner/Developer/SuperAdmin/AdminUnique can edit anyone; others limited by company and role
    if (!(requesterRole === UserRole.OWNER || requesterRole === UserRole.DEVELOPER || requesterRole === UserRole.SUPER_ADMIN || requesterRole === UserRole.ADMIN_UNIQUE)) {
      const scopeCompanyId = requireCompanyScope(tokenUser);
      if (!scopeCompanyId || !target.companyId || scopeCompanyId !== target.companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      if (!canManage({ role: requesterRole, companyId: scopeCompanyId }, { role: target.role as UserRole, companyId: target.companyId })) {
        return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { firstName, lastName, role, isActive, companyId: newCompanyId } = body;

    // Only Owner/Developer can reassign company or set global roles
    const data: any = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;

    if (role !== undefined) {
      const roleUpper = (role as string).toUpperCase() as UserRole;
      if (!Object.values(UserRole).includes(roleUpper)) {
        return NextResponse.json({ success: false, message: 'Invalid role' }, { status: 400 });
      }

      if (requesterRole === UserRole.OWNER || requesterRole === UserRole.DEVELOPER || requesterRole === UserRole.SUPER_ADMIN || requesterRole === UserRole.ADMIN_UNIQUE) {
        data.role = roleUpper;
      } else {
        // Company Admin cannot elevate to global roles; Manager cannot set admin/manager
        if (requesterRole === UserRole.COMPANY_ADMIN && (roleUpper === UserRole.OWNER || roleUpper === UserRole.DEVELOPER)) {
          return NextResponse.json({ success: false, message: 'Insufficient permissions to set this role' }, { status: 403 });
        }
        if (requesterRole === UserRole.MANAGER && (roleUpper === UserRole.COMPANY_ADMIN || roleUpper === UserRole.MANAGER || roleUpper === UserRole.DEVELOPER || roleUpper === UserRole.OWNER)) {
          return NextResponse.json({ success: false, message: 'Insufficient permissions to set this role' }, { status: 403 });
        }
        data.role = roleUpper;
      }
    }

    if (isActive !== undefined) {
      // Allow deactivation within permission rules
      data.isActive = !!isActive;
    }

    if (newCompanyId !== undefined) {
      if (!(requesterRole === UserRole.OWNER || requesterRole === UserRole.DEVELOPER || requesterRole === UserRole.SUPER_ADMIN || requesterRole === UserRole.ADMIN_UNIQUE)) {
        return NextResponse.json({ success: false, message: 'Only global roles can reassign company' }, { status: 403 });
      }
      
      // Handle null/empty string - unassign from company
      if (newCompanyId === null || newCompanyId === "" || newCompanyId === undefined) {
        data.companyId = null;
      } else {
        // Validate company exists
        const company = await prisma.company.findUnique({ where: { id: Number(newCompanyId) } });
        if (!company) return NextResponse.json({ success: false, message: 'Target company not found' }, { status: 404 });
        data.companyId = Number(newCompanyId);
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ success: true, data: { user: updated } });
  } catch (error) {
    console.error('User PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/users/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const requesterRole = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, companyId: true },
    });
    if (!target) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

    // Only SUPER_ADMIN and ADMIN_UNIQUE can delete users
    if (requesterRole !== UserRole.SUPER_ADMIN && requesterRole !== UserRole.ADMIN_UNIQUE) {
      return NextResponse.json({ success: false, message: 'Only Admin Unique users can delete users' }, { status: 403 });
    }

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('User DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
