import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const notification = await prisma.notification.update({
      where: {
        id: Number(params.id),
        userId: tokenUser.userId,
      },
      data: {
        status: 'read',
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: notification });
  } catch (error) {
    console.error('Notification read error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
