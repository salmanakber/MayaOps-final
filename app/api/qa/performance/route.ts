import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole, TaskStatus } from '@prisma/client';

/**
 * GET /api/qa/performance
 * Get QA performance statistics for all cleaners
 * Now includes completed task tracking, not just customer reviews
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only managers, owners, and admins can view performance
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cleanerId = searchParams.get('cleanerId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    let companyId: number | null = null;
    if (role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      companyId = tokenUser.companyId || null;
    } else {
      companyId = requireCompanyScope(tokenUser);
    }

    // Get all cleaners in the company
    const cleanersWhere: any = {
      role: UserRole.CLEANER,
      isActive: true,
    };

    if (companyId) {
      cleanersWhere.companyId = companyId;
    }

    if (cleanerId) {
      cleanersWhere.id = Number(cleanerId);
    }

    const cleaners = await prisma.user.findMany({
      where: cleanersWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    // Build date filter
    const dateFilter: any = {};
    if (startDate && endDate) {
      dateFilter.scheduledDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // Get performance stats for each cleaner
    const performanceStats = await Promise.all(
      cleaners.map(async (cleaner) => {
        // Get all tasks assigned to this cleaner (including via taskAssignments)
        const allTasks = await prisma.task.findMany({
          where: {
            OR: [
              { assignedUserId: cleaner.id },
              {
                taskAssignments: {
                  some: {
                    userId: cleaner.id,
                  },
                },
              },
            ],
            companyId: companyId || undefined,
            ...dateFilter,
          },
          select: {
            id: true,
            status: true,
            scheduledDate: true,
            completedAt: true,
            startedAt: true,
            estimatedDurationMinutes: true,
          },
        });

        // Calculate task completion metrics
        const totalTasks = allTasks.length;
        const completedTasks = allTasks.filter((t) => 
          t.status === TaskStatus.APPROVED || t.status === TaskStatus.SUBMITTED
        );
        const inProgressTasks = allTasks.filter((t) => 
          t.status === TaskStatus.IN_PROGRESS
        );
        const pendingTasks = allTasks.filter((t) => 
          t.status === TaskStatus.PLANNED || t.status === TaskStatus.ASSIGNED
        );

        // Calculate completion rate
        const completionRate = totalTasks > 0 
          ? (completedTasks.length / totalTasks) * 100 
          : 0;

        // Calculate on-time completion (completed on or before scheduled date)
        const onTimeTasks = completedTasks.filter((task) => {
          if (!task.scheduledDate || !task.completedAt) return false;
          const scheduled = new Date(task.scheduledDate);
          const completed = new Date(task.completedAt);
          scheduled.setHours(0, 0, 0, 0);
          completed.setHours(0, 0, 0, 0);
          return completed <= scheduled;
        });
        const onTimeRate = completedTasks.length > 0
          ? (onTimeTasks.length / completedTasks.length) * 100
          : 0;

        // Calculate average completion time (if startedAt and completedAt are available)
        let avgCompletionTime = 0;
        const tasksWithTiming = completedTasks.filter((t) => t.startedAt && t.completedAt);
        if (tasksWithTiming.length > 0) {
          const totalMinutes = tasksWithTiming.reduce((sum, task) => {
            const start = new Date(task.startedAt!);
            const end = new Date(task.completedAt!);
            return sum + (end.getTime() - start.getTime()) / (1000 * 60);
          }, 0);
          avgCompletionTime = totalMinutes / tasksWithTiming.length;
        }

        // Get QA scores for this cleaner's tasks
        const taskIds = allTasks.map((t) => t.id);
        const qaWhere: any = {
          taskId: { in: taskIds },
        };
        if (startDate && endDate) {
          qaWhere.createdAt = {
            gte: new Date(startDate),
            lte: new Date(endDate),
          };
        }

        const qaScores = await prisma.qAScore.findMany({
          where: qaWhere,
          select: {
            overallScore: true,
            cleanlinessScore: true,
            timelinessScore: true,
            professionalismScore: true,
            createdAt: true,
            task: {
              select: {
                id: true,
                title: true,
                scheduledDate: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        // Calculate QA averages
        let averageOverall = 0;
        let averageCleanliness = 0;
        let averageTimeliness = 0;
        let averageProfessionalism = 0;

        if (qaScores.length > 0) {
          averageOverall = qaScores.reduce((sum, score) => sum + score.overallScore, 0) / qaScores.length;
          averageCleanliness = qaScores.reduce((sum, score) => sum + (score.cleanlinessScore || 0), 0) / qaScores.length;
          averageTimeliness = qaScores.reduce((sum, score) => sum + (score.timelinessScore || 0), 0) / qaScores.length;
          averageProfessionalism = qaScores.reduce((sum, score) => sum + (score.professionalismScore || 0), 0) / qaScores.length;
        }

        // Combined performance score (weighted: 40% completion rate, 30% on-time rate, 30% QA score)
        const combinedScore = totalTasks > 0
          ? (completionRate * 0.4) + (onTimeRate * 0.3) + ((averageOverall / 10) * 100 * 0.3)
          : 0;

        // Get recent scores (last 10)
        const recentScores = qaScores.slice(0, 10).map((score) => ({
          taskId: score.task.id,
          taskTitle: score.task.title,
          overallScore: score.overallScore,
          cleanlinessScore: score.cleanlinessScore,
          timelinessScore: score.timelinessScore,
          professionalismScore: score.professionalismScore,
          createdAt: score.createdAt,
          scheduledDate: score.task.scheduledDate,
        }));

        return {
          cleaner: {
            id: cleaner.id,
            name: `${cleaner.firstName} ${cleaner.lastName}`,
            email: cleaner.email,
          },
          // Task completion metrics
          totalTasks,
          completedTasks: completedTasks.length,
          inProgressTasks: inProgressTasks.length,
          pendingTasks: pendingTasks.length,
          completionRate: parseFloat(completionRate.toFixed(2)),
          onTimeRate: parseFloat(onTimeRate.toFixed(2)),
          avgCompletionTime: parseFloat(avgCompletionTime.toFixed(1)), // in minutes
          // QA scores
          totalQAScores: qaScores.length,
          averageOverall: parseFloat(averageOverall.toFixed(2)),
          averageCleanliness: parseFloat(averageCleanliness.toFixed(2)),
          averageTimeliness: parseFloat(averageTimeliness.toFixed(2)),
          averageProfessionalism: parseFloat(averageProfessionalism.toFixed(2)),
          // Combined performance
          combinedScore: parseFloat(combinedScore.toFixed(2)),
          recentScores,
        };
      })
    );

    // Sort by combined score (descending)
    performanceStats.sort((a, b) => b.combinedScore - a.combinedScore);

    return NextResponse.json({
      success: true,
      data: {
        stats: performanceStats,
        summary: {
          totalCleaners: cleaners.length,
          cleanersWithTasks: performanceStats.filter((s) => s.totalTasks > 0).length,
          cleanersWithScores: performanceStats.filter((s) => s.totalQAScores > 0).length,
          averageCompletionRate:
            performanceStats.length > 0
              ? parseFloat(
                  (
                    performanceStats.reduce((sum, s) => sum + s.completionRate, 0) /
                    performanceStats.length
                  ).toFixed(2)
                )
              : 0,
          averageOverallScore:
            performanceStats.filter((s) => s.totalQAScores > 0).length > 0
              ? parseFloat(
                  (
                    performanceStats
                      .filter((s) => s.totalQAScores > 0)
                      .reduce((sum, s) => sum + s.averageOverall, 0) /
                    performanceStats.filter((s) => s.totalQAScores > 0).length
                  ).toFixed(2)
                )
              : 0,
          averageCombinedScore:
            performanceStats.length > 0
              ? parseFloat(
                  (
                    performanceStats.reduce((sum, s) => sum + s.combinedScore, 0) /
                    performanceStats.length
                  ).toFixed(2)
                )
              : 0,
        },
      },
    });
  } catch (error) {
    console.error('QA Performance GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
