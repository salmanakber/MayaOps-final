import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { sendQAResultNotification } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  try {
    const where: any = {};
    if (taskId) where.taskId = Number(taskId);

    const qaScores = await prisma.qAScore.findMany({
      where,
      include: {
        task: { select: { title: true } },
        reviewer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: qaScores });
  } catch (error) {
    console.error('QA GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { taskId, overallScore, cleanlinessScore, timelinessScore, professionalismScore, comments } = body;

    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      include: {
        taskAssignments: {
          select: { userId: true },
        },
      },
    });

    const qaScore = await prisma.qAScore.create({
      data: {
        taskId: Number(taskId),
        reviewerId: tokenUser.userId,
        overallScore,
        cleanlinessScore,
        timelinessScore,
        professionalismScore,
        comments,
      },
    });

    // Send notifications to all assigned cleaners (including via taskAssignments)
    if (task) {
      const assignedUserIds: number[] = [];
      
      // Get cleaners from taskAssignments
      if (task.taskAssignments && task.taskAssignments.length > 0) {
        task.taskAssignments.forEach((ta) => {
          if (ta.userId && !assignedUserIds.includes(ta.userId)) {
            assignedUserIds.push(ta.userId);
          }
        });
      }
      
      // Also include assignedUserId for backward compatibility
      if (task.assignedUserId && !assignedUserIds.includes(task.assignedUserId)) {
        assignedUserIds.push(task.assignedUserId);
      }

      // Send notifications to all assigned cleaners
      for (const userId of assignedUserIds) {
        await sendQAResultNotification(
          Number(taskId),
          userId,
          overallScore >= 7,
          comments
        );
      }
    }

    return NextResponse.json({ success: true, data: qaScore }, { status: 201 });
  } catch (error) {
    console.error('QA POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
