import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/**
 * POST /api/working-hours/[id]/approve
 * Approve or reject working hours submission (for managers/owners)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only owners, managers, and company admins can approve
  if (role !== UserRole.OWNER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER && role !== UserRole.DEVELOPER) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body; // 'approved' or 'rejected'

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ success: false, message: 'status must be "approved" or "rejected"' }, { status: 400 });
    }

    const submission = await prisma.workingHoursSubmission.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!submission) {
      return NextResponse.json({ success: false, message: 'Working hours submission not found' }, { status: 404 });
    }

    const updated = await prisma.workingHoursSubmission.update({
      where: { id: parseInt(id) },
      data: {
        status,
        approvedBy: tokenUser.userId,
        approvedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Working hours ${status} successfully`,
      data: {
        id: updated.id,
        userId: updated.userId,
        user: updated.user,
        date: updated.date.toISOString(),
        hours: Number(updated.hours),
        description: updated.description,
        status: updated.status,
        approvedBy: updated.approvedBy,
        approver: updated.approver,
        approvedAt: updated.approvedAt?.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error approving working hours:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}

