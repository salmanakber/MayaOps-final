/**
 * Google Drive Watch API Service
 * Sets up push notifications for Google Sheets changes
 */

import { google } from 'googleapis';
import prisma from './prisma';
import crypto from 'crypto';

const drive = google.drive('v3');

interface WatchChannel {
  id: string;
  resourceId: string;
  expiration: number; // Unix timestamp in milliseconds
}

/**
 * Initialize Google Drive client with service account
 */
function initializeDriveClient() {
  const credentialsStr = process.env.GOOGLE_SHEETS_CREDENTIALS;
  
  if (!credentialsStr || credentialsStr === "{}") {
    throw new Error(
      "GOOGLE_SHEETS_CREDENTIALS environment variable is not set. " +
      "Please configure your Google Service Account credentials."
    );
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsStr);
  } catch (error) {
    throw new Error("GOOGLE_SHEETS_CREDENTIALS contains invalid JSON.");
  }

  if (!credentials.client_email) {
    throw new Error("GOOGLE_SHEETS_CREDENTIALS is missing 'client_email' field.");
  }

  return google.auth.getClient({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

/**
 * Get webhook URL for receiving notifications
 */
function getWebhookUrl(): string {
  // Priority: NEXT_PUBLIC_API_URL > CRON_BASE_URL > fallback
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.CRON_BASE_URL || 'http://127.0.0.1:3000';
  
    // Warn if using localhost (won't work for Google webhooks)
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      console.error(`[Watch] ❌ ERROR: Using localhost URL (${baseUrl}) - Google cannot reach this!`);
      console.error(`[Watch] ❌ Set NEXT_PUBLIC_API_URL or CRON_BASE_URL to your public URL (e.g., ngrok URL)`);
      console.error(`[Watch] ❌ Watch channels created with localhost will not work!`);
      throw new Error(`Cannot create watch channel with localhost URL. Set NEXT_PUBLIC_API_URL to your public URL (e.g., ngrok URL)`);
    }
  
  // Ensure URL doesn't have trailing slash
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const webhookUrl = `${cleanBaseUrl}/api/webhooks/google-drive`;
  
  console.log(`[Watch] Webhook URL configuration:`);
  console.log(`[Watch]   NEXT_PUBLIC_API_URL: ${process.env.NEXT_PUBLIC_API_URL || 'not set'}`);
  console.log(`[Watch]   CRON_BASE_URL: ${process.env.CRON_BASE_URL || 'not set'}`);
  console.log(`[Watch]   Using base URL: ${cleanBaseUrl}`);
  console.log(`[Watch]   Final webhook URL: ${webhookUrl}`);
  
  return webhookUrl;
}

/**
 * Set up a watch channel for a Google Sheet
 * @param fileId - The Google Sheet file ID (spreadsheet ID)
 * @param companyId - The company ID this sheet belongs to
 * @param sheetType - Type of sheet: 'property' or 'task'
 * @returns Watch channel information
 */
export async function setupWatchChannel(
  fileId: string,
  companyId: number,
  sheetType: 'property' | 'task'
): Promise<WatchChannel> {
  try {
    const auth = await initializeDriveClient();
    
    // Generate a unique channel ID
    const channelId = crypto.randomUUID();
    
    // Calculate expiration (7 days from now, max allowed by Google)
    const expiration = Date.now() + (7 * 24 * 60 * 60 * 1000);
    const webhookUrl = getWebhookUrl();
    
    console.log(`[Watch] Setting up watch channel for file ${fileId}`);
    console.log(`[Watch] Channel ID: ${channelId}`);
    console.log(`[Watch] Webhook URL: ${webhookUrl}`);
    console.log(`[Watch] Expiration: ${new Date(expiration).toISOString()}`);
    
    // Set up watch channel
    const response = await drive.files.watch({
      auth,
      fileId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: expiration.toString(),
      },
    });

    console.log(`[Watch] Watch channel response:`, {
      resourceId: response.data.resourceId,
      resourceUri: response.data.resourceUri,
      expiration: response.data.expiration,
    });

    const watchChannel: WatchChannel = {
      id: channelId,
      resourceId: response.data.resourceId || '',
      expiration,
    };

    // Store watch channel info in SystemSettings
    const settingKey = `company_${companyId}_${sheetType}_sheet_watch_channel`;
    await prisma.systemSetting.upsert({
      where: { key: settingKey },
      update: {
        value: JSON.stringify(watchChannel),
        category: 'google_drive_watch',
      },
      create: {
        key: settingKey,
        value: JSON.stringify(watchChannel),
        category: 'google_drive_watch',
        description: `Watch channel for ${sheetType} sheet of company ${companyId}`,
      },
    });

    console.log(`✅ Set up watch channel for company ${companyId}, ${sheetType} sheet: ${fileId}`);
    return watchChannel;
  } catch (error: any) {
    console.error(`❌ Error setting up watch channel for file ${fileId}:`, error.message);
    throw error;
  }
}

