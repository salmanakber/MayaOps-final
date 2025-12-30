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
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyIdParam = searchParams.get('companyId');
    console.log('companyIdParam 121', searchParams);

    let companyId: number | null = null;
    if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
      companyId = requireCompanyScope(tokenUser);
      if (companyIdParam) {
        companyId = parseInt(companyIdParam);
      }
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (startDate) where.createdAt = { gte: new Date(startDate) };
    if (endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(endDate) };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        property: { select: { address: true } },
        assignedUser: { select: { firstName: true, lastName: true, email: true } },
        photos: { select: { photoType: true } },
        notes: { select: { noteType: true, severity: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      const headers = [
        'Task ID',
        'Title',
        'Status',
        'Property',
        'Assigned To',
        'Scheduled Date',
        'Completed Date',
        'Photos (Before/After)',
        'Issues',
        'Created At',
      ];

      const rows = tasks.map(task => [
        task.id,
        task.title,
        task.status,
        task.property?.address || 'N/A',
        task.assignedUser
          ? `${task.assignedUser.firstName} ${task.assignedUser.lastName}`
          : 'Unassigned',
        task.scheduledDate?.toISOString() || 'N/A',
        task.completedAt?.toISOString() || 'N/A',
        `${task.photos.filter(p => p.photoType === 'before').length}/${task.photos.filter(p => p.photoType === 'after').length}`,
        task.notes.filter(n => n.noteType === 'issue').length,
        task.createdAt.toISOString(),
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="tasks-export-${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error('Analytics export error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
