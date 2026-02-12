// Google Sheets Sync Cron Job
// Run this with node-cron or as a Vercel cron endpoint

import { fetchSheetData } from './sheets';
import { geocodeAddress } from './geocoding';
import prisma from './prisma';
import { importPropertiesFromSheet, PropertyColumnMapping } from './google-sheets-properties';

export async function runSheetsSyncForAllCompanies() {
  console.log('[CRON] Starting Google Sheets sync for all companies...');
  
  try {
    const companies = await prisma.company.findMany({
      where: { subscriptionStatus: 'active' },
      select: { id: true, name: true },
    });

    console.log(`[CRON] Found ${companies.length} active companies`);

    const results = [];
    for (const company of companies) {
      try {
        // Get company's Google Sheets config from SystemSettings
        // Look for settings like: company_{id}_google_sheet_id, company_{id}_google_sheet_range, company_{id}_google_sheet_mapping
        const spreadsheetIdSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_google_sheet_id` },
        });

        if (!spreadsheetIdSetting || !spreadsheetIdSetting.value) {
          console.log(`[CRON] ⏭ Skipping ${company.name}: No Google Sheet ID configured`);
          continue;
        }

        const spreadsheetId = spreadsheetIdSetting.value;
        const sheetNameSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_google_sheet_name` },
        });
        const sheetName = sheetNameSetting?.value || 'Sheet1';

        // Get column mapping or use default
        const mappingSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_google_sheet_mapping` },
        });
        
        let columnMapping: PropertyColumnMapping;
        if (mappingSetting?.value) {
          try {
            columnMapping = JSON.parse(mappingSetting.value);
          } catch {
            // Fallback to default mapping
            columnMapping = {
              'Property_ID': 'propertyId',
              'Property Address': 'address',
              'Post Code': 'postcode',
              'Property Type': 'propertyType',
              'Unit Count': 'unitCount',
              'Notes': 'notes',
            };
          }
        } else {
          // Default column mapping
          columnMapping = {
            'Property_ID': 'propertyId',
            'Property Address': 'address',
            'Post Code': 'postcode',
            'Property Type': 'propertyType',
            'Unit Count': 'unitCount',
            'Notes': 'notes',
          };
        }

        // Get unique column (Property ID column)
        const uniqueColumnSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_google_sheet_unique_column` },
            });
        const uniqueColumn = uniqueColumnSetting?.value || 'Property_ID';

        // Use the new importPropertiesFromSheet function which handles Property ID
        const importResult = await importPropertiesFromSheet(
          company.id,
          spreadsheetId,
          sheetName,
          columnMapping,
          uniqueColumn
        );

        const createdCount = importResult.created || 0;
        const updatedCount = importResult.updated || 0;

        // Update company property count
        const totalProperties = await prisma.property.count({ where: { companyId: company.id } });
        await prisma.company.update({
          where: { id: company.id },
          data: { propertyCount: totalProperties },
        });

        // Set up Google Drive watch for this sheet if not already set up
        try {
          const watchChannelSetting = await prisma.systemSetting.findUnique({
            where: { key: `company_${company.id}_property_sheet_watch_channel` },
          });
          
          if (!watchChannelSetting) {
            const { setupWatchChannel } = await import('./google-drive-watch');
            await setupWatchChannel(spreadsheetId, company.id, 'property');
            console.log(`✅ Set up watch channel for company ${company.id} property sheet`);
          }
        } catch (error: any) {
          console.error(`⚠️ Failed to set up watch channel for company ${company.id} property sheet:`, error.message);
          // Don't fail the sync if watch setup fails
        }

        results.push({
          companyId: company.id,
          companyName: company.name,
          success: true,
          propertiesAdded: createdCount,
          propertiesUpdated: updatedCount,
          errors: importResult.errors || 0,
        });

        console.log(`[CRON] ✓ Synced ${company.name}: +${createdCount} properties, ~${updatedCount} updated, ${importResult.errors || 0} errors`);
      } catch (error: any) {
        console.error(`[CRON] ✗ Error syncing ${company.name}:`, error.message);
        results.push({
          companyId: company.id,
          companyName: company.name,
          success: false,
          error: error.message,
        });
      }
    }

    console.log('[CRON] Sheets sync completed');
    return results;
  } catch (error) {
    console.error('[CRON] Fatal error in sheets sync:', error);
    throw error;
  }
}

// For Vercel Cron or API route
export async function handleSheetsSyncCron() {
  const results = await runSheetsSyncForAllCompanies();
  return {
    success: true,
    timestamp: new Date().toISOString(),
    results,
  };
}
