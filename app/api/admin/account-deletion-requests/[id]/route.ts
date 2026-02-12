import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { type NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';

// PATCH /api/admin/account-deletion-requests/[id]
// Update status and/or scheduledDeletionAt for an account deletion request.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
    }

    const body = await request.json();
    const { status, scheduledDeletionAt } = body || {};

    const existing = await prisma.accountDeletionRequest.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Account deletion request not found' },
        { status: 404 }
      );
    }

    const data: any = {};

    if (typeof status === 'string' && status.length > 0) {
      data.status = status;
      if (status === 'processed') {
        data.processedAt = new Date();
      }
      if (status === 'pending') {
        // If re-opening, do not override scheduledDeletionAt unless provided explicitly
      }
      if (status === 'cancelled') {
        // Keep scheduledDeletionAt as historical info
      }
    }

    if (scheduledDeletionAt) {
      const parsed = new Date(scheduledDeletionAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { success: false, message: 'Invalid scheduledDeletionAt date' },
          { status: 400 }
        );
      }
      data.scheduledDeletionAt = parsed;
    }

    const updated = await prisma.accountDeletionRequest.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Error updating account deletion request:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update account deletion request' },
      { status: 500 }
    );
  }
}

