import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { TaskStatus, UserRole } from '@prisma/client';

// GET /api/tasks/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        companyId: true,
        propertyId: true,
        assignedUserId: true,
        scheduledDate: true,
        moveInDate: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        budget: true,
        taskAssignments: {
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        photos: {
          select: {
            id: true,
            url: true,
            photoType: true,
            caption: true,
            takenAt: true,
            createdAt: true,
          },
          orderBy: { takenAt: 'asc' },
        },
        property: {
          select: {
            id: true,
            address: true,
            postcode: true,
            latitude: true,
            longitude: true,
            propertyType: true,
            isActive: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        checklists: {
          select: {
            id: true,
            title: true,
            isCompleted: true,
            order: true,
          },
          orderBy: { order: 'asc' },
        },
        pdfRecords: {
          select: {
            id: true,
            url: true,
            generatedAt: true,
          },
          orderBy: { generatedAt: 'desc' },
          take: 1, // Get most recent PDF
        },
      },
    });
    if (!task) return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });

    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || task.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      if (role === UserRole.CLEANER) {
        // Check if cleaner is assigned via assignedUserId (backward compatibility) or taskAssignments
        const isAssigned = task.assignedUserId === tokenUser.userId || 
          task.taskAssignments?.some(ta => ta.user.id === tokenUser.userId);
        if (!isAssigned) {
          return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
        }
      }
    }

    // Include download URL for PDF downloads
    const downloadUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pdf/download/${task.id}`;
    
    return NextResponse.json({ 
      success: true, 
      data: { 
        task,
        downloadUrl, // Include download URL in response
      } 
    });
  } catch (error) {
    console.error('Task GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Check permission for editing tasks
  const { requirePermission, PERMISSIONS } = await import('@/lib/permissions');
  const permissionCheck = await requirePermission(request, PERMISSIONS.TASKS_EDIT);
  if (!permissionCheck.allowed) {
    // Allow OWNER, DEVELOPER, and SUPER_ADMIN to bypass permission check
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN && role !== UserRole.MANAGER) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }
  }

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });

    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || task.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      if (role === UserRole.CLEANER) {
        // Cleaners cannot modify task except maybe certain future fields; block for now
        return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });
      }
    }

    const body = await request.json();
    const data: any = {};
    const { title, description, assignedUserId, assignedUserIds, scheduledDate, status } = body;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;

    // Handle cleaner assignment (support both single and multiple)
    let cleanerIdsToNotify: number[] = [];
    if (assignedUserIds !== undefined && Array.isArray(assignedUserIds)) {
      // Multiple cleaner assignments
      cleanerIdsToNotify = assignedUserIds.map(id => Number(id));
      // Use first cleaner as primary assignedUserId (for backward compatibility)
      data.assignedUserId = cleanerIdsToNotify.length > 0 ? cleanerIdsToNotify[0] : null;

      // Validate assigned cleaners if provided
      const companyId = task.companyId;
      const users = await prisma.user.findMany({
        where: {
          id: { in: cleanerIdsToNotify },
          OR: [
            { companyId },
            { role: { in: [UserRole.OWNER, UserRole.DEVELOPER] } },
          ],
        },
        select: { id: true, role: true },
      });

      if (users.length !== cleanerIdsToNotify.length) {
        return NextResponse.json({ success: false, message: 'One or more assigned cleaners not found or not in company' }, { status: 400 });
      }

      // Update TaskAssignment records - delete all existing and create new ones
      data.taskAssignments = {
        deleteMany: {}, // Delete all existing assignments
        create: cleanerIdsToNotify.map(userId => ({
          userId,
        })),
      };
    } else if (assignedUserId !== undefined) {
      // Single cleaner assignment (backward compatibility)
      data.assignedUserId = assignedUserId ? Number(assignedUserId) : null;
      cleanerIdsToNotify = assignedUserId ? [Number(assignedUserId)] : [];

      // Update TaskAssignment records
      if (assignedUserId) {
        data.taskAssignments = {
          deleteMany: {},
          create: [{ userId: Number(assignedUserId) }],
        };
      } else {
        data.taskAssignments = {
          deleteMany: {},
        };
      }
    }

    if (scheduledDate !== undefined) data.scheduledDate = scheduledDate ? new Date(scheduledDate) : null;
    if (status !== undefined && Object.values(TaskStatus).includes(status)) data.status = status;

    const updated = await prisma.task.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        companyId: true,
        propertyId: true,
        assignedUserId: true,
        scheduledDate: true,
        createdAt: true,
        updatedAt: true,
        taskAssignments: {
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        photos: {
          select: {
            id: true,
            url: true,
            photoType: true,
            caption: true,
            takenAt: true,
            createdAt: true,
          },
          orderBy: { takenAt: 'asc' },
        },
        property: {
          select: {
            id: true,
            address: true,
            postcode: true,
            latitude: true,
            longitude: true,
            propertyType: true,
            isActive: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        checklists: {
          select: {
            id: true,
            title: true,
            isCompleted: true,
            order: true,
          },
          orderBy: { order: 'asc' },
        },
        pdfRecords: {
          select: {
            id: true,
            url: true,
            generatedAt: true,
          },
          orderBy: { generatedAt: 'desc' },
          take: 1, // Get most recent PDF
        },
      },
    });

    // Send notifications if cleaner assignment changed
    if (cleanerIdsToNotify.length > 0 && (assignedUserId !== undefined || assignedUserIds !== undefined)) {
      const { sendTaskUpdatedNotification } = await import('@/lib/notifications');
      await sendTaskUpdatedNotification(updated.id, cleanerIdsToNotify, 'assignment');
    }

    return NextResponse.json({ success: true, data: { task: updated } });
  } catch (error) {
    console.error('Task PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]
// Instead of deleting, reject or archive the task
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    // Check if task exists and user has permission
    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        companyId: true,
        assignedUserId: true,
        taskAssignments: {
          select: { userId: true },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    // Check permissions
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || task.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    // Determine appropriate status based on current status
    let newStatus: TaskStatus;
    if (task.status === TaskStatus.ASSIGNED || task.status === TaskStatus.IN_PROGRESS) {
      // If task is active, reject it
      newStatus = TaskStatus.REJECTED;
    } else {
      // Otherwise, archive it
      newStatus = TaskStatus.ARCHIVED;
    }

    // Update task status instead of deleting
    const updateData: any = {
      status: newStatus,
    };

    // Set completedAt if archiving and not already completed
    if (newStatus === TaskStatus.ARCHIVED && task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.APPROVED) {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ 
      success: true, 
      message: `Task ${newStatus.toLowerCase()} successfully`,
      data: { task: updated },
    });
  } catch (error) {
    console.error('Task DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}