/**
 * Stop a watch channel
 */
export async function stopWatchChannel(
  companyId: number,
  sheetType: 'property' | 'task'
): Promise<void> {
  try {
    const settingKey = `company_${companyId}_${sheetType}_sheet_watch_channel`;
    const setting = await prisma.systemSetting.findUnique({
      where: { key: settingKey },
    });

    if (!setting || !setting.value) {
      console.log(`No watch channel found for company ${companyId}, ${sheetType} sheet`);
      return;
    }

    const watchChannel: WatchChannel = JSON.parse(setting.value);
    const auth = await initializeDriveClient();

    // Stop the watch channel
    await drive.channels.stop({
      auth,
      requestBody: {
        id: watchChannel.id,
        resourceId: watchChannel.resourceId,
      },
    });

    // Remove from database
    await prisma.systemSetting.delete({
      where: { key: settingKey },
    });

    console.log(`✅ Stopped watch channel for company ${companyId}, ${sheetType} sheet`);
  } catch (error: any) {
    console.error(`❌ Error stopping watch channel:`, error.message);
    // Don't throw - might already be stopped
  }
}

/**
 * Renew a watch channel before expiration
 */
export async function renewWatchChannel(
  companyId: number,
  sheetType: 'property' | 'task'
): Promise<WatchChannel | null> {
  try {
    const settingKey = `company_${companyId}_${sheetType}_sheet_watch_channel`;
    const setting = await prisma.systemSetting.findUnique({
      where: { key: settingKey },
    });

    if (!setting || !setting.value) {
      return null;
    }

    const watchChannel: WatchChannel = JSON.parse(setting.value);
    
    // Check if renewal is needed (within 24 hours of expiration)
    const timeUntilExpiration = watchChannel.expiration - Date.now();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    
    if (timeUntilExpiration > oneDayInMs) {
      // Not time to renew yet
      return watchChannel;
    }

    // Get the file ID from company settings
    const fileIdKey = sheetType === 'property' 
      ? `company_${companyId}_google_sheet_id`
      : `company_${companyId}_task_sheet_id`;
    
    const fileIdSetting = await prisma.systemSetting.findUnique({
      where: { key: fileIdKey },
    });

    if (!fileIdSetting || !fileIdSetting.value) {
      console.log(`No file ID found for company ${companyId}, ${sheetType} sheet`);
      return null;
    }

    // Stop old channel
    await stopWatchChannel(companyId, sheetType);

    // Set up new channel
    return await setupWatchChannel(fileIdSetting.value, companyId, sheetType);
  } catch (error: any) {
    console.error(`❌ Error renewing watch channel:`, error.message);
    return null;
  }
}

/**
 * Set up watches for all companies with configured sheets
 */
