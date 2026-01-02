import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/**
 * GET /api/payroll/preview
 * Preview working hours for employees before generating payroll
 * Shows working hours submissions with status (pending, approved, rejected)
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('periodStart');
    const endDate = searchParams.get('periodEnd');
    const userIds = searchParams.get('userIds'); // Comma-separated user IDs

    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, message: 'periodStart and periodEnd are required' }, { status: 400 });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const periodStart = new Date(startDate);
    const periodEnd = new Date(endDate);
    periodEnd.setHours(23, 59, 59, 999);

    // Get employees - either selected userIds or all cleaners
    let employeeIds: number[] = [];
    if (userIds) {
      employeeIds = userIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    }

    const whereCondition: any = {
      companyId,
      isActive: true,
    };

    if (employeeIds.length > 0) {
      whereCondition.id = { in: employeeIds };
    } else {
      whereCondition.role = UserRole.CLEANER;
    }

    const employees = await prisma.user.findMany({
      where: whereCondition,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });

    // Get working hours submissions for all employees in the period
    const workingHoursSubmissions = await prisma.workingHoursSubmission.findMany({
      where: {
        userId: { in: employees.map(e => e.id) },
        date: {
          gte: periodStart,
          lte: periodEnd,
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

    // Group by user and calculate totals
    const preview = employees.map(employee => {
      const userSubmissions = workingHoursSubmissions.filter(wh => wh.userId === employee.id);
      
      const totalHours = userSubmissions.reduce((sum, wh) => sum + Number(wh.hours), 0);
      const approvedHours = userSubmissions
        .filter(wh => wh.status === 'approved')
        .reduce((sum, wh) => sum + Number(wh.hours), 0);
      const pendingHours = userSubmissions
        .filter(wh => wh.status === 'pending')
        .reduce((sum, wh) => sum + Number(wh.hours), 0);
      const rejectedHours = userSubmissions
        .filter(wh => wh.status === 'rejected')
        .reduce((sum, wh) => sum + Number(wh.hours), 0);
      const paidHours = userSubmissions
        .filter(wh => wh.status === 'paid')
        .reduce((sum, wh) => sum + Number(wh.hours), 0);

      // Check if payroll already exists
      let existingPayroll = null;

      return {
        userId: employee.id,
        user: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
        },
        submissions: userSubmissions.map(wh => ({
          id: wh.id,
          date: wh.date.toISOString(),
          hours: Number(wh.hours),
          status: wh.status,
          description: wh.description,
          tasks: wh.tasks.map(t => ({
            taskId: t.taskId,
            task: t.task,
          })),
        })),
        totals: {
          totalHours,
          approvedHours,
          pendingHours,
          rejectedHours,
          paidHours,
          submissionCount: userSubmissions.length,
        },
        existingPayroll,
      };
    });

    // Check for existing payroll records
    const existingPayrollRecords = await prisma.payrollRecord.findMany({
      where: {
        userId: { in: employees.map(e => e.id) },
        periodStart: periodStart,
        periodEnd: periodEnd,
      },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    // Add existing payroll info to preview
    const previewWithPayroll = preview.map(p => {
      const existing = existingPayrollRecords.find(pr => pr.userId === p.userId);
      return {
        ...p,
        existingPayroll: existing ? {
          id: existing.id,
          status: existing.status,
        } : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        employees: previewWithPayroll,
      },
    });
  } catch (error: any) {
    console.error('Error previewing working hours:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}

