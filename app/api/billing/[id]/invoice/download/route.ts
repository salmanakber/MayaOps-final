import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await params;
    const billingId = parseInt(id);
    const { tokenUser } = auth;
    const companyId = requireCompanyScope(tokenUser);

    if (isNaN(billingId)) {
      return new NextResponse('Invalid billing ID', { status: 400 });
    }

    // Fetch billing record
    const billingRecord = await prisma.billingRecord.findFirst({
      where: {
        id: billingId,
        companyId: companyId || undefined,
      },
    });

    if (!billingRecord || !billingRecord.invoiceUrl) {
      return new NextResponse('Invoice not found', { status: 404 });
    }

    // Fetch PDF from Cloudinary
    const cloudinaryRes = await fetch(billingRecord.invoiceUrl);
    if (!cloudinaryRes.ok) {
      console.error('Failed to fetch invoice from Cloudinary:', billingRecord.invoiceUrl);
      return new NextResponse('Failed to fetch invoice from storage', { status: 500 });
    }
    const pdfBuffer = await cloudinaryRes.arrayBuffer();

    // Return PDF with proper filename
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${billingId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Error downloading billing invoice:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
