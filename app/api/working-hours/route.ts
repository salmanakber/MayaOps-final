import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/**
 * GET /api/working-hours
 * Get working hours submissions
 * - Cleaners can see their own submissions
 * - Managers/Owners can see all submissions for their company
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const userId = searchParams.get('userId');

  try {
    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const where: any = { companyId };

    // Cleaners can only see their own submissions
    if (role === UserRole.CLEANER) {
      where.userId = tokenUser.userId;
    } else if (userId) {
      // Managers/Owners can filter by userId
      where.userId = parseInt(userId);
    }

    // Date range filter
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const submissions = await prisma.workingHoursSubmission.findMany({
      where,
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
        tasks: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                property: {
                  select: {
                    id: true,
                    address: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: submissions.map(s => ({
        id: s.id,
        userId: s.userId,
        user: s.user,
        companyId: s.companyId,
        date: s.date.toISOString(),
        hours: Number(s.hours),
        description: s.description,
        status: s.status,
        approvedBy: s.approvedBy,
        approver: s.approver,
        approvedAt: s.approvedAt?.toISOString(),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        tasks: s.tasks.map(t => ({
          id: t.id,
          taskId: t.taskId,
          task: t.task,
          hours: t.hours ? Number(t.hours) : null,
        })),
      })),
    });
  } catch (error: any) {
    console.error('Error fetching working hours:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/working-hours
 * Submit working hours (for cleaners)
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only cleaners and managers can submit working hours
  if (role !== UserRole.CLEANER && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Not authorized to submit working hours' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { date, hours, description, taskIds } = body;

    if (!date || hours === undefined || hours === null) {
      return NextResponse.json({ success: false, message: 'date and hours are required' }, { status: 400 });
    }

    if (hours < 0 || hours > 24) {
      return NextResponse.json({ success: false, message: 'hours must be between 0 and 24' }, { status: 400 });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const submissionDate = new Date(date);
    submissionDate.setHours(0, 0, 0, 0);

    // Check if cleaner has active tasks for this date
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ success: false, message: 'At least one task is required' }, { status: 400 });
    }

    // Verify tasks belong to the user and are scheduled for the selected date
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds.map((id: any) => parseInt(id)) },
        companyId,
        OR: [
          { assignedUserId: tokenUser.userId },
          { taskAssignments: { some: { userId: tokenUser.userId } } },
        ],
      },
      select: { id: true },
    });

    if (tasks.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid tasks found. Please select tasks assigned to you.' }, { status: 400 });
    }

    // Check if submission already exists for this date
    const existing = await prisma.workingHoursSubmission.findUnique({
      where: {
        userId_date: {
          userId: tokenUser.userId,
          date: submissionDate,
        },
      },
      include: {
        tasks: true,
      },
    });

    if (existing) {
      // Delete existing task associations
      await prisma.workingHoursSubmissionTask.deleteMany({
        where: { workingHoursSubmissionId: existing.id },
      });

      // Update existing submission
      const updated = await prisma.workingHoursSubmission.update({
        where: { id: existing.id },
        data: {
          hours,
          description: description || null,
          status: 'pending', // Reset to pending if updating
          approvedBy: null,
          approvedAt: null,
          tasks: {
            create: tasks.map((task) => ({
              taskId: task.id,
            })),
          },
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
          tasks: {
            include: {
              task: {
                select: {
                  id: true,
                  title: true,
                  property: {
                    select: {
                      id: true,
                      address: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Working hours updated successfully',
        data: {
          id: updated.id,
          userId: updated.userId,
          user: updated.user,
          date: updated.date.toISOString(),
          hours: Number(updated.hours),
          description: updated.description,
          status: updated.status,
          tasks: updated.tasks.map(t => ({
            id: t.id,
            taskId: t.taskId,
            task: t.task,
            hours: t.hours ? Number(t.hours) : null,
          })),
        },
      });
    }

    // Create new submission
    const submission = await prisma.workingHoursSubmission.create({
      data: {
        userId: tokenUser.userId,
        companyId,
        date: submissionDate,
        hours,
        description: description || null,
        status: 'pending',
        tasks: {
          create: tasks.map((task) => ({
            taskId: task.id,
          })),
        },
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
        tasks: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                property: {
                  select: {
                    id: true,
                    address: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Working hours submitted successfully',
      data: {
        id: submission.id,
        userId: submission.userId,
        user: submission.user,
        date: submission.date.toISOString(),
        hours: Number(submission.hours),
        description: submission.description,
        status: submission.status,
        tasks: submission.tasks.map(t => ({
          id: t.id,
          taskId: t.taskId,
          task: t.task,
          hours: t.hours ? Number(t.hours) : null,
        })),
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error submitting working hours:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, message: 'Working hours already submitted for this date' }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}

