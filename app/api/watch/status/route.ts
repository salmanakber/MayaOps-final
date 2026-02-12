/**
 * Check Watch Status
 * Diagnostic endpoint to check which companies have watch channels set up
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only allow admins
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    // Get all watch channel settings
    const watchSettings = await prisma.systemSetting.findMany({
      where: { category: 'google_drive_watch' },
    });

    // Get all companies with sheet configurations
    const companies = await prisma.company.findMany({
      where: { subscriptionStatus: 'active' },
      select: { id: true, name: true },
    });

    const status = companies.map(company => {
      const propertySheetId = watchSettings.find(
        s => s.key === `company_${company.id}_property_sheet_watch_channel`
      );
      const taskSheetId = watchSettings.find(
        s => s.key === `company_${company.id}_task_sheet_watch_channel`
      );

      // Get actual sheet IDs
      const propertySheetIdSetting = watchSettings.find(
        s => s.key === `company_${company.id}_google_sheet_id`
      );
      const taskSheetIdSetting = watchSettings.find(
        s => s.key === `company_${company.id}_task_sheet_id`
      );

      let propertyWatch = null;
      let taskWatch = null;

      if (propertySheetId && propertySheetId.value) {
        try {
          const watchChannel = JSON.parse(propertySheetId.value);
          const expirationDate = new Date(watchChannel.expiration);
          const isExpired = expirationDate.getTime() < Date.now();
          const hoursUntilExpiration = (watchChannel.expiration - Date.now()) / (1000 * 60 * 60);
          
          propertyWatch = {
            channelId: watchChannel.id,
            resourceId: watchChannel.resourceId,
            expiration: expirationDate.toISOString(),
            isExpired,
            hoursUntilExpiration: Math.round(hoursUntilExpiration * 100) / 100,
            fileId: propertySheetIdSetting?.value || 'Not configured',
          };
        } catch (error) {
          propertyWatch = { error: 'Invalid watch channel data' };
        }
      }

      if (taskSheetId && taskSheetId.value) {
        try {
          const watchChannel = JSON.parse(taskSheetId.value);
          const expirationDate = new Date(watchChannel.expiration);
          const isExpired = expirationDate.getTime() < Date.now();
          const hoursUntilExpiration = (watchChannel.expiration - Date.now()) / (1000 * 60 * 60);
          
          taskWatch = {
            channelId: watchChannel.id,
            resourceId: watchChannel.resourceId,
            expiration: expirationDate.toISOString(),
            isExpired,
            hoursUntilExpiration: Math.round(hoursUntilExpiration * 100) / 100,
            fileId: taskSheetIdSetting?.value || 'Not configured',
          };
        } catch (error) {
          taskWatch = { error: 'Invalid watch channel data' };
        }
      }

      return {
        companyId: company.id,
        companyName: company.name,
        propertySheet: {
          configured: !!propertySheetIdSetting?.value,
          watchActive: !!propertyWatch,
          watch: propertyWatch,
        },
        taskSheet: {
          configured: !!taskSheetIdSetting?.value,
          watchActive: !!taskWatch,
          watch: taskWatch,
        },
      };
    });

    // Get webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.CRON_BASE_URL || 'http://127.0.0.1:3000';
    const webhookUrl = `${baseUrl}/api/webhooks/google-drive`;

    return NextResponse.json({
      success: true,
      webhookUrl,
      totalCompanies: companies.length,
      companiesWithWatches: status.filter(c => c.propertySheet.watchActive || c.taskSheet.watchActive).length,
      status,
    });
  } catch (error: any) {
    console.error('Error checking watch status:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to check watch status' },
      { status: 500 }
    );
  }
}
