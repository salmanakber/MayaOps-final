import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/**
 * POST /api/payroll/generate
 * Auto-generate payroll records for cleaners and managers based on completed tasks or fixed salary
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { startDate, endDate, includeManagers = false } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, message: 'startDate and endDate are required' }, { status: 400 });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const periodStart = new Date(startDate);
    const periodEnd = new Date(endDate);
    periodEnd.setHours(23, 59, 59, 999);

    // Get all cleaners and optionally managers
    const rolesToInclude = includeManagers 
      ? [UserRole.CLEANER, UserRole.MANAGER]
      : [UserRole.CLEANER];

    const employees = await prisma.user.findMany({
      where: {
        companyId,
        role: { in: rolesToInclude },
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });

    const payrollRecordsToCreate = [];
    const errors = [];

    for (const employee of employees) {
      try {
        // Check if payroll record already exists for this period
        const existing = await prisma.payrollRecord.findFirst({
          where: {
            userId: employee.id,
            periodStart: periodStart,
            periodEnd: periodEnd,
          },
        });

        if (existing) {
          errors.push(`Payroll already exists for ${employee.firstName} ${employee.lastName}`);
          continue;
        }

        // Check if employee has fixed salary (from most recent payroll record)
        const recentPayroll = await prisma.payrollRecord.findFirst({
          where: { userId: employee.id },
          orderBy: { createdAt: 'desc' },
          select: { payrollType: true, fixedSalary: true, hourlyRate: true },
        });

        const isFixedSalary = recentPayroll?.payrollType === 'fixed';

        if (isFixedSalary && recentPayroll?.fixedSalary) {
          // Fixed salary employee - use fixed salary amount
          payrollRecordsToCreate.push({
            userId: employee.id,
            companyId,
            periodStart,
            periodEnd,
            payrollType: 'fixed',
            hoursWorked: null,
            hourlyRate: null,
            fixedSalary: recentPayroll.fixedSalary,
            totalAmount: Number(recentPayroll.fixedSalary),
            status: 'pending',
          });
        } else {
          // Hourly employee - calculate from completed tasks
          const tasks = await prisma.task.findMany({
            where: {
              OR: [
                { assignedUserId: employee.id },
                {
                  taskAssignments: {
                    some: {
                      userId: employee.id,
                    },
                  },
                },
              ],
              companyId,
              scheduledDate: {
                gte: periodStart,
                lte: periodEnd,
              },
              status: {
                in: ['SUBMITTED', 'APPROVED'],
              },
            },
            select: {
              id: true,
              estimatedDurationMinutes: true,
              scheduledDate: true,
              status: true,
            },
          });

          // Calculate total hours worked
          let totalHours = 0;
          for (const task of tasks) {
            const hours = (task.estimatedDurationMinutes || 120) / 60;
            totalHours += hours;
          }

          if (totalHours === 0) {
            continue; // Skip if no hours worked
          }

          // Get hourly rate from recent payroll or use default
          let hourlyRate = 0;
          if (recentPayroll?.hourlyRate) {
            hourlyRate = Number(recentPayroll.hourlyRate);
          } else {
            // Default hourly rate (can be made configurable per company)
            hourlyRate = 12.50;
          }

          // Calculate regular hours (up to 40 per week)
          const weeksInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
          const averageWeeklyHours = totalHours / Math.max(weeksInPeriod, 1);
          
          let regularHours = totalHours;
          let overtimeHours = 0;
          
          if (averageWeeklyHours > 40) {
            // Calculate overtime
            const totalWeeks = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
            const regularHoursTotal = totalWeeks * 40;
            regularHours = Math.min(totalHours, regularHoursTotal);
            overtimeHours = Math.max(0, totalHours - regularHoursTotal);
          }

          const regularPay = regularHours * hourlyRate;
          const overtimePay = overtimeHours * hourlyRate * 1.5; // 1.5x for overtime
          const totalAmount = regularPay + overtimePay;

          payrollRecordsToCreate.push({
            userId: employee.id,
            companyId,
            periodStart,
            periodEnd,
            payrollType: 'hourly',
            hoursWorked: parseFloat(totalHours.toFixed(2)),
            hourlyRate,
            fixedSalary: null,
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            status: 'pending',
          });
        }
      } catch (error: any) {
        errors.push(`Error processing ${employee.firstName} ${employee.lastName}: ${error.message}`);
      }
    }

    if (payrollRecordsToCreate.length > 0) {
      await prisma.payrollRecord.createMany({
        data: payrollRecordsToCreate,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        created: payrollRecordsToCreate.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('Payroll generation error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
