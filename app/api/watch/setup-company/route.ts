/**
 * Setup Watch for Specific Company
 * Manually set up watch channels for a specific company
 */

import { NextRequest, NextResponse } from 'next/server';
import { setupWatchChannel } from '@/lib/google-drive-watch';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only allow admins
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { companyId, sheetType } = body;

    if (!companyId || !sheetType || !['property', 'task'].includes(sheetType)) {
      return NextResponse.json({
        success: false,
        message: 'companyId and sheetType (property or task) are required',
      }, { status: 400 });
    }

    // Verify company access
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      const userCompanyId = requireCompanyScope(tokenUser);
      if (userCompanyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    // Get sheet ID
    const sheetIdKey = sheetType === 'property'
      ? `company_${companyId}_google_sheet_id`
      : `company_${companyId}_task_sheet_id`;

    const sheetIdSetting = await prisma.systemSetting.findUnique({
      where: { key: sheetIdKey },
    });

    if (!sheetIdSetting?.value) {
      return NextResponse.json({
        success: false,
        message: `No ${sheetType} sheet configured for company ${companyId}`,
      }, { status: 404 });
    }

    // Stop existing watch if any
    try {
      const { stopWatchChannel } = await import('@/lib/google-drive-watch');
      await stopWatchChannel(companyId, sheetType as 'property' | 'task');
    } catch (error) {
      // Ignore errors - watch might not exist
    }

    // Set up new watch
    const watchChannel = await setupWatchChannel(
      sheetIdSetting.value,
      companyId,
      sheetType as 'property' | 'task'
    );

    return NextResponse.json({
      success: true,
      message: `Watch channel set up for company ${companyId}, ${sheetType} sheet`,
      watchChannel,
    });
  } catch (error: any) {
    console.error('Error setting up watch for company:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to set up watch' },
      { status: 500 }
    );
  }
}
