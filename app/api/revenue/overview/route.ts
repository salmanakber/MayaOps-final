import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

/**
 * GET /api/revenue/overview
 * Get revenue overview with monthly revenue and percentage change
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tokenUser } = auth;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : new Date().getMonth();
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear();

    // Current month date range
    const currentMonthStart = new Date(year, month, 1);
    const currentMonthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // Previous month date range (for comparison)
    const previousMonthStart = new Date(year, month - 1, 1);
    const previousMonthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    // Get current month tasks (only APPROVED or SUBMITTED)
    const currentMonthTasks = await prisma.task.findMany({
      where: {
        companyId: tokenUser.companyId,
        status: {
          in: ['APPROVED', 'SUBMITTED', 'COMPLETED'],
        },
        scheduledDate: {
          gte: currentMonthStart,
          lte: currentMonthEnd,
        },
      },
      select: {
        budget: true,
        status: true,
      },
    });

    // Get previous month tasks (only APPROVED or SUBMITTED)
    const previousMonthTasks = await prisma.task.findMany({
      where: {
        companyId: tokenUser.companyId,
        status: {
          in: ['APPROVED', 'SUBMITTED', 'COMPLETED'],
        },
        scheduledDate: {
          gte: previousMonthStart,
          lte: previousMonthEnd,
        },
      },
      select: {
        budget: true,
        status: true,
      },
    });

    // Calculate current month revenue
    const currentMonthRevenue = currentMonthTasks.reduce((sum, task) => {
      return sum + (task.budget ? Number(task.budget) : 0);
    }, 0);

    // Calculate previous month revenue
    const previousMonthRevenue = previousMonthTasks.reduce((sum, task) => {
      return sum + (task.budget ? Number(task.budget) : 0);
    }, 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (previousMonthRevenue > 0) {
      percentageChange = ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100;
    } else if (currentMonthRevenue > 0) {
      percentageChange = 100; // 100% increase from 0
    }

    return NextResponse.json({
      success: true,
      data: {
        currentMonthRevenue,
        previousMonthRevenue,
        percentageChange: parseFloat(percentageChange.toFixed(2)),
        isIncrease: percentageChange >= 0,
        month,
        year,
        currentMonthTasksCount: currentMonthTasks.length,
        previousMonthTasksCount: previousMonthTasks.length,
      },
    });
  } catch (error: any) {
    console.error('Error calculating revenue overview:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