export async function setupWatchesForAllCompanies(): Promise<{
  propertySheets: number;
  taskSheets: number;
  errors: number;
}> {
  console.log('[Watch] Setting up Google Drive watches for all companies...');
  
  let propertySheets = 0;
  let taskSheets = 0;
  let errors = 0;

  try {
    const companies = await prisma.company.findMany({
      where: { subscriptionStatus: 'active' },
      select: { id: true, name: true },
    });

    for (const company of companies) {
      try {
        // Set up watch for property sheet
        const propertySheetIdSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_google_sheet_id` },
        });

        if (propertySheetIdSetting?.value) {
          // Check if watch already exists
          const existingWatch = await prisma.systemSetting.findUnique({
            where: { key: `company_${company.id}_property_sheet_watch_channel` },
          });

          if (existingWatch) {
            console.log(`[Watch] ⏭ Skipping company ${company.id} property sheet - watch already exists`);
          } else {
            try {
              await setupWatchChannel(propertySheetIdSetting.value, company.id, 'property');
              propertySheets++;
            } catch (error: any) {
              console.error(`Error setting up property sheet watch for company ${company.id}:`, error.message);
              errors++;
            }
          }
        }

        // Set up watch for task sheet
        const taskSheetIdSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_task_sheet_id` },
        });

        if (taskSheetIdSetting?.value) {
          // Check if watch already exists and verify it has the correct URL
          const existingWatch = await prisma.systemSetting.findUnique({
            where: { key: `company_${company.id}_task_sheet_watch_channel` },
          });

          if (existingWatch) {
            // Check if the watch channel is expired or needs renewal
            try {
              const watchChannel = JSON.parse(existingWatch.value);
              const isExpired = watchChannel.expiration < Date.now();
              const hoursUntilExpiration = (watchChannel.expiration - Date.now()) / (1000 * 60 * 60);
              
              if (isExpired || hoursUntilExpiration < 24) {
                console.log(`[Watch] ⚠️ Watch for company ${company.id} task sheet is expired or expiring soon, recreating...`);
                // Stop old watch and create new one
                try {
                  await stopWatchChannel(company.id, 'task');
                } catch (e) {
                  // Ignore errors stopping old watch
                }
                await setupWatchChannel(taskSheetIdSetting.value, company.id, 'task');
                taskSheets++;
              } else {
                console.log(`[Watch] ⏭ Skipping company ${company.id} task sheet - watch exists and is valid`);
              }
            } catch (error) {
              console.log(`[Watch] ⚠️ Invalid watch channel data for company ${company.id}, recreating...`);
              await setupWatchChannel(taskSheetIdSetting.value, company.id, 'task');
              taskSheets++;
            }
          } else {
            try {
              await setupWatchChannel(taskSheetIdSetting.value, company.id, 'task');
              taskSheets++;
            } catch (error: any) {
              console.error(`Error setting up task sheet watch for company ${company.id}:`, error.message);
              errors++;
            }
          }
        }
      } catch (error: any) {
        console.error(`Error processing company ${company.id}:`, error.message);
        errors++;
      }
    }

    console.log(`[Watch] Setup complete: ${propertySheets} property sheets, ${taskSheets} task sheets, ${errors} errors`);
    return { propertySheets, taskSheets, errors };
  } catch (error: any) {
    console.error('[Watch] Fatal error setting up watches:', error);
    throw error;
  }
}

/**
 * Renew all watch channels that are expiring soon
 */
export async function renewExpiringWatches(): Promise<{
  renewed: number;
  errors: number;
}> {
  console.log('[Watch] Renewing expiring watch channels...');
  
  let renewed = 0;
  let errors = 0;

  try {
    // Get all watch channel settings
    const watchSettings = await prisma.systemSetting.findMany({
      where: { category: 'google_drive_watch' },
    });

    for (const setting of watchSettings) {
      try {
        // Extract company ID and sheet type from key
        const match = setting.key.match(/company_(\d+)_(property|task)_sheet_watch_channel/);
        if (!match) continue;

        const companyId = parseInt(match[1]);
        const sheetType = match[2] as 'property' | 'task';

        const renewedChannel = await renewWatchChannel(companyId, sheetType);
        if (renewedChannel) {
          renewed++;
        }
      } catch (error: any) {
        console.error(`Error renewing watch for setting ${setting.key}:`, error.message);
        errors++;
      }
    }

    console.log(`[Watch] Renewal complete: ${renewed} renewed, ${errors} errors`);
    return { renewed, errors };
  } catch (error: any) {
    console.error('[Watch] Fatal error renewing watches:', error);
    throw error;
  }
}
