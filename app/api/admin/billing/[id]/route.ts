import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// PATCH /api/admin/billing/[id] - Update billing record
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.ADMIN_UNIQUE) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
    }

    const body = await request.json();
    const { status, amountPaid, amountDue, billingDate, nextBillingDate } = body;

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (amountPaid !== undefined) data.amountPaid = amountPaid;
    if (amountDue !== undefined) data.amountDue = amountDue;
    if (billingDate !== undefined) data.billingDate = billingDate ? new Date(billingDate) : null;
    if (nextBillingDate !== undefined) data.nextBillingDate = nextBillingDate ? new Date(nextBillingDate) : null;

    const billing = await prisma.billingRecord.update({
      where: { id },
      data,
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: billing.id,
        companyId: billing.companyId,
        company: billing.company,
        status: billing.status,
        amountPaid: Number(billing.amountPaid),
        amountDue: Number(billing.amountDue),
        billingDate: billing.billingDate?.toISOString(),
        nextBillingDate: billing.nextBillingDate?.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Billing PATCH error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update billing' }, { status: 500 });
  }
}

// DELETE /api/admin/billing/[id] - Delete billing record
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.ADMIN_UNIQUE) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
    }

    await prisma.billingRecord.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Billing record deleted' });
  } catch (error: any) {
    console.error('Billing DELETE error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete billing' }, { status: 500 });
  }
}

