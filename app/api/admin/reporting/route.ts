import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/admin/reporting - Get comprehensive reporting data
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only SUPER_ADMIN, DEVELOPER, and COMPANY_ADMIN can access reports
  if (
    role !== UserRole.SUPER_ADMIN &&
    role !== UserRole.DEVELOPER &&
    role !== UserRole.COMPANY_ADMIN &&
    role !== UserRole.OWNER
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyIdParam = searchParams.get('companyId');

    // Determine company ID based on role
    let companyId: number | null = null;
    if (role === UserRole.SUPER_ADMIN || role === UserRole.DEVELOPER) {
      // Global roles can view any company's reports if companyId is provided
      companyId = companyIdParam ? parseInt(companyIdParam) : null;
    } else {
      // Company-scoped roles must use their own company
      companyId = requireCompanyScope(tokenUser);
    } 
    

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Build base where clause
    const baseWhere: any = {
      createdAt: { gte: start, lte: end },
    };
    if (companyId) {
      baseWhere.companyId = companyId;
    }

    // Task Statistics
    const totalTasks = await prisma.task.count({
      where: baseWhere,
    });

    const completedTasks = await prisma.task.count({
      where: {
        ...baseWhere,
        status: 'APPROVED',
      },
    });

    const inProgressTasks = await prisma.task.count({
      where: {
        ...baseWhere,
        status: 'IN_PROGRESS',
      },
    });

    const pendingTasks = await prisma.task.count({
      where: {
        ...baseWhere,
        status: 'DRAFT',
      },
    });

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Cleaner Performance
    const cleanerWhere: any = {
      role: 'CLEANER',
    };
    if (companyId) {
      cleanerWhere.companyId = companyId;
    }
    const cleanerPerformance = await prisma.user.findMany({
      where: cleanerWhere,
      include: {
        tasks: {
          where: {
            status: 'APPROVED',
            completedAt: { gte: start, lte: end },
            ...(companyId ? { companyId } : {}),
          },
        },
        qaScores: {
          where: {
            createdAt: { gte: start, lte: end },
          },
        },
      },
    });

    const cleanerStats = cleanerPerformance.map((cleaner) => {
      const tasksCompleted = cleaner.tasks.length;
      const qaScores = cleaner.qaScores.map((score) => score.overallScore);
      const averageScore = qaScores.length > 0
        ? qaScores.reduce((sum, score) => sum + score, 0) / qaScores.length
        : 0;

      // Calculate on-time rate (tasks completed on or before scheduled date)
      const onTimeTasks = cleaner.tasks.filter((task) => {
        if (!task.scheduledDate || !task.completedAt) return false;
        return new Date(task.completedAt) <= new Date(task.scheduledDate);
      }).length;
      const onTimeRate = tasksCompleted > 0 ? (onTimeTasks / tasksCompleted) * 100 : 0;

      return {
        cleanerId: cleaner.id,
        name: `${cleaner.firstName || ''} ${cleaner.lastName || ''}`.trim() || cleaner.email,
        email: cleaner.email,
        tasksCompleted,
        averageScore: Math.round(averageScore * 10) / 10,
        onTimeRate: Math.round(onTimeRate * 10) / 10,
      };
    });

    // Issue Statistics
    // Notes are assigned to users, not directly to companies, so we filter by user's companyId
    const issueWhere: any = {
      noteType: 'issue',
      createdAt: { gte: start, lte: end },
    };
    if (companyId) {
      issueWhere.user = {
        companyId: companyId,
      };
    }

    const totalIssues = await prisma.note.count({
      where: issueWhere,
    });

    const openIssues = await prisma.note.count({
      where: {
        ...issueWhere,
        status: 'OPEN',
      },
    });

    const resolvedIssues = await prisma.note.count({
      where: {
        ...issueWhere,
        status: 'RESOLVED',
      },
    });

    const highSeverityIssues = await prisma.note.count({
      where: {
        ...issueWhere,
        severity: 'HIGH',
      },
    });

    // Billing Summary
    const billingWhere: any = {
      billingDate: { gte: start, lte: end },
    };
    if (companyId) {
      billingWhere.companyId = companyId;
    }
    const billingRecords = await prisma.billingRecord.findMany({
      where: billingWhere,
    });

    const totalRevenue = billingRecords.reduce(
      (sum, record) => sum + Number(record.amountPaid || 0),
      0
    );

    const subscriptionWhere: any = {
      subscriptionStatus: 'active',
    };
    if (companyId) {
      subscriptionWhere.id = companyId;
    }
    const activeSubscriptions = await prisma.company.count({
      where: subscriptionWhere,
    });

    const failedPayments = billingRecords.filter((record) => record.status === 'failed').length;

    // Property Statistics
    const propertyWhere: any = {
      createdAt: { gte: start, lte: end },
    };
    if (companyId) {
      propertyWhere.companyId = companyId;
    }

    const totalProperties = await prisma.property.count({
      where: propertyWhere,
    });

    const activeProperties = await prisma.property.count({
      where: {
        ...propertyWhere,
        isActive: true,
      },
    });

    // User Statistics
    const userWhere: any = {
      createdAt: { gte: start, lte: end },
    };
    if (companyId) {
      userWhere.companyId = companyId;
    }

    const totalUsers = await prisma.user.count({
      where: userWhere,
    });

    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      where: userWhere,
      _count: true,
    });

    // Task Trends (daily breakdown)
    const taskTrends = await prisma.task.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        taskCompletion: {
          total: totalTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          pending: pendingTasks,
          completionRate: Math.round(completionRate * 10) / 10,
        },
        cleanerPerformance: cleanerStats.sort((a, b) => b.tasksCompleted - a.tasksCompleted),
        issueStats: {
          total: totalIssues,
          open: openIssues,
          resolved: resolvedIssues,
          highSeverity: highSeverityIssues,
        },
        billingSummary: {
          totalRevenue,
          activeSubscriptions,
          failedPayments,
          totalTransactions: billingRecords.length,
        },
        propertyStats: {
          total: totalProperties,
          active: activeProperties,
        },
        userStats: {
          total: totalUsers,
          byRole: usersByRole.reduce(
            (acc, item) => ({ ...acc, [item.role]: item._count }),
            {} as Record<string, number>
          ),
        },
        taskTrends: taskTrends.reduce(
          (acc, item) => ({ ...acc, [item.status]: item._count }),
          {} as Record<string, number>
        ),
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Reporting GET error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}

