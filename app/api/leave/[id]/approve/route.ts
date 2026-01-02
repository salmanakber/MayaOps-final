import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createNotification } from '@/lib/notifications';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { approved } = body;

    // Get leave request with user info before updating
    const existingLeaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: Number(params.id) },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!existingLeaveRequest) {
      return NextResponse.json({ success: false, message: 'Leave request not found' }, { status: 404 });
    }

    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: Number(params.id) },
      data: {
        status: approved ? 'approved' : 'rejected',
        approvedBy: tokenUser.userId,
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });

    // Send notification to the requester
    try {
      const startDateStr = new Date(leaveRequest.startDate).toLocaleDateString('en-GB');
      const endDateStr = new Date(leaveRequest.endDate).toLocaleDateString('en-GB');
      const approverName = leaveRequest.approver 
        ? `${leaveRequest.approver.firstName || ''} ${leaveRequest.approver.lastName || ''}`.trim() || 'Manager'
        : 'Manager';

      const notificationTitle = approved ? 'Leave Request Approved' : 'Leave Request Rejected';
      const notificationMessage = approved
        ? `Your leave request from ${startDateStr} to ${endDateStr} has been approved by ${approverName}.`
        : `Your leave request from ${startDateStr} to ${endDateStr} has been rejected by ${approverName}.${leaveRequest.reason ? ` Reason: ${leaveRequest.reason}` : ''}`;

      await createNotification({
        userId: leaveRequest.userId,
        title: notificationTitle,
        message: notificationMessage,
        type: 'task_updated', // Using task_updated type as it's a status change notification
        metadata: {
          leaveRequestId: leaveRequest.id,
          status: approved ? 'approved' : 'rejected',
          approvedBy: tokenUser.userId,
        },
        screenRoute: 'LeaveRequest',
        screenParams: { leaveRequestId: leaveRequest.id },
      });

      console.log(`✅ Sent leave ${approved ? 'approval' : 'rejection'} notification to user ${leaveRequest.userId}`);
    } catch (notifError) {
      console.error('Error sending leave approval notification:', notifError);
      // Don't fail the approval if notification fails
    }

    return NextResponse.json({ success: true, data: leaveRequest });
  } catch (error) {
    console.error('Leave approval error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
