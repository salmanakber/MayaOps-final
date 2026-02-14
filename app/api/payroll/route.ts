import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month'); // Format: YYYY-MM
  const year = searchParams.get('year'); // Format: YYYY

  try {
    const where: any = {};
    
    // Filter by role
    if (role === UserRole.CLEANER || role === UserRole.MANAGER) {
      where.userId = tokenUser.userId;
    } else if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      where.companyId = tokenUser.companyId;
    }

    // Filter by specific month/year if provided, otherwise show all records
    if (month || year) {
      const yearNum = year ? parseInt(year) : new Date().getFullYear();
      const monthNum = month ? parseInt(month.split('-')[1]) - 1 : new Date().getMonth();
      const startOfMonth = new Date(yearNum, monthNum, 1);
      const endOfMonth = new Date(yearNum, monthNum + 1, 0, 23, 59, 59, 999);
      
      where.periodStart = {
        lte: endOfMonth,
      };
      where.periodEnd = {
        gte: startOfMonth,
      };
    }
    // If no month/year provided, show all records (no date filter)

    const payrollRecords = await prisma.payrollRecord.findMany({
      where,
      include: {
        user: { 
          select: { 
            firstName: true, 
            lastName: true, 
            email: true,
            role: true,
          } 
        },
      },
      orderBy: { periodEnd: 'desc' },
    });
    

    return NextResponse.json({ success: true, data: payrollRecords });
  } catch (error) {
    console.error('Payroll GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

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
      userId, 
      periodStart, 
      periodEnd, 
      payrollType = 'hourly', // 'hourly' or 'fixed'
      hoursWorked, 
      hourlyRate,
      fixedSalary,
      // HR Fields
      hraAllowance,
      transportAllowance,
      bonus,
      otherAllowances,
      overtimeHours,
      overtimeRate,
      incomeTax,
      socialSecurity,
      insurance,
      loanRepayment,
      unpaidLeaveDeduction,
      otherDeductions,
      paymentDate,
      bankAccountNumber,
      bankName,
      bankSortCode,
      paymentMethod,
    } = body;

    if (!userId || !periodStart || !periodEnd) {
      return NextResponse.json({ success: false, message: 'userId, periodStart, and periodEnd are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { companyId: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    // Calculate basic salary/amount
    let basicAmount = 0;
    
    if (payrollType === 'fixed') {
      basicAmount = Number(fixedSalary) || 0;
    } else {
      // Hourly payroll
      const finalHoursWorked = Number(hoursWorked) || 0;
      const finalHourlyRate = Number(hourlyRate) || 0;
      if (!finalHoursWorked || !finalHourlyRate) {
        return NextResponse.json({ success: false, message: 'hoursWorked and hourlyRate are required for hourly payroll' }, { status: 400 });
      }
      basicAmount = finalHoursWorked * finalHourlyRate;
    }

    // Calculate allowances
    const hra = Number(hraAllowance) || 0;
    const transport = Number(transportAllowance) || 0;
    const bonusAmount = Number(bonus) || 0;
    const otherAllow = Number(otherAllowances) || 0;
    const totalAllowances = hra + transport + bonusAmount + otherAllow;

    // Calculate overtime
    const otHours = Number(overtimeHours) || 0;
    const otRate = Number(overtimeRate) || (payrollType === 'hourly' ? Number(hourlyRate) * 1.5 : 0);
    const otAmount = otHours * otRate;

    // Calculate gross salary
    const grossSalary = basicAmount + totalAllowances + otAmount;

    // Calculate deductions
    const tax = Number(incomeTax) || 0;
    const socialSec = Number(socialSecurity) || 0;
    const ins = Number(insurance) || 0;
    const loan = Number(loanRepayment) || 0;
    const unpaidLeave = Number(unpaidLeaveDeduction) || 0;
    const otherDed = Number(otherDeductions) || 0;
    const totalDeductions = tax + socialSec + ins + loan + unpaidLeave + otherDed;

    // Calculate net salary
    const netSalary = Math.max(0, grossSalary - totalDeductions);

    const payrollRecord = await prisma.payrollRecord.create({
      data: {
        userId: Number(userId),
        companyId: user.companyId!,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        payrollType,
        hoursWorked: payrollType === 'hourly' ? Number(hoursWorked) : null,
        hourlyRate: payrollType === 'hourly' ? Number(hourlyRate) : null,
        fixedSalary: payrollType === 'fixed' ? Number(fixedSalary) : null,
        totalAmount: netSalary, // Store net salary as totalAmount for backward compatibility
        status: 'pending',
        // HR Fields - using type assertion for new fields
        ...(hra ? { hraAllowance: hra } : {}),
        ...(transport ? { transportAllowance: transport } : {}),
        ...(bonusAmount ? { bonus: bonusAmount } : {}),
        ...(otherAllow ? { otherAllowances: otherAllow } : {}),
        ...(otHours ? { overtimeHours: otHours } : {}),
        ...(otRate ? { overtimeRate: otRate } : {}),
        ...(otAmount ? { overtimeAmount: otAmount } : {}),
        ...(grossSalary ? { grossSalary } : {}),
        ...(tax ? { incomeTax: tax } : {}),
        ...(socialSec ? { socialSecurity: socialSec } : {}),
        ...(ins ? { insurance: ins } : {}),
        ...(loan ? { loanRepayment: loan } : {}),
        ...(unpaidLeave ? { unpaidLeaveDeduction: unpaidLeave } : {}),
        ...(otherDed ? { otherDeductions: otherDed } : {}),
        ...(totalDeductions ? { totalDeductions } : {}),
        ...(netSalary ? { netSalary } : {}),
        ...(paymentDate ? { paymentDate: new Date(paymentDate) } : {}),
        ...(bankAccountNumber ? { bankAccountNumber } : {}),
        ...(bankName ? { bankName } : {}),
        ...(bankSortCode ? { bankSortCode } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
      } as any,
    });

    return NextResponse.json({ success: true, data: payrollRecord }, { status: 201 });
  } catch (error) {
    console.error('Payroll POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
