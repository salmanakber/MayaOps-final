import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const body = await request.json();
    const { taskIds, date } = body;

    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds.map(Number) } },
      include: { property: true },
    });

    // Simple route optimization (can be enhanced with Google Maps Directions API)
    const optimizedOrder = tasks.map(t => t.id);
    const totalDistance = tasks.length * 5; // Mock calculation
    const totalDuration = tasks.length * 30; // Mock calculation

    const route = await prisma.route.create({
      data: {
        userId: tokenUser.userId,
        date: new Date(date),
        taskIds: JSON.stringify(taskIds),
        optimizedOrder: JSON.stringify(optimizedOrder),
        totalDistance,
        totalDuration,
      },
    });

    return NextResponse.json({ success: true, data: route }, { status: 201 });
  } catch (error) {
    console.error('Route optimization error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
