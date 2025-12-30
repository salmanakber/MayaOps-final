import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  try {
    const targetUserId = userId ? Number(userId) : tokenUser.userId;

    const availability = await prisma.cleanerAvailability.findMany({
      where: { userId: targetUserId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return NextResponse.json({ success: true, data: availability });
  } catch (error) {
    console.error('Availability GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const body = await request.json();
    const { dayOfWeek, startTime, endTime, isAvailable } = body;

    const availability = await prisma.cleanerAvailability.create({
      data: {
        userId: tokenUser.userId,
        dayOfWeek,
        startTime,
        endTime,
        isAvailable: isAvailable ?? true,
      },
    });

    return NextResponse.json({ success: true, data: availability }, { status: 201 });
  } catch (error) {
    console.error('Availability POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
