import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

/**
 * GET /api/revenue/report
 * Get detailed revenue and expense report with date filters
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tokenUser } = auth;
    const { searchParams } = new URL(request.url);
    
    // Date filters
    const fromDate = searchParams.get('from') 
      ? new Date(searchParams.get('from')!) 
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1); // Start of current month
    
    const toDate = searchParams.get('to') 
      ? new Date(searchParams.get('to')!) 
      : new Date(); // Today

    // Ensure toDate includes the full day
    toDate.setHours(23, 59, 59, 999);

    // Get revenue from completed/approved tasks
    const revenueTasks = await prisma.task.findMany({
      where: {
        companyId: tokenUser.companyId,
        status: {
          in: ['APPROVED', 'SUBMITTED' , 'COMPLETED' , 'ARCHIVED'],
        },
        scheduledDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        id: true,
        title: true,
        budget: true,
        status: true,
        scheduledDate: true,
        property: {
          select: {
            address: true,
          },
        },
      },
      orderBy: {
        scheduledDate: 'desc',
      },
    });

    // Get expenses
    const expenses = await prisma.expense.findMany({
      where: {
        companyId: tokenUser.companyId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        id: true,
        amount: true,
        category: true,
        description: true,
        createdAt: true,
        task: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate totals
    const totalRevenue = revenueTasks.reduce((sum, task) => {
      return sum + (task.budget ? Number(task.budget) : 0);
    }, 0);

    const totalExpenses = expenses.reduce((sum, expense) => {
      return sum + Number(expense.amount);
    }, 0);

    const netProfit = totalRevenue - totalExpenses;

    // Group by date for chart data
    const revenueByDate: { [key: string]: number } = {};
    const expensesByDate: { [key: string]: number } = {};

    revenueTasks.forEach((task) => {
      if (task.scheduledDate) {
        const dateKey = new Date(task.scheduledDate).toISOString().split('T')[0];
        revenueByDate[dateKey] = (revenueByDate[dateKey] || 0) + (task.budget ? Number(task.budget) : 0);
      }
    });

    expenses.forEach((expense) => {
      const dateKey = new Date(expense.createdAt).toISOString().split('T')[0];
      expensesByDate[dateKey] = (expensesByDate[dateKey] || 0) + Number(expense.amount);
    });

    // Generate all dates in range for chart
    const allDates: string[] = [];
    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Prepare chart data
    const chartData = allDates.map((date) => ({
      date,
      revenue: revenueByDate[date] || 0,
      expenses: expensesByDate[date] || 0,
      profit: (revenueByDate[date] || 0) - (expensesByDate[date] || 0),
    }));

    // Group by category for expenses breakdown
    const expensesByCategory: { [key: string]: number } = {};
    expenses.forEach((expense) => {
      expensesByCategory[expense.category] = (expensesByCategory[expense.category] || 0) + Number(expense.amount);
    });

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalExpenses,
          netProfit,
          revenueTasksCount: revenueTasks.length,
          expensesCount: expenses.length,
        },
        revenue: revenueTasks.map((task) => ({
          id: task.id,
          title: task.title,
          amount: task.budget ? Number(task.budget) : 0,
          status: task.status,
          date: task.scheduledDate,
          propertyAddress: task.property?.address || 'N/A',
        })),
        expenses: expenses.map((expense) => ({
          id: expense.id,
          amount: Number(expense.amount),
          category: expense.category,
          description: expense.description,
          date: expense.createdAt,
          taskTitle: expense.task?.title || null,
        })),
        chartData,
        expensesByCategory: Object.entries(expensesByCategory).map(([category, amount]) => ({
          category,
          amount,
        })),
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Error generating revenue report:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

