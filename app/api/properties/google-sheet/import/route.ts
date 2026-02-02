import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { importPropertiesFromSheet, PropertyColumnMapping } from '@/lib/google-sheets-properties';

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const { 
      spreadsheetId, 
      sheetName, 
      columnMapping, 
      uniqueColumn,
      googleSheetUrl 
    } = body;

    if (!spreadsheetId || !sheetName || !columnMapping) {
      return NextResponse.json({ 
        success: false, 
        message: 'spreadsheetId, sheetName, and columnMapping are required' 
      }, { status: 400 });
    }

    // Get company ID
    let companyId: number | null = null;
    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      // For owners/developers, companyId should be in body or use tokenUser's companyId
      companyId = body.companyId || tokenUser.companyId || null;
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'companyId is required' }, { status: 400 });
      }
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    // Import properties from sheet
    const importResult = await importPropertiesFromSheet(
      companyId,
      spreadsheetId,
      sheetName,
      columnMapping as PropertyColumnMapping,
      uniqueColumn || undefined
    );

    return NextResponse.json({
      success: true,
      data: {
        companyId,
        importResult,
      },
    });
  } catch (error: any) {
    console.error('Error importing properties from Google Sheet:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to import properties from Google Sheet' 
    }, { status: 500 });
  }
}
