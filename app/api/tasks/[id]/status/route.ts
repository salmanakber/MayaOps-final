import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { TaskStatus, UserRole } from '@prisma/client';

// PATCH /api/tasks/[id]/status
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });

    // Access control
    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || task.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      if (role === UserRole.CLEANER) {
        // Check if cleaner is assigned via assignedUserId (backward compatibility) or taskAssignments
        const taskWithAssignments = await prisma.task.findUnique({
          where: { id },
          select: {
            assignedUserId: true,
            taskAssignments: {
              select: {
                user: {
                  select: { id: true },
                },
              },
            },
          },
        });
        const isAssigned = taskWithAssignments?.assignedUserId === tokenUser.userId || 
          taskWithAssignments?.taskAssignments?.some(ta => ta.user.id === tokenUser.userId);
        if (!isAssigned) {
          return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
        }
      }
    }

    const body = await request.json();
    const { status } = body as { status?: TaskStatus };
    if (!status || !Object.values(TaskStatus).includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
    }

    // Cleaners allowed transitions: ASSIGNED->IN_PROGRESS->SUBMITTED
    if (role === UserRole.CLEANER) {
      const allowed = new Set<TaskStatus>([TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED]);
      if (!allowed.has(status)) {
        return NextResponse.json({ success: false, message: 'Insufficient permissions for this transition' }, { status: 403 });
      }
      
      // Require checklist acknowledgment before starting task
      if (status === TaskStatus.IN_PROGRESS && !task.checklistAcknowledgedAt) {
        return NextResponse.json({ 
          success: false, 
          message: 'Checklist must be acknowledged before starting task. Please acknowledge the checklist first.' 
        }, { status: 400 });
      }
    }

    const data: any = { status };
    if (status === TaskStatus.IN_PROGRESS && !task.startedAt) data.startedAt = new Date();
    if ((status === TaskStatus.APPROVED || status === TaskStatus.ARCHIVED) && !task.completedAt) data.completedAt = new Date();

    const updated = await prisma.task.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        status: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: { task: updated } });
  } catch (error) {
    console.error('Task status PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
