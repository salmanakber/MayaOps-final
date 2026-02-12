/**
 * Google Drive Webhook Endpoint
 * Receives push notifications when Google Sheets are modified
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleSheetsSyncCron } from '@/lib/cron-sheets-sync';
import { syncAllCompanyTaskSheets } from '@/lib/google-sheets-tasks';

/**
 * POST /api/webhooks/google-drive
 * Handles Google Drive change notifications
 */
export async function POST(request: NextRequest) {
  try {
    // Log all incoming requests for debugging
    const headers = Object.fromEntries(request.headers.entries());
    console.log('[Webhook] Received request:', {
      method: 'POST',
      url: request.url,
      headers: {
        'user-agent': headers['user-agent'],
        'content-type': headers['content-type'],
        'content-length': headers['content-length'],
        'x-forwarded-for': headers['x-forwarded-for'],
      },
      timestamp: new Date().toISOString(),
    });

    // Handle empty body or non-JSON content
    // Note: In Next.js, we can only read the request body once
    let body: any = {};
    const contentType = headers['content-type'] || '';
    const contentLength = parseInt(headers['content-length'] || '0');
    
    // If content-length is 0, Google is sending an empty verification request
    if (contentLength === 0) {
      console.log('[Webhook] ✅ Empty body received (content-length: 0) - Google verification request');
      // Google sometimes sends empty POST requests for verification
      // Return success immediately for empty requests
      return NextResponse.json({ 
        success: true, 
        message: 'Verification request received (empty body)',
        timestamp: new Date().toISOString(),
      });
    }
    
    // Read body only if content-length > 0
    if (contentLength > 0) {
      try {
        const bodyText = await request.text();
        console.log('[Webhook] Raw body:', bodyText);
        
        if (bodyText && bodyText.trim().length > 0) {
          if (contentType.includes('application/json') || bodyText.trim().startsWith('{')) {
            body = JSON.parse(bodyText);
          } else {
            // Try to parse as JSON anyway
            try {
              body = JSON.parse(bodyText);
            } catch {
              console.log('[Webhook] Body is not JSON, treating as empty');
              body = {};
            }
          }
        }
      } catch (error: any) {
        console.error('[Webhook] Error reading body:', error.message);
        // Continue with empty body
        body = {};
      }
    }
    
    console.log('[Webhook] Parsed body:', JSON.stringify(body, null, 2));
    
    // Handle empty body or missing type
    if (!body || !body.type) {
      console.log('[Webhook] ⚠️ Received request with no type field');
      console.log('[Webhook] Full body:', body);
      // Google sometimes sends empty requests - return success anyway
      return NextResponse.json({ success: true, message: 'Request received (no type specified)' });
    }

    // Google sends a sync notification when a watch is first set up
    if (body.type === 'sync') {
      console.log('[Webhook] ✅ Received sync notification from Google Drive');
      console.log('[Webhook] Resource ID:', body.resourceId);
      console.log('[Webhook] Resource State:', body.resourceState);
      return NextResponse.json({ success: true, message: 'Sync notification received' });
    }

    // Google sends change notifications when files are modified
    if (body.type === 'change') {
      console.log('[Webhook] ✅ Received change notification from Google Drive');
      console.log('[Webhook] Resource ID:', body.resourceId);
      console.log('[Webhook] Resource State:', body.resourceState);
      console.log('[Webhook] Changed:', body.changed);
      
      const resourceId = body.resourceId;
      const resourceState = body.resourceState;
      const changed = body.changed;

      if (!resourceId) {
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
          if (watchChannel.resourceId === resourceId) {
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
        console.log(`[Webhook] ⚠️ No companies found for resourceId: ${resourceId}`);
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
            const spreadsheetIdSetting = await prisma.systemSetting.findUnique({
              where: { key: `company_${companyId}_task_sheet_id` },
            });

            if (spreadsheetIdSetting?.value) {
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

                syncResults.push({
                  companyId,
                  sheetType: 'task',
                  success: true,
                  result: importResult,
                });
              }
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
        changed,
        syncResults,
      });
    }

    // Unknown notification type
    console.log('[Webhook] Received unknown notification type:', body.type);
    return NextResponse.json({ success: true, message: 'Unknown notification type' });
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
