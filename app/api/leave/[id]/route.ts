import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createNotification } from '@/lib/notifications';

/**
 * PATCH /api/leave/[id] - Update leave request (cancel or adjust dates)
 * DELETE /api/leave/[id] - Cancel/delete leave request
 */

async function getApproverName(userId: number): Promise<string> {
    try {
        const response = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
        });
        return `${response?.firstName || ''} ${response?.lastName || ''}`.trim() || 'Manager';
    } catch (error) {
        console.error('Error getting username by id:', error);
        return 'Manager';
    }
}


export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid leave request ID' }, { status: 400 });
    }
    const body = await request.json();
    const { endDate, status } = body;

    // Get leave request with user info
    const existingLeaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!existingLeaveRequest) {
      return NextResponse.json({ success: false, message: 'Leave request not found' }, { status: 404 });
    }

    // Check permissions: owners/managers/admins can update any, cleaners can only update their own
    const isOwner = existingLeaveRequest.userId === tokenUser.userId;
    const isAuthorized = role === UserRole.OWNER || role === UserRole.DEVELOPER || 
                         role === UserRole.MANAGER || role === UserRole.COMPANY_ADMIN || isOwner;
    
    if (!isAuthorized) {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }

    // Build update data
    const updateData: any = {};
    if (endDate) {
      const newEndDate = new Date(endDate);
      if (newEndDate < new Date(existingLeaveRequest.startDate)) {
        return NextResponse.json({ success: false, message: 'End date cannot be before start date' }, { status: 400 });
      }
      updateData.endDate = newEndDate;
    }
    if (status) {
      updateData.status = status;
      if (status === 'rejected' || status === 'cancelled') {
        updateData.approvedBy = tokenUser.userId;
      }
    }

    const leaveRequest = await prisma.leaveRequest.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });

    // Send notification to the requester
    try {
      const startDateStr = new Date(leaveRequest.startDate).toLocaleDateString('en-GB');
      const endDateStr = new Date(leaveRequest.endDate).toLocaleDateString('en-GB');
      const approverName = await getApproverName(tokenUser.userId);

      let notificationTitle = 'Leave Request Updated';
      let notificationMessage = '';

      if (endDate && !status) {
        notificationMessage = `Your leave request has been adjusted. New end date: ${endDateStr}. You are now available from ${new Date(new Date(endDate).getTime() + 86400000).toLocaleDateString('en-GB')}.`;
      } else if (status === 'rejected' || status === 'cancelled') {
        notificationTitle = 'Leave Request Cancelled';
        notificationMessage = `Your leave request from ${startDateStr} to ${endDateStr} has been cancelled by ${approverName}.`;
      } else {
        notificationMessage = `Your leave request has been updated by ${approverName}.`;
      }

      await createNotification({
        userId: leaveRequest.userId,
        title: notificationTitle,
        message: notificationMessage,
        type: 'task_updated',
        metadata: {
          leaveRequestId: leaveRequest.id,
          status: leaveRequest.status,
          updatedBy: tokenUser.userId,
        },
        screenRoute: 'LeaveRequest',
        screenParams: { leaveRequestId: leaveRequest.id },
      });
    } catch (notifError) {
      console.error('Error sending leave update notification:', notifError);
    }

    return NextResponse.json({ success: true, data: leaveRequest });
  } catch (error: any) {
    console.error('Leave update error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid leave request ID' }, { status: 400 });
    }

    // Get leave request before deleting
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!leaveRequest) {
      return NextResponse.json({ success: false, message: 'Leave request not found' }, { status: 404 });
    }

    // Check permissions: owners/managers/admins can delete any, cleaners can only delete their own
    const isOwner = leaveRequest.userId === tokenUser.userId;
    const isAuthorized = role === UserRole.OWNER || role === UserRole.DEVELOPER || 
                         role === UserRole.MANAGER || role === UserRole.COMPANY_ADMIN || isOwner;
    
    if (!isAuthorized) {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }

    // Delete the leave request
    await prisma.leaveRequest.delete({
      where: { id },
    });

    // Send notification to the requester
    try {
      const startDateStr = new Date(leaveRequest.startDate).toLocaleDateString('en-GB');
      const endDateStr = new Date(leaveRequest.endDate).toLocaleDateString('en-GB');
      const approverName = await getApproverName(tokenUser.userId);

      await createNotification({
        userId: leaveRequest.userId,
        title: 'Leave Request Deleted',
        message: `Your leave request from ${startDateStr} to ${endDateStr} has been deleted by ${approverName}.`,
        type: 'task_updated',
        metadata: {
          leaveRequestId: leaveRequest.id,
          deletedBy: tokenUser.userId,
        },
        screenRoute: 'LeaveRequest',
      });
    } catch (notifError) {
      console.error('Error sending leave deletion notification:', notifError);
    }

    return NextResponse.json({ success: true, message: 'Leave request deleted' });
  } catch (error: any) {
    console.error('Leave deletion error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
