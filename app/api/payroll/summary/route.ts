import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/**
 * GET /api/payroll/summary
 * Get summary totals for payroll (total paid, total pending, etc.)
 */
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

    // Filter by specific month/year if provided
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

    // Get all payroll records with the filter
    const payrollRecords = await prisma.payrollRecord.findMany({
      where,
      select: {
        status: true,
        netSalary: true,
        totalAmount: true,
      },
    });

    // Calculate totals
    const totalPaid = payrollRecords
      .filter(r => r.status === 'paid')
      .reduce((acc, r) => acc + Number(r.netSalary || r.totalAmount || 0), 0);
    
    const totalPending = payrollRecords
      .filter(r => r.status !== 'paid')
      .reduce((acc, r) => acc + Number(r.netSalary || r.totalAmount || 0), 0);
    
    const totalApproved = payrollRecords
      .filter(r => r.status === 'approved')
      .reduce((acc, r) => acc + Number(r.netSalary || r.totalAmount || 0), 0);
    
    const totalRecords = payrollRecords.length;
    const paidRecords = payrollRecords.filter(r => r.status === 'paid').length;
    const pendingRecords = payrollRecords.filter(r => r.status !== 'paid').length;

    return NextResponse.json({
      success: true,
      data: {
        totalPaid,
        totalPending,
        totalApproved,
        totalRecords,
        paidRecords,
        pendingRecords,
      },
    });
  } catch (error) {
    console.error('Payroll Summary GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
