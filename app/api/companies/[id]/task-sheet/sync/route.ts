import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { importTasksFromCompanySheet, TaskColumnMapping } from '@/lib/google-sheets-tasks';
import prisma from '@/lib/prisma';

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
    const companyId = parseInt(params.id);
    
    // Verify company exists and user has access
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      const userCompanyId = requireCompanyScope(tokenUser);
      if (userCompanyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { 
      spreadsheetId, 
      sheetName, 
      columnMapping, 
      uniqueColumn,
      propertyIdColumn,
      actionColumn,
      syncOnly, // If true, use stored configuration
    } = body;

    // If syncOnly is true, use stored configuration
    if (syncOnly) {
      const spreadsheetIdSetting = await prisma.systemSetting.findUnique({
        where: { key: `company_${companyId}_task_sheet_id` },
      });
      const sheetNameSetting = await prisma.systemSetting.findUnique({
        where: { key: `company_${companyId}_task_sheet_name` },
      });
      const mappingSetting = await prisma.systemSetting.findUnique({
        where: { key: `company_${companyId}_task_sheet_mapping` },
      });
      const uniqueColumnSetting = await prisma.systemSetting.findUnique({
        where: { key: `company_${companyId}_task_sheet_unique_column` },
      });
      const propertyIdColumnSetting = await prisma.systemSetting.findUnique({
        where: { key: `company_${companyId}_task_sheet_property_id_column` },
      });
      const actionColumnSetting = await prisma.systemSetting.findUnique({
        where: { key: `company_${companyId}_task_sheet_action_column` },
      });

      if (
        !spreadsheetIdSetting ||
        !sheetNameSetting ||
        !mappingSetting ||
        !propertyIdColumnSetting ||
        !uniqueColumnSetting ||
        !uniqueColumnSetting.value ||
        !actionColumnSetting ||
        !actionColumnSetting.value
      ) {
        return NextResponse.json({ 
          success: false, 
          message: 'Task sheet not configured. Please configure spreadsheetId, sheetName, mapping, propertyIdColumn, uniqueColumn, and actionColumn.' 
        }, { status: 400 });
      }

      const storedSpreadsheetId = spreadsheetIdSetting.value;
      const storedSheetName = sheetNameSetting.value;
      const storedColumnMapping = JSON.parse(mappingSetting.value) as TaskColumnMapping;
      const storedUniqueColumn = uniqueColumnSetting.value;
      const storedPropertyIdColumn = propertyIdColumnSetting.value;
      const storedActionColumn = actionColumnSetting.value;

      // Import tasks from company sheet using stored config
      const importResult = await importTasksFromCompanySheet(
        companyId,
        storedSpreadsheetId,
        storedSheetName,
        storedColumnMapping,
        storedUniqueColumn,
        storedPropertyIdColumn,
        storedActionColumn
      );

      return NextResponse.json({
        success: true,
        data: {
          companyId,
          importResult,
        },
      });
    }

    // Otherwise, use provided configuration
    if (!spreadsheetId || !sheetName || !columnMapping || !propertyIdColumn || !uniqueColumn || !actionColumn) {
      return NextResponse.json({ 
        success: false, 
        message: 'spreadsheetId, sheetName, columnMapping, propertyIdColumn, uniqueColumn, and actionColumn are required' 
      }, { status: 400 });
    }

    // Import tasks from company sheet
    const importResult = await importTasksFromCompanySheet(
      companyId,
      spreadsheetId,
      sheetName,
      columnMapping as TaskColumnMapping,
      uniqueColumn,
      propertyIdColumn,
      actionColumn
    );

    // Store company-level sheet configuration in SystemSettings
    await prisma.systemSetting.upsert({
      where: { key: `company_${companyId}_task_sheet_id` },
      update: { value: spreadsheetId },
      create: { key: `company_${companyId}_task_sheet_id`, value: spreadsheetId, category: 'google_sheets' },
    });
    
    await prisma.systemSetting.upsert({
      where: { key: `company_${companyId}_task_sheet_name` },
      update: { value: sheetName },
      create: { key: `company_${companyId}_task_sheet_name`, value: sheetName, category: 'google_sheets' },
    });
    
    await prisma.systemSetting.upsert({
      where: { key: `company_${companyId}_task_sheet_mapping` },
      update: { value: JSON.stringify(columnMapping) },
      create: { key: `company_${companyId}_task_sheet_mapping`, value: JSON.stringify(columnMapping), category: 'google_sheets' },
    });
    
    await prisma.systemSetting.upsert({
      where: { key: `company_${companyId}_task_sheet_unique_column` },
      update: { value: uniqueColumn },
      create: { key: `company_${companyId}_task_sheet_unique_column`, value: uniqueColumn, category: 'google_sheets' },
    });
    
    await prisma.systemSetting.upsert({
      where: { key: `company_${companyId}_task_sheet_property_id_column` },
      update: { value: propertyIdColumn },
      create: { key: `company_${companyId}_task_sheet_property_id_column`, value: propertyIdColumn, category: 'google_sheets' },
    });
    
    await prisma.systemSetting.upsert({
      where: { key: `company_${companyId}_task_sheet_action_column` },
      update: { value: actionColumn },
      create: { key: `company_${companyId}_task_sheet_action_column`, value: actionColumn, category: 'google_sheets' },
    });

    return NextResponse.json({
      success: true,
      data: {
        companyId,
        importResult,
      },
    });
  } catch (error: any) {
    console.error('Error syncing company task sheet:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to sync company task sheet' 
    }, { status: 500 });
  }
}
