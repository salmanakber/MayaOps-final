import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1️⃣ Authenticate user
  const auth = requireAuth(request);
  if (!auth) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await params;
    const payrollId = parseInt(id);
    const { tokenUser } = auth;

    if (isNaN(payrollId)) {
      return new NextResponse('Invalid payroll ID', { status: 400 });
    }

    // 2️⃣ Fetch payroll record
    const payroll = await prisma.payrollRecord.findUnique({
      where: { id: payrollId },
      include: {
        user: {
          select: {
            id: true,
            companyId: true,
          },
        },
      },
    });

    if (!payroll || !payroll.invoiceUrl) {
      return new NextResponse('Invoice not found', { status: 404 });
    }

    // 3️⃣ Authorization: only owner / manager / company admin / developer can download
    const isOwnRecord = payroll.userId === tokenUser.userId;
    const isCompanyRecord = payroll.companyId === tokenUser.companyId;
    const isAuthorized =
      isOwnRecord || 
      isCompanyRecord || 
      ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(tokenUser.role);

    if (!isAuthorized) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // 4️⃣ Fetch PDF from Cloudinary
    const cloudinaryRes = await fetch(payroll.invoiceUrl);
    if (!cloudinaryRes.ok) {
      console.error('Failed to fetch invoice from Cloudinary:', payroll.invoiceUrl);
      return new NextResponse('Failed to fetch invoice from storage', { status: 500 });
    }
    const pdfBuffer = await cloudinaryRes.arrayBuffer();

    // 5️⃣ Return PDF with proper filename
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payroll-${payrollId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Error downloading payroll invoice:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}



