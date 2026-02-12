/**
 * Force Recreate Watch Channels
 * Stops all existing watches and recreates them with current webhook URL
 * Useful when webhook URL changes (e.g., ngrok URL changes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { stopWatchChannel, setupWatchChannel } from '@/lib/google-drive-watch';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only allow admins
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { companyId } = body; // Optional: if provided, only recreate for that company

    // Get all watch channel settings
    const watchSettings = await prisma.systemSetting.findMany({
      where: { category: 'google_drive_watch' },
    });

    const results = [];

    for (const setting of watchSettings) {
      try {
        // Extract company ID and sheet type from key
        const match = setting.key.match(/company_(\d+)_(property|task)_sheet_watch_channel/);
        if (!match) continue;

        const settingCompanyId = parseInt(match[1]);
        const sheetType = match[2] as 'property' | 'task';

        // If companyId is provided, only process that company
        if (companyId && settingCompanyId !== companyId) {
          continue;
        }

        // Stop existing watch
        try {
          await stopWatchChannel(settingCompanyId, sheetType);
          console.log(`✅ Stopped watch for company ${settingCompanyId}, ${sheetType} sheet`);
        } catch (error: any) {
          console.warn(`⚠️ Error stopping watch (may not exist):`, error.message);
        }

        // Get sheet ID
        const sheetIdKey = sheetType === 'property'
          ? `company_${settingCompanyId}_google_sheet_id`
          : `company_${settingCompanyId}_task_sheet_id`;

        const sheetIdSetting = await prisma.systemSetting.findUnique({
          where: { key: sheetIdKey },
        });

        if (sheetIdSetting?.value) {
          // Create new watch with current webhook URL
          const watchChannel = await setupWatchChannel(
            sheetIdSetting.value,
            settingCompanyId,
            sheetType
          );

          results.push({
            companyId: settingCompanyId,
            sheetType,
            success: true,
            watchChannel,
          });
        } else {
          results.push({
            companyId: settingCompanyId,
            sheetType,
            success: false,
            error: 'Sheet ID not found',
          });
        }
      } catch (error: any) {
        console.error(`Error recreating watch for ${setting.key}:`, error);
        results.push({
          key: setting.key,
          success: false,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Watch channels recreated',
      results,
      totalRecreated: results.filter(r => r.success).length,
    });
  } catch (error: any) {
    console.error('Error force recreating watches:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to recreate watches' },
      { status: 500 }
    );
  }
}
