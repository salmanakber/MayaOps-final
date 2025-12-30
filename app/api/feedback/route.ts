import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    const where: any = {};
    if (taskId) where.taskId = Number(taskId);

    const feedback = await prisma.clientFeedback.findMany({
      where,
      include: {
        task: { select: { title: true, property: { select: { address: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: feedback });
  } catch (error) {
    console.error('Feedback GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, rating, comment, clientName, clientEmail } = body;

    if (!taskId || !rating) {
      return NextResponse.json(
        { success: false, message: 'taskId and rating are required' },
        { status: 400 }
      );
    }

    const feedback = await prisma.clientFeedback.create({
      data: {
        taskId: Number(taskId),
        rating: Number(rating),
        comment,
        clientName,
        clientEmail,
      },
    });

    return NextResponse.json({ success: true, data: feedback }, { status: 201 });
  } catch (error) {
    console.error('Feedback POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
