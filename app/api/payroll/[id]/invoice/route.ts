import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { generatePayrollInvoicePDF } from '@/lib/pdf-generator';

/**
 * GET /api/payroll/[id]/invoice
 * Generate and return invoice PDF URL for a payroll record
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const { tokenUser } = auth;

    // Users can only access their own payroll invoices, or managers/owners can access any in their company
    const payrollRecord = await prisma.payrollRecord.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        company: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!payrollRecord) {
      return NextResponse.json({ success: false, message: 'Payroll record not found' }, { status: 404 });
    }

    // Type assertion to include invoiceUrl (Prisma client types may be out of date)
    const payroll = payrollRecord as typeof payrollRecord & { invoiceUrl?: string | null };

    // Check access: cleaners can only see their own, managers/owners can see their company's
    const isOwnRecord = payroll.userId === tokenUser.userId;
    const isCompanyRecord = payroll.companyId === tokenUser.companyId;
    const isAuthorized = isOwnRecord || isCompanyRecord || 
                        ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER'].includes(tokenUser.role);

    if (!isAuthorized) {
      return NextResponse.json({ success: false, message: 'Not authorized to access this invoice' }, { status: 403 });
    }

    // If invoice already exists, return it
    if (payroll.invoiceUrl) {
      return NextResponse.json({
        success: true,
        data: {
          invoiceUrl: payroll.invoiceUrl,
          payrollRecordId: payroll.id,
          downloadUrl: `${process.env.NEXT_PUBLIC_API_URL}/api/payroll/${payroll.id}/invoice/download`,
        },
      });
    }

    // Generate invoice PDF
    const result = await generatePayrollInvoicePDF({
      id: payroll.id,
      user: payroll.user,
      company: payroll.company,
      periodStart: payroll.periodStart,
      periodEnd: payroll.periodEnd,
      payrollType: payroll.payrollType,
      hoursWorked: payroll.hoursWorked ? Number(payroll.hoursWorked) : null,
      hourlyRate: payroll.hourlyRate ? Number(payroll.hourlyRate) : null,
      fixedSalary: payroll.fixedSalary ? Number(payroll.fixedSalary) : null,
      totalAmount: Number(payroll.totalAmount),
      status: payroll.status,
      paidAt: payroll.paidAt,
    });

    if (!result.success || !result.pdfUrl) {
      return NextResponse.json({
        success: false,
        message: result.error || 'Failed to generate invoice',
      }, { status: 500 });
    }

    // Update payroll record with invoice URL
    await prisma.payrollRecord.update({
      where: { id: payroll.id },
      data: { invoiceUrl: result.pdfUrl } as any, // Type assertion for invoiceUrl
    });

    return NextResponse.json({
      success: true,
      data: {
        invoiceUrl: result.pdfUrl,
        payrollRecordId: payroll.id,
        downloadUrl: `${process.env.NEXT_PUBLIC_API_URL}/api/payroll/${payroll.id}/invoice/download`,
      },
    });
  } catch (error: any) {
    console.error('Error generating payroll invoice:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

