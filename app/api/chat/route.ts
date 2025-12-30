import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  const otherUserId = searchParams.get('otherUserId');

  try {
    const where: any = {
      OR: [
        { senderId: tokenUser.userId },
        { receiverId: tokenUser.userId },
      ],
    };

    if (taskId) where.taskId = Number(taskId);
    if (otherUserId) {
      where.OR = [
        { senderId: tokenUser.userId, receiverId: Number(otherUserId) },
        { senderId: Number(otherUserId), receiverId: tokenUser.userId },
      ];
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    // Mark messages as read
    await prisma.chatMessage.updateMany({
      where: {
        receiverId: tokenUser.userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    console.error('Chat GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const body = await request.json();
    const { taskId, receiverId, message } = body;

    const chatMessage = await prisma.chatMessage.create({
      data: {
        taskId: taskId ? Number(taskId) : null,
        senderId: tokenUser.userId,
        receiverId: Number(receiverId),
        message,
        isRead: false,
      },
      include: {
        sender: { select: { firstName: true, lastName: true } },
        receiver: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ success: true, data: chatMessage }, { status: 201 });
  } catch (error) {
    console.error('Chat POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
