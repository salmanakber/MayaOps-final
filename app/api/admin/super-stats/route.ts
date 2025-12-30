import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  if (tokenUser.role !== UserRole.SUPER_ADMIN && tokenUser.role !== UserRole.ADMIN_UNIQUE) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const totalCompanies = await prisma.company.count();
    const totalUsers = await prisma.user.count();
    const totalProperties = await prisma.property.count();
    const activeTasks = await prisma.task.count({
      where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
    });

    const billingRecords = await prisma.billingRecord.findMany({
      where: { status: 'active' },
    });

    const totalRevenue = billingRecords.reduce((sum, r) => sum + Number(r.amountPaid), 0);

    return NextResponse.json({
      success: true,
      data: { totalCompanies, totalUsers, totalProperties, totalRevenue, activeTasks },
    });
  } catch (error) {
    console.error('Super stats error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
