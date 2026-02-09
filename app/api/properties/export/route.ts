import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only allow COMPANY_ADMIN, MANAGER, OWNER, DEVELOPER, SUPER_ADMIN
  if (
    role !== UserRole.COMPANY_ADMIN &&
    role !== UserRole.MANAGER &&
    role !== UserRole.OWNER &&
    role !== UserRole.DEVELOPER &&
    role !== UserRole.SUPER_ADMIN
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    // Get company ID
    let companyId: number | null = null;
    const { searchParams } = new URL(request.url);
    const companyIdParam = searchParams.get('companyId');

    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      companyId = companyIdParam ? parseInt(companyIdParam) : tokenUser.companyId || null;
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'companyId is required' }, { status: 400 });
      }
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    // Get all active properties for the company
    const properties = await prisma.property.findMany({
      where: {
        companyId,
        isActive: true,
      },
      orderBy: { id: 'asc' },
    });

    // Create CSV with template columns
    const headers = [
      'Property_ID',
      'Property Address',
      'Post Code',
      'Property Type',
      'Unit Count',
      'Notes',
    ];

    const rows = properties.map(property => [
      // @ts-ignore - Field exists in schema but types may not be updated
      property.sheetUniqueColumn || property.id.toString(), // Use sheetUniqueColumn if available, else use DB id
      property.address || '',
      property.postcode || '',
      property.propertyType || '',
      property.unitCount?.toString() || '1',
      property.notes || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="properties-export-${Date.now()}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting properties:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to export properties' 
    }, { status: 500 });
  }
}
