import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { generateBillingInvoicePDF } from '@/lib/pdf-generator';

/**
 * GET /api/billing/[id]/invoice
 * Generate and return invoice PDF URL for a billing record
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const companyId = requireCompanyScope(auth.tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const billingRecord = await prisma.billingRecord.findFirst({
      where: {
        id: parseInt(id),
        companyId,
      },
      include: {
        company: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!billingRecord) {
      return NextResponse.json({ success: false, message: 'Billing record not found' }, { status: 404 });
    }

    // If invoice already exists, return it
    if (billingRecord.invoiceUrl) {
      return NextResponse.json({
        success: true,
        data: {
          invoiceUrl: billingRecord.invoiceUrl,
          billingRecordId: billingRecord.id,
        },
      });
    }

    // Generate invoice PDF
    const result = await generateBillingInvoicePDF({
      id: billingRecord.id,
      company: billingRecord.company,
      amountPaid: Number(billingRecord.amountPaid),
      amountDue: Number(billingRecord.amountDue),
      billingDate: billingRecord.billingDate,
      propertyCount: billingRecord.propertyCount,
      status: billingRecord.status,
      subscriptionId: billingRecord.subscriptionId,
    });

    if (!result.success || !result.pdfUrl) {
      return NextResponse.json({
        success: false,
        message: result.error || 'Failed to generate invoice',
      }, { status: 500 });
    }

    // Update billing record with invoice URL
    await prisma.billingRecord.update({
      where: { id: billingRecord.id },
      data: { invoiceUrl: result.pdfUrl },
    });

    return NextResponse.json({
      success: true,
      data: {
        invoiceUrl: result.pdfUrl,
        billingRecordId: billingRecord.id,
      },
    });
  } catch (error: any) {
    console.error('Error generating billing invoice:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

