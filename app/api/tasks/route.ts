import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { requireActiveSubscription } from '@/lib/subscription';
import { TaskStatus, UserRole } from '@prisma/client';

// GET /api/tasks
// List tasks. Cleaners only see their assigned tasks; managers/admins see company tasks; owner/developer see all.
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  if (!(role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN || role === UserRole.CLEANER)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  // Check if user has active subscription/trial (except for super admins and owners)
  const subscriptionCheck = await requireActiveSubscription(tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ 
      success: false, 
      message: subscriptionCheck.message || 'Subscription required' 
    }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as TaskStatus | null;
  const myOnly = searchParams.get('my') === 'true';
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const companyIdParam = searchParams.get('companyId');

  const where: any = {};
  if (status && Object.values(TaskStatus).includes(status)) where.status = status;
  if (from || to) {
    where.scheduledDate = {};
    if (from) where.scheduledDate.gte = new Date(from);
    if (to) where.scheduledDate.lte = new Date(to);
  }
  

  try {
    if (role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN || role === UserRole.CLEANER) {
      // Allow companyId from query param for SUPER_ADMIN to view different companies
      if (companyIdParam) {
        where.companyId = parseInt(companyIdParam);
      }
      else {
        where.companyId = tokenUser.companyId;
      }
      
      if(role === UserRole.CLEANER) {
        where.OR = [
          { assignedUserId: tokenUser.userId },
          { taskAssignments: { some: { userId: tokenUser.userId } } },
        ];
      }
      
      // global view
      if (myOnly) {
        // For cleaners, check both assignedUserId (backward compatibility) and taskAssignments
        where.OR = [
          { assignedUserId: tokenUser.userId },
          { taskAssignments: { some: { userId: tokenUser.userId } } },
        ];
      }
    } else {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      where.companyId = companyId;
      if (role === UserRole.CLEANER || myOnly) {
        // For cleaners, check both assignedUserId (backward compatibility) and taskAssignments
        where.OR = [
          { assignedUserId: tokenUser.userId },
          { taskAssignments: { some: { userId: tokenUser.userId } } },
        ];
      }
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
      include: {
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
        // @ts-ignore - taskAssignments relation exists in schema but Prisma client may need regeneration
        taskAssignments: {
          include: {
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
        checklists: {
          select: {
            id: true,
            title: true,
            isCompleted: true,
            order: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    return NextResponse.json({ success: true, data: { tasks }, downloadUrl: `${process.env.NEXT_PUBLIC_API_URL}/api/pdf/download` });
  } catch (error) {
    console.error('Tasks GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/tasks
// Create a task. Managers/Company Admin can create tasks in their company. Owner/Developer can create anywhere.
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const body = await request.json();
    const { title, description, companyId: bodyCompanyId, propertyId, assignedUserId, assignedUserIds, scheduledDate, status, budget } = body;

    if (!title || !propertyId) {
      return NextResponse.json({ success: false, message: 'Title and propertyId are required' }, { status: 400 });
    }

    // Support both single assignedUserId and array of assignedUserIds for multiple cleaner assignments
    // For now, we use assignedUserId for the first cleaner (schema limitation)
    // Full multiple cleaner support requires TaskAssignment junction table
    const cleanerIds: number[] = assignedUserIds && Array.isArray(assignedUserIds) 
      ? assignedUserIds 
      : assignedUserId 
        ? [assignedUserId] 
        : [];

    // Require at least one cleaner assignment for managers/owners
    if ((role === UserRole.MANAGER || role === UserRole.COMPANY_ADMIN) && cleanerIds.length === 0) {
      return NextResponse.json({ success: false, message: 'At least one cleaner must be assigned to the task' }, { status: 400 });
    }

    let companyId: number | null = null;
    if (role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      companyId = bodyCompanyId ?? null;
      if (!companyId) {
        // derive from property
        const prop = await prisma.property.findUnique({ where: { id: Number(propertyId) }, select: { companyId: true } });
        if (!prop) return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
        companyId = prop.companyId;
      }
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    // validate property belongs to company
    const property = await prisma.property.findFirst({ where: { id: Number(propertyId), companyId: companyId! }, select: { id: true } });
    if (!property) return NextResponse.json({ success: false, message: 'Property not found in your company' }, { status: 404 });

    // Validate all assigned cleaners belong to same company and are cleaners
    if (cleanerIds.length > 0) {
      const users = await prisma.user.findMany({
        where: {
          id: { in: cleanerIds.map(id => Number(id)) },
          OR: [
            { companyId: companyId! },
            { role: { in: [UserRole.OWNER, UserRole.DEVELOPER] } },
          ],
        },
        select: { id: true, role: true },
      });

      // Verify all cleaners exist and are actually cleaners
      if (users.length !== cleanerIds.length) {
        return NextResponse.json({ success: false, message: 'One or more assigned cleaners not found or not in company' }, { status: 400 });
      }

      // Ensure all assigned users are cleaners (or have appropriate roles)
      const invalidRoles = users.filter(u => u.role !== UserRole.CLEANER && u.role !== UserRole.OWNER && u.role !== UserRole.DEVELOPER);
      console.log('invalidRoles', invalidRoles);
      if (invalidRoles.length > 0) {
        return NextResponse.json({ success: false, message: 'Only cleaners can be assigned to tasks' }, { status: 400 });
      }
    }

    // Use first cleaner ID for assignedUserId (for backward compatibility)
    const primaryAssignedUserId = cleanerIds.length > 0 ? Number(cleanerIds[0]) : undefined;

    const taskData: any = {
      title,
      description,
      companyId: companyId!,
      propertyId: Number(propertyId),
      assignedUserId: primaryAssignedUserId,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      status: status && Object.values(TaskStatus).includes(status) ? status : TaskStatus.DRAFT,
    };

    // Add budget if provided
    if (budget !== undefined) {
      taskData.budget = Number(budget);
    }

    // Create TaskAssignment records for all assigned cleaners
    if (cleanerIds.length > 0) {
      taskData.taskAssignments = {
        create: cleanerIds.map(id => ({
          userId: Number(id),
        })),
      };
    }

    const task = await prisma.task.create({
      data: taskData,
    });

    // Send notifications to all assigned cleaners
    if (cleanerIds.length > 0) {
      const { sendTaskAssignmentNotifications } = await import('@/lib/notifications');
      await sendTaskAssignmentNotifications(task.id, cleanerIds.map(id => Number(id)));
    }

    return NextResponse.json({ success: true, data: { task } }, { status: 201 });
  } catch (error) {
    console.error('Tasks POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
