import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createNotification } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const where: any = {};

    // Get user's companyId - prefer tokenUser.companyId if available
    let companyId: number | null = tokenUser.companyId || null;
    
    if (!companyId) {
      const user = await prisma.user.findUnique({
        where: { id: tokenUser.userId },
        select: { companyId: true },
      });
      companyId = user?.companyId || null;
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: 'User company not found' }, { status: 400 });
    }

    // CLEANER: only see their own leave requests
    if (role === UserRole.CLEANER) {
      where.userId = tokenUser.userId;
    } 
    // OWNER, MANAGER, COMPANY_ADMIN: see all leave requests from their company
    // Get all user IDs in the company first, then filter by those IDs
    else if (role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.COMPANY_ADMIN) {
      const companyUsers = await prisma.user.findMany({
        where: { companyId: companyId },
        select: { id: true },
      });
      const userIds = companyUsers.map(u => u.id);
      where.userId = { in: userIds };
    }
    // Other roles: also filter by companyId for security
    else {
      const companyUsers = await prisma.user.findMany({
        where: { companyId: companyId },
        select: { id: true },
      });
      const userIds = companyUsers.map(u => u.id);
      where.userId = { in: userIds };
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: leaveRequests });
  } catch (error) {
    console.error('Leave GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const body = await request.json();
    const { startDate, endDate, reason } = body;

    // Get user's company to notify managers/owners
    const user = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { companyId: true, firstName: true, lastName: true },
    });

    if (!user || !user.companyId) {
      return NextResponse.json({ success: false, message: 'User company not found' }, { status: 400 });
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: tokenUser.userId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        status: 'pending',
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Notify managers and owners about the new leave request
    try {
      const managersAndOwners = await prisma.user.findMany({
        where: {
          companyId: user.companyId,
          role: { in: [UserRole.OWNER, UserRole.MANAGER, UserRole.COMPANY_ADMIN] },
          isActive: true,
        },
        select: { id: true },
      });

      const startDateStr = new Date(startDate).toLocaleDateString('en-GB');
      const endDateStr = new Date(endDate).toLocaleDateString('en-GB');
      const requesterName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'A team member';

      for (const admin of managersAndOwners) {
        await createNotification({
          userId: admin.id,
          title: 'New Leave Request',
          message: `${requesterName} has requested leave from ${startDateStr} to ${endDateStr}${reason ? `. Reason: ${reason.substring(0, 100)}` : ''}`,
          type: 'task_created', // Using task_created type as it's a general notification
          metadata: {
            leaveRequestId: leaveRequest.id,
            requesterId: tokenUser.userId,
          },
          screenRoute: 'LeaveRequest',
          screenParams: { leaveRequestId: leaveRequest.id },
        }).catch((notifError) => {
          console.error(`Error sending leave request notification to user ${admin.id}:`, notifError);
        });
      }

      console.log(`✅ Sent leave request notifications to ${managersAndOwners.length} manager(s)/owner(s)`);
    } catch (notifError) {
      console.error('Error sending leave request notifications:', notifError);
      // Don't fail the leave request creation if notification fails
    }

    return NextResponse.json({ success: true, data: leaveRequest }, { status: 201 });
  } catch (error) {
    console.error('Leave POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
