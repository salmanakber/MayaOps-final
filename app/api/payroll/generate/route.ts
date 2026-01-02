import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createNotification } from '@/lib/notifications';

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
    const { 
      periodStart: startDate, 
      periodEnd: endDate, 
      userIds, // Array of user IDs to generate payroll for
      fixedSalary, // Fixed salary amount (used when multiple users selected or single user with fixed salary)
      payrollType, // 'hourly' or 'fixed' - explicitly set by user
      hourlyRate, // Hourly rate for hourly employees
    } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, message: 'periodStart and periodEnd are required' }, { status: 400 });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const periodStart = new Date(startDate);
    const periodEnd = new Date(endDate);
    periodEnd.setHours(23, 59, 59, 999);

    // Get employees - either selected userIds or all cleaners/managers
    let employees;
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      employees = await prisma.user.findMany({
        where: {
          id: { in: userIds.map((id: any) => parseInt(id)) },
          companyId,
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
    } else {
      // Default: get all cleaners
      employees = await prisma.user.findMany({
        where: {
          companyId,
          role: UserRole.CLEANER,
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
    }

    if (employees.length === 0) {
      return NextResponse.json({ success: false, message: 'No employees found' }, { status: 400 });
    }

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

        // Determine payroll type and amount
        let finalPayrollType: 'hourly' | 'fixed' = 'hourly';
        let finalFixedSalary: number | null = null;
        let finalHourlyRate: number | null = null;
        let totalHours = 0;
        let totalAmount = 0;

        // If payrollType is explicitly provided, use it
        if (payrollType === 'fixed') {
          finalPayrollType = 'fixed';
          if (!fixedSalary || fixedSalary <= 0) {
            errors.push(`Fixed salary required for ${employee.firstName} ${employee.lastName}`);
            continue;
          }
          finalFixedSalary = Number(fixedSalary);
          totalAmount = finalFixedSalary;
        } else {
          // Hourly payroll - use submitted working hours
          finalPayrollType = 'hourly';

          // Get working hours submissions for the period (approved and pending, exclude paid)
          const workingHours = await prisma.workingHoursSubmission.findMany({
            where: {
              userId: employee.id,
              date: {
                gte: periodStart,
                lte: periodEnd,
              },
              status: { in: ['approved', 'pending'] }, // Count both approved and pending hours (exclude paid)
            },
            select: {
              hours: true,
              status: true,
            },
          });

          // Calculate total hours from submissions
          totalHours = workingHours.reduce((sum, wh) => sum + Number(wh.hours), 0);

          // If no submitted hours, skip (or use 0)
          if (totalHours === 0) {
            errors.push(`No working hours submitted for ${employee.firstName} ${employee.lastName} in this period`);
            continue;
          }

          // Warn if there are pending hours
          const pendingHoursCount = workingHours.filter(wh => wh.status === 'pending').length;
          if (pendingHoursCount > 0) {
            console.log(`⚠️ Warning: ${pendingHoursCount} pending working hours submissions for ${employee.firstName} ${employee.lastName} - including in payroll calculation`);
          }

          // Get hourly rate
          if (hourlyRate && hourlyRate > 0) {
            finalHourlyRate = Number(hourlyRate);
          } else {
            // Try to get from most recent payroll record
            const recentPayroll = await prisma.payrollRecord.findFirst({
              where: { userId: employee.id },
              orderBy: { createdAt: 'desc' },
              select: { hourlyRate: true },
            });
            finalHourlyRate = recentPayroll?.hourlyRate ? Number(recentPayroll.hourlyRate) : 12.50; // Default
          }

          // Calculate amount (with overtime if applicable)
          const weeksInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
          const averageWeeklyHours = totalHours / Math.max(weeksInPeriod, 1);
          
          let regularHours = totalHours;
          let overtimeHours = 0;
          
          if (averageWeeklyHours > 40) {
            const totalWeeks = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
            const regularHoursTotal = totalWeeks * 40;
            regularHours = Math.min(totalHours, regularHoursTotal);
            overtimeHours = Math.max(0, totalHours - regularHoursTotal);
          }

          const regularPay = regularHours * finalHourlyRate;
          const overtimePay = overtimeHours * finalHourlyRate * 1.5; // 1.5x for overtime
          totalAmount = regularPay + overtimePay;
        }

        payrollRecordsToCreate.push({
          userId: employee.id,
          companyId,
          periodStart,
          periodEnd,
          payrollType: finalPayrollType,
          hoursWorked: finalPayrollType === 'hourly' ? parseFloat(totalHours.toFixed(2)) : null,
          hourlyRate: finalPayrollType === 'hourly' ? finalHourlyRate : null,
          fixedSalary: finalPayrollType === 'fixed' ? finalFixedSalary : null,
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          status: 'pending',
          // Store employee info for expense creation
          employeeFirstName: employee.firstName,
          employeeLastName: employee.lastName,
        } as any);
      } catch (error: any) {
        errors.push(`Error processing ${employee.firstName} ${employee.lastName}: ${error.message}`);
      }
    }

    if (payrollRecordsToCreate.length > 0) {
      // Create payroll records and corresponding expense entries
      const createdPayrollRecords = [];
      
      for (const payrollDataWithEmployee of payrollRecordsToCreate) {
        const { employeeFirstName, employeeLastName, ...payrollData } = payrollDataWithEmployee as any;

        try {
          // Create payroll record
          const payrollRecord = await prisma.payrollRecord.create({
            data: payrollData,
          });

          // Create corresponding expense entry for each payroll record
          try {
            const periodDescription = `${employeeFirstName} ${employeeLastName} - Payroll for period ${new Date(periodStart).toLocaleDateString('en-GB')} to ${new Date(periodEnd).toLocaleDateString('en-GB')}`;
            
            const expense = await prisma.expense.create({
              data: {
                userId: payrollData.userId,
                companyId: payrollData.companyId,
                taskId: null, // Payroll is not tied to a specific task
                category: 'Payroll',
                amount: payrollData.totalAmount,
                description: periodDescription,
                receiptUrl: null,
                status: 'pending', // Match payroll status
              },
            });

            console.log(`✅ Created expense entry (ID: ${expense.id}) for payroll record (ID: ${payrollRecord.id})`);
          } catch (expenseError: any) {
            console.error(`❌ Error creating expense for payroll ${payrollRecord.id}:`, expenseError);
            // Don't fail payroll creation if expense creation fails, but log it
            errors.push(`Warning: Payroll created but expense entry failed for ${employeeFirstName} ${employeeLastName}`);
          }

          // Send notification to the employee about new payroll record
          try {
            const startDateStr = new Date(periodStart).toLocaleDateString('en-GB');
            const endDateStr = new Date(periodEnd).toLocaleDateString('en-GB');
            
            await createNotification({
              userId: payrollData.userId,
              title: 'New Payroll Generated',
              message: `A payroll record has been generated for you for the period ${startDateStr} to ${endDateStr}. Amount: £${Number(payrollData.totalAmount).toFixed(2)}`,
              type: 'payment_alert',
              metadata: {
                payrollRecordId: payrollRecord.id,
                status: 'pending',
                amount: Number(payrollData.totalAmount),
              },
              screenRoute: 'Payroll',
              screenParams: { payrollRecordId: payrollRecord.id },
            });

            console.log(`✅ Sent payroll generation notification to user ${payrollData.userId}`);
          } catch (notifError) {
            console.error(`Error sending payroll generation notification to user ${payrollData.userId}:`, notifError);
            // Don't fail payroll creation if notification fails
          }

          createdPayrollRecords.push(payrollRecord);
        } catch (payrollError: any) {
          console.error(`❌ Error creating payroll record:`, payrollError);
          errors.push(`Error creating payroll for ${employeeFirstName} ${employeeLastName}: ${payrollError.message}`);
        }
      }

      console.log(`✅ Created ${createdPayrollRecords.length} payroll record(s) with expense entries`);
    }

    return NextResponse.json({
      success: true,
      data: {
        generated: payrollRecordsToCreate.length,
        records: payrollRecordsToCreate.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    }, { status: 200 });
  } catch (error) {
    console.error('Payroll generation error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
