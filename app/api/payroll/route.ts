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

    // Filter by current month if no specific month/year provided
    if (!month && !year) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      where.periodStart = {
        lte: endOfMonth,
      };
      where.periodEnd = {
        gte: startOfMonth,
      };
    } else {
      // Filter by specific month/year
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

    let totalAmount = 0;
    
    if (payrollType === 'fixed') {
      if (!fixedSalary) {
        return NextResponse.json({ success: false, message: 'fixedSalary is required for fixed payroll' }, { status: 400 });
      }
      totalAmount = Number(fixedSalary);
    } else {
      // Hourly payroll
      if (!hoursWorked || !hourlyRate) {
        return NextResponse.json({ success: false, message: 'hoursWorked and hourlyRate are required for hourly payroll' }, { status: 400 });
      }
      totalAmount = Number(hoursWorked) * Number(hourlyRate);
    }

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
        totalAmount,
        status: 'pending',
      },
    });

    return NextResponse.json({ success: true, data: payrollRecord }, { status: 201 });
  } catch (error) {
    console.error('Payroll POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
