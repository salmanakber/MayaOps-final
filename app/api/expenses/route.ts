import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const where: any = {};
    
    if (role === UserRole.CLEANER) {
      where.userId = tokenUser.userId;
    } else if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      where.companyId = tokenUser.companyId;
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true } },
        task: { select: { title: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: expenses });
  } catch (error) {
    console.error('Expenses GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const body = await request.json();
    const { taskId, category, amount, description, receiptUrl } = body;

    const user = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { companyId: true },
    });

    const expense = await prisma.expense.create({
      data: {
        userId: tokenUser.userId,
        companyId: user!.companyId!,
        taskId: taskId ? Number(taskId) : null,
        category,
        amount,
        description,
        receiptUrl,
        status: 'pending',
      },
    });

    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (error) {
    console.error('Expenses POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
