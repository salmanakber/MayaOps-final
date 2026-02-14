/**
 * Google Drive Webhook Endpoint
 * Receives push notifications when Google Sheets are modified
 * 
 * IMPORTANT: Google Drive sends notification metadata in HTTP HEADERS, not the request body!
 * Key headers:
 * - X-Goog-Channel-ID: The channel ID we set when creating the watch
 * - X-Goog-Resource-State: "sync" (initial) or "change" (file modified)
 * - X-Goog-Resource-ID: The resource ID
 * - X-Goog-Resource-URI: The resource URI
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/webhooks/google-drive
 * Handles Google Drive change notifications
 */
export async function POST(request: NextRequest) {
  try {
    // Log all incoming requests for debugging
    const headers = Object.fromEntries(request.headers.entries());
    
    // Get the actual public URL from headers (for reverse proxy/ngrok scenarios)
    const host = headers['host'] || headers['x-forwarded-host'] || 'unknown';
    const protocol = headers['x-forwarded-proto'] || 'https';
    const publicUrl = `${protocol}://${host}${request.nextUrl.pathname}`;
    
    // Google Drive push notifications send metadata in headers, not body!
    // Key headers (case-insensitive):
    const channelId = headers['x-goog-channel-id'] || headers['X-Goog-Channel-ID'];
    const resourceState = headers['x-goog-resource-state'] || headers['X-Goog-Resource-State'];
    const resourceId = headers['x-goog-resource-id'] || headers['X-Goog-Resource-ID'];
    const resourceUri = headers['x-goog-resource-uri'] || headers['X-Goog-Resource-URI'];
    const channelExpiration = headers['x-goog-channel-expiration'] || headers['X-Goog-Channel-Expiration'];
    
    console.log('[Webhook] Received request:', {
      method: 'POST',
      internalUrl: request.url, // Internal Next.js URL (may be localhost)
      publicUrl: publicUrl, // Public URL (from headers)
      googleHeaders: {
        'X-Goog-Channel-ID': channelId,
        'X-Goog-Resource-State': resourceState,
        'X-Goog-Resource-ID': resourceId,
        'X-Goog-Resource-URI': resourceUri,
        'X-Goog-Channel-Expiration': channelExpiration,
      },
      otherHeaders: {
        'user-agent': headers['user-agent'],
        'content-type': headers['content-type'],
        'content-length': headers['content-length'],
        'x-forwarded-for': headers['x-forwarded-for'],
        'host': headers['host'],
      },
      timestamp: new Date().toISOString(),
    });
    
    // Log warning if there's a mismatch
    if (request.url.includes('localhost') && !publicUrl.includes('localhost')) {
      console.log('[Webhook] ⚠️ Note: Internal URL shows localhost, but public URL is:', publicUrl);
      console.log('[Webhook] ✅ This is normal - Google is sending to the correct public URL');
    }
    
    // IMPORTANT: Google Drive sends notifications with metadata in headers, not body!
    // Process based on X-Goog-Resource-State header
    if (resourceState === 'sync') {
      console.log('[Webhook] ✅ Received SYNC notification from Google Drive');
      console.log('[Webhook] Channel ID:', channelId);
      console.log('[Webhook] Resource ID:', resourceId);
      console.log('[Webhook] This is the initial sync notification when watch is created');
      return NextResponse.json({ success: true, message: 'Sync notification received' });
    }
    
    if (resourceState === 'update') {
      console.log('[Webhook] ✅ Received CHANGE notification from Google Drive');
      console.log('[Webhook] Channel ID:', channelId);
      console.log('[Webhook] Resource ID:', resourceId);
      console.log('[Webhook] Resource URI:', resourceUri);
      
      if (!resourceId) {
        console.log('[Webhook] ⚠️ Missing X-Goog-Resource-ID header');
        return NextResponse.json({ success: false, message: 'Missing resourceId' }, { status: 400 });
      }

      // Find which company(s) have this resource ID
      const watchSettings = await prisma.systemSetting.findMany({
        where: { category: 'google_drive_watch' },
      });

      const affectedCompanies: Array<{ companyId: number; sheetType: 'property' | 'task' }> = [];

      for (const setting of watchSettings) {
        try {
          const watchChannel = JSON.parse(setting.value);
          // Match by resourceId (from Google) or channelId (our UUID)
          if (watchChannel.resourceId === resourceId || watchChannel.id === channelId) {
            const match = setting.key.match(/company_(\d+)_(property|task)_sheet_watch_channel/);
            if (match) {
              affectedCompanies.push({
                companyId: parseInt(match[1]),
                sheetType: match[2] as 'property' | 'task',
              });
            }
          }
        } catch (error) {
          console.error(`Error parsing watch channel for ${setting.key}:`, error);
        }
      }

      if (affectedCompanies.length === 0) {
        console.log(`[Webhook] ⚠️ No companies found for resourceId: ${resourceId} or channelId: ${channelId}`);
        console.log(`[Webhook] Available watch channels:`, watchSettings.map(s => ({
          key: s.key,
          resourceId: (() => {
            try {
              const wc = JSON.parse(s.value);
              return wc.resourceId;
            } catch {
              return 'Invalid JSON';
            }
          })(),
          channelId: (() => {
            try {
              const wc = JSON.parse(s.value);
              return wc.id;
            } catch {
              return 'Invalid JSON';
            }
          })(),
        })));
        return NextResponse.json({ success: true, message: 'No matching companies found' });
      }

      console.log(`[Webhook] Found ${affectedCompanies.length} affected company(ies):`, affectedCompanies);

      // Sync sheets for affected companies
      const syncResults = [];
      for (const { companyId, sheetType } of affectedCompanies) {
        try {
          if (sheetType === 'property') {
            // Sync property sheet for this company
            const companies = await prisma.company.findMany({
              where: { id: companyId, subscriptionStatus: 'active' },
              select: { id: true, name: true },
            });

            if (companies.length > 0) {
              // Use the existing sync function
              const { runSheetsSyncForAllCompanies } = await import('@/lib/cron-sheets-sync');
              const results = await runSheetsSyncForAllCompanies();
              const companyResult = results.find((r: any) => r.companyId === companyId);
              
              syncResults.push({
                companyId,
                sheetType: 'property',
                success: companyResult?.success || false,
                result: companyResult,
              });
            }
          } else if (sheetType === 'task') {
            // Sync task sheet for this company
            console.log(`[Webhook] Syncing task sheet for company ${companyId}...`);
            const spreadsheetIdSetting = await prisma.systemSetting.findUnique({
              where: { key: `company_${companyId}_task_sheet_id` },
            });

            if (spreadsheetIdSetting?.value) {
              console.log(`[Webhook] Found task sheet ID: ${spreadsheetIdSetting.value}`);
              const sheetNameSetting = await prisma.systemSetting.findUnique({
                where: { key: `company_${companyId}_task_sheet_name` },
              });
              const mappingSetting = await prisma.systemSetting.findUnique({
                where: { key: `company_${companyId}_task_sheet_mapping` },
              });
              const propertyIdColumnSetting = await prisma.systemSetting.findUnique({
                where: { key: `company_${companyId}_task_sheet_property_id_column` },
              });
              const actionColumnSetting = await prisma.systemSetting.findUnique({
                where: { key: `company_${companyId}_task_sheet_action_column` },
              });

              if (
                sheetNameSetting?.value &&
                mappingSetting?.value &&
                propertyIdColumnSetting?.value &&
                actionColumnSetting?.value
              ) {
                console.log(`[Webhook] All settings found, calling importTasksFromCompanySheet...`);
                const { importTasksFromCompanySheet } = await import('@/lib/google-sheets-tasks');
                const columnMapping = JSON.parse(mappingSetting.value);

                const importResult = await importTasksFromCompanySheet(
                  companyId,
                  spreadsheetIdSetting.value,
                  sheetNameSetting.value,
                  columnMapping,
                  propertyIdColumnSetting.value,
                  actionColumnSetting.value
                );

                console.log(`[Webhook] ✅ Task sheet sync completed for company ${companyId}:`, {
                  created: importResult.created || 0,
                  updated: importResult.updated || 0,
                  removed: importResult.removed || 0,
                  errors: importResult.errors || 0,
                });

                syncResults.push({
                  companyId,
                  sheetType: 'task',
                  success: true,
                  result: importResult,
                });
              } else {
                console.log(`[Webhook] ⚠️ Missing settings for company ${companyId} task sheet:`, {
                  sheetName: !!sheetNameSetting?.value,
                  mapping: !!mappingSetting?.value,
                  propertyIdColumn: !!propertyIdColumnSetting?.value,
                  actionColumn: !!actionColumnSetting?.value,
                });
                syncResults.push({
                  companyId,
                  sheetType: 'task',
                  success: false,
                  error: 'Missing required settings',
                });
              }
            } else {
              console.log(`[Webhook] ⚠️ No task sheet ID found for company ${companyId}`);
              syncResults.push({
                companyId,
                sheetType: 'task',
                success: false,
                error: 'Task sheet not configured',
              });
            }
          }
        } catch (error: any) {
          console.error(`Error syncing ${sheetType} sheet for company ${companyId}:`, error);
          syncResults.push({
            companyId,
            sheetType,
            success: false,
            error: error.message,
          });
        }
      }

      console.log(`[Webhook] Synced ${syncResults.length} sheet(s) for resourceId: ${resourceId}`);
      return NextResponse.json({
        success: true,
        resourceId,
        resourceState,
        syncResults,
      });
    }
    
    // Unknown or missing resource state
    console.log('[Webhook] ⚠️ Unknown or missing X-Goog-Resource-State header');
    console.log('[Webhook] Resource State:', resourceState);
    console.log('[Webhook] This might be a verification request or malformed notification');
    // Return success anyway to acknowledge receipt
    return NextResponse.json({ 
      success: true, 
      message: 'Notification received (unknown resource state)',
      resourceState: resourceState || 'unknown',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Webhook] Error processing Google Drive notification:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/google-drive
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Google Drive webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
}
