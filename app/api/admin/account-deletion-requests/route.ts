import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { type NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';

// GET /api/admin/account-deletion-requests
// List account deletion requests for admins, with optional status filter and pagination.
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
    const status = searchParams.get('status'); // "pending", "cancelled", "processed"
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [requests, total] = await Promise.all([
      prisma.accountDeletionRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              companyId: true,
            },
          },
        },
      }),
      prisma.accountDeletionRequest.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        requests,
        total,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error('Error fetching account deletion requests:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch account deletion requests' },
      { status: 500 }
    );
  }
}

