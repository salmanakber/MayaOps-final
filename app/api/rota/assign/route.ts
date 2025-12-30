import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { sendTaskAssignmentNotification, scheduleTaskReminders } from '@/lib/notifications';
import { logAudit } from '@/lib/audit';
import { validateAssignment } from '@/lib/rota-conflicts';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { taskId, cleanerId } = body;

    if (!taskId || !cleanerId) {
      return NextResponse.json(
        { success: false, message: 'taskId and cleanerId are required' },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      include: {
        property: {
          include: {
            requiredSkills: {
              include: { skill: true },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      const companyId = requireCompanyScope(tokenUser);
      if (task.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
      }
    }

    const cleaner = await prisma.user.findUnique({
      where: { id: Number(cleanerId) },
      select: { id: true, role: true, companyId: true },
    });

    if (!cleaner || cleaner.role !== UserRole.CLEANER) {
      return NextResponse.json({ success: false, message: 'Invalid cleaner' }, { status: 400 });
    }

    // Enhanced: Validate assignment and detect conflicts (non-blocking warnings)
    const taskScheduledDate = task.scheduledDate || new Date();
    
    // Calculate week boundaries for max hours validation
    const date = new Date(taskScheduledDate);
    const day = date.getDay();
    const diff = date.getDate() - day;
    const weekStart = new Date(date.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const validation = await validateAssignment(
      cleaner.id,
      task.id,
      taskScheduledDate,
      task.propertyId,
      task.estimatedDurationMinutes,
      weekStart,
      weekEnd
    );

    const oldAssignedUserId = task.assignedUserId;

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: { assignedUserId: cleaner.id },
      include: {
        property: true,
        assignedUser: { 
          select: { 
            firstName: true, 
            lastName: true, 
            email: true,
            cleanerSkills: {
              include: { skill: true },
            },
          },
        },
      },
    });

    await logAudit({
      companyId: task.companyId,
      userId: tokenUser.userId,
      action: 'update',
      entityType: 'task',
      entityId: task.id,
      oldValues: { assignedUserId: oldAssignedUserId },
      newValues: { assignedUserId: cleaner.id },
    });

    await sendTaskAssignmentNotification(task.id, cleaner.id);
    await scheduleTaskReminders(task.id);

    return NextResponse.json({ 
      success: true, 
      data: { 
        task: updatedTask,
        warnings: validation.warnings, // Include warnings in response (non-blocking)
      },
    });
  } catch (error) {
    console.error('Rota assign error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
