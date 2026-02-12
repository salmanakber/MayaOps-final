import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { type NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';

// GET /api/admin/support-tickets/unread-count
// Returns the number of open support tickets (used for admin menu badge).
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

    // Count tickets that are still open (treat these as "unread/new")
    // @ts-ignore - SupportTicket model exists in Prisma schema but types may need regeneration
    const count = await prisma.supportTicket.count({
      where: {
        status: 'open',
      },
    });

    return NextResponse.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Error fetching unread support ticket count:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch unread support ticket count' },
      { status: 500 }
    );
  }
}

