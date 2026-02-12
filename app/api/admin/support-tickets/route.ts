import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { type NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';

// GET /api/admin/support-tickets
// List support tickets for admins, with optional status filter and basic pagination.
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole;

    if (
      role !== UserRole.SUPER_ADMIN &&
      role !== UserRole.OWNER &&
      role !== UserRole.DEVELOPER &&
      role !== UserRole.COMPANY_ADMIN &&
      role !== UserRole.MANAGER
    ) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [tickets, total] = await Promise.all([
      // @ts-ignore - SupportTicket model exists in Prisma schema but types may need regeneration
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      // @ts-ignore - SupportTicket model exists in Prisma schema but types may need regeneration
      prisma.supportTicket.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tickets,
        total,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch support tickets' },
      { status: 500 }
    );
  }
}

