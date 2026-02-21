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
 * GET /api/recurring-jobs
 * Get recurring jobs for a property or company
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const companyId = searchParams.get('companyId');

    let where: any = {};

    // Determine company scope
    let targetCompanyId: number | null = null;
    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      if (companyId) {
        targetCompanyId = parseInt(companyId);
      }
    } else {
      targetCompanyId = requireCompanyScope(tokenUser);
      if (!targetCompanyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    if (targetCompanyId) {
      where.companyId = targetCompanyId;
    }

    if (propertyId) {
      where.propertyId = parseInt(propertyId);
    }

    // Note: recurringJob model will be available after running: npx prisma migrate dev && npx prisma generate
    const jobs = await (prisma as any).recurringJob.findMany({
      where,
      include: {
        property: {
          select: {
            id: true,
            address: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      data: jobs.map(job => ({
        ...job,
        allowedDaysOfWeek: job.allowedDaysOfWeek ? JSON.parse(job.allowedDaysOfWeek) : null,
        nextRunAt: job.nextRunAt.toISOString(),
        endDate: job.endDate?.toISOString() || null,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('Recurring jobs GET error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch recurring jobs' }, { status: 500 });
  }
}

/**
 * POST /api/recurring-jobs
 * Create a new recurring job
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Check permission
  const permissionCheck = await requirePermission(request, PERMISSIONS.TASKS_CREATE);
  if (!permissionCheck.allowed) {
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }
  }

  try {
    const body = await request.json();
    const {
      propertyId,
      companyId: bodyCompanyId,
      recurrenceType,
      intervalDays,
      allowedDaysOfWeek,
      nextRunAt,
      endDate,
      maxOccurrences,
      taskTitle,
      taskDescription,
    } = body;

    if (!propertyId || !recurrenceType || !taskTitle || !nextRunAt) {
      return NextResponse.json(
        { success: false, message: 'propertyId, recurrenceType, taskTitle, and nextRunAt are required' },
        { status: 400 }
      );
    }

    // Determine company ID
    let companyId: number | null = null;
    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      companyId = bodyCompanyId ?? null;
      if (!companyId) {
        const property = await prisma.property.findUnique({
          where: { id: parseInt(propertyId) },
          select: { companyId: true },
        });
        if (!property) {
          return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
        }
        companyId = property.companyId;
      }
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    // Validate property belongs to company
    const property = await prisma.property.findFirst({
      where: { id: parseInt(propertyId), companyId },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ success: false, message: 'Property not found or access denied' }, { status: 404 });
    }

    // Parse and validate configuration
    const nextRunAtDate = new Date(nextRunAt);
    const endDateObj = endDate ? new Date(endDate) : null;
    const allowedDaysStr = allowedDaysOfWeek ? JSON.stringify(allowedDaysOfWeek) : null;

    const validation = validateRecurringJobConfig({
      recurrenceType,
      intervalDays: intervalDays || null,
      allowedDaysOfWeek: allowedDaysStr,
      nextRunAt: nextRunAtDate,
      endDate: endDateObj,
      maxOccurrences: maxOccurrences || null,
    });

    if (!validation.valid) {
      return NextResponse.json({ success: false, message: validation.error }, { status: 400 });
    }

    // Create recurring job
    // Note: recurringJob model will be available after running: npx prisma migrate dev && npx prisma generate
    const recurringJob = await (prisma as any).recurringJob.create({
      data: {
        propertyId: parseInt(propertyId),
        companyId,
        recurrenceType,
        intervalDays: intervalDays || null,
        allowedDaysOfWeek: allowedDaysStr,
        nextRunAt: nextRunAtDate,
        endDate: endDateObj,
        maxOccurrences: maxOccurrences || null,
        taskTitle,
        taskDescription: taskDescription || null,
        active: true,
        currentOccurrenceCount: 0,
      },
    });

    // Schedule the first execution
    await scheduleRecurringJobExecution(recurringJob.id, nextRunAtDate);

    console.log(`[Recurring Jobs] Created recurring job ${recurringJob.id} for property ${propertyId}`);

    return NextResponse.json({
      success: true,
      data: {
        ...recurringJob,
        allowedDaysOfWeek: recurringJob.allowedDaysOfWeek ? JSON.parse(recurringJob.allowedDaysOfWeek) : null,
        nextRunAt: recurringJob.nextRunAt.toISOString(),
        endDate: recurringJob.endDate?.toISOString() || null,
        createdAt: recurringJob.createdAt.toISOString(),
        updatedAt: recurringJob.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Recurring jobs POST error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to create recurring job' }, { status: 500 });
  }
}
