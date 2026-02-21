import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { requirePermission, PERMISSIONS } from '@/lib/permissions';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { 
  validateRecurringJobConfig,
  calculateNextRunAt,
  shouldJobBeActive 
} from '@/lib/recurring-jobs';
import { scheduleRecurringJobExecution, removeScheduledRecurringJob } from '@/lib/recurring-jobs-queue';

/**
 * GET /api/recurring-jobs/[id]
 * Get a specific recurring job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
    }

    // Determine company scope
    let companyId: number | null = null;
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    const where: any = { id };
    if (companyId) {
      where.companyId = companyId;
    }

    const job = await prisma.recurringJob.findFirst({
      where,
      include: {
        property: {
          select: {
            id: true,
            address: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ success: false, message: 'Recurring job not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        allowedDaysOfWeek: job.allowedDaysOfWeek ? JSON.parse(job.allowedDaysOfWeek) : null,
        nextRunAt: job.nextRunAt.toISOString(),
        endDate: job.endDate?.toISOString() || null,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Recurring job GET error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch recurring job' }, { status: 500 });
  }
}

/**
 * PUT /api/recurring-jobs/[id]
 * Update a recurring job
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Check permission
  const permissionCheck = await requirePermission(request, PERMISSIONS.TASKS_EDIT);
  if (!permissionCheck.allowed) {
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }
  }

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
    }

    // Determine company scope
    let companyId: number | null = null;
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    const where: any = { id };
    if (companyId) {
      where.companyId = companyId;
    }

    // Check if job exists
    const existingJob = await prisma.recurringJob.findFirst({ where });
    if (!existingJob) {
      return NextResponse.json({ success: false, message: 'Recurring job not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      recurrenceType,
      intervalDays,
      allowedDaysOfWeek,
      nextRunAt,
      endDate,
      maxOccurrences,
      taskTitle,
      taskDescription,
      active,
    } = body;

    // Build update data
    const updateData: any = {};

    if (recurrenceType !== undefined) updateData.recurrenceType = recurrenceType;
    if (intervalDays !== undefined) updateData.intervalDays = intervalDays;
    if (allowedDaysOfWeek !== undefined) {
      updateData.allowedDaysOfWeek = allowedDaysOfWeek ? JSON.stringify(allowedDaysOfWeek) : null;
    }
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (maxOccurrences !== undefined) updateData.maxOccurrences = maxOccurrences;
    if (taskTitle !== undefined) updateData.taskTitle = taskTitle;
    if (taskDescription !== undefined) updateData.taskDescription = taskDescription;
    if (active !== undefined) updateData.active = active;

    // If nextRunAt is being updated, recalculate it
    if (nextRunAt !== undefined) {
      updateData.nextRunAt = new Date(nextRunAt);
    } else if (recurrenceType !== undefined || intervalDays !== undefined || allowedDaysOfWeek !== undefined) {
      // Recalculate nextRunAt if recurrence config changed
      const tempJob = { ...existingJob, ...updateData };
      if (tempJob.recurrenceType === 'interval' && tempJob.intervalDays) {
        updateData.nextRunAt = calculateNextRunAt(tempJob);
      } else if (tempJob.recurrenceType === 'weekly' && tempJob.allowedDaysOfWeek) {
        updateData.nextRunAt = calculateNextRunAt(tempJob);
      }
    }

    // Validate if configuration changed
    if (recurrenceType || intervalDays !== undefined || allowedDaysOfWeek !== undefined || nextRunAt !== undefined) {
      const finalJob = { ...existingJob, ...updateData };
      const validation = validateRecurringJobConfig({
        recurrenceType: finalJob.recurrenceType,
        intervalDays: finalJob.intervalDays,
        allowedDaysOfWeek: finalJob.allowedDaysOfWeek,
        nextRunAt: finalJob.nextRunAt,
        endDate: finalJob.endDate,
        maxOccurrences: finalJob.maxOccurrences,
      });

      if (!validation.valid) {
        return NextResponse.json({ success: false, message: validation.error }, { status: 400 });
      }
    }

    // Remove existing scheduled job
    await removeScheduledRecurringJob(id);

    // Update recurring job
    const updatedJob = await prisma.recurringJob.update({
      where: { id },
      data: updateData,
      include: {
        property: {
          select: {
            id: true,
            address: true,
          },
        },
      },
    });

    // Reschedule if still active
    if (updatedJob.active && shouldJobBeActive(updatedJob)) {
      await scheduleRecurringJobExecution(updatedJob.id, updatedJob.nextRunAt);
    }

    console.log(`[Recurring Jobs] Updated recurring job ${id}`);

    return NextResponse.json({
      success: true,
      data: {
        ...updatedJob,
        allowedDaysOfWeek: updatedJob.allowedDaysOfWeek ? JSON.parse(updatedJob.allowedDaysOfWeek) : null,
        nextRunAt: updatedJob.nextRunAt.toISOString(),
        endDate: updatedJob.endDate?.toISOString() || null,
        createdAt: updatedJob.createdAt.toISOString(),
        updatedAt: updatedJob.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Recurring job PUT error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update recurring job' }, { status: 500 });
  }
}

/**
 * DELETE /api/recurring-jobs/[id]
 * Delete a recurring job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Check permission
  const permissionCheck = await requirePermission(request, PERMISSIONS.TASKS_DELETE);
  if (!permissionCheck.allowed) {
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }
  }

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
    }

    // Determine company scope
    let companyId: number | null = null;
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    const where: any = { id };
    if (companyId) {
      where.companyId = companyId;
    }

    // Check if job exists
    const existingJob = await prisma.recurringJob.findFirst({ where });
    if (!existingJob) {
      return NextResponse.json({ success: false, message: 'Recurring job not found' }, { status: 404 });
    }

    // Remove scheduled job
    await removeScheduledRecurringJob(id);

    // Delete recurring job (cascade will handle related tasks)
    await prisma.recurringJob.delete({
      where: { id },
    });

    console.log(`[Recurring Jobs] Deleted recurring job ${id}`);

    return NextResponse.json({ success: true, message: 'Recurring job deleted' });
  } catch (error: any) {
    console.error('Recurring job DELETE error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete recurring job' }, { status: 500 });
  }
}
