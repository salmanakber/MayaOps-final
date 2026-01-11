import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import prisma from '@/lib/prisma';
import { importTasksFromSheet, type TaskColumnMapping } from '@/lib/google-sheets-tasks';
import { UserRole } from '@prisma/client';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
    const propertyId = parseInt(params.id);
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

    // Verify property exists and user has access
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
    }

    // Check company access
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      if (property.companyId !== tokenUser.companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    // Update property with Google Sheet info
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        googleSheetUrl: googleSheetUrl || null,
        googleSheetId: spreadsheetId,
        googleSheetName: sheetName,
        sheetColumnMapping: JSON.stringify(columnMapping),
        sheetUniqueColumn: uniqueColumn || null,
        sheetSyncEnabled: true,
      },
    });

    // Import tasks from sheet
    const importResult = await importTasksFromSheet(
      propertyId,
      spreadsheetId,
      sheetName,
      columnMapping as TaskColumnMapping,
      uniqueColumn || undefined
    );

    console.log('importResult', importResult);

    return NextResponse.json({
      success: true,
      data: {
        propertyId,
        importResult,
      },
    });
  } catch (error: any) {
    console.error('Error mapping and importing from Google Sheet:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to map and import from Google Sheet' 
    }, { status: 500 });
  }
}


