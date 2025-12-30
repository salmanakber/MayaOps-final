import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
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
      where.user = { companyId: tokenUser.companyId };
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: leaveRequests });
  } catch (error) {
    console.error('Leave GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const body = await request.json();
    const { startDate, endDate, reason } = body;

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: tokenUser.userId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        status: 'pending',
      },
    });

    return NextResponse.json({ success: true, data: leaveRequest }, { status: 201 });
  } catch (error) {
    console.error('Leave POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
