// Google Sheets Sync Cron Job
// Run this with node-cron or as a Vercel cron endpoint

import { fetchSheetData, parsePropertyRows, type ColumnMapping } from './sheets';
import { geocodeAddress } from './geocoding';
import prisma from './prisma';

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
        const rangeSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_google_sheet_range` },
        });
        const range = rangeSetting?.value || 'Sheet1!A1:F10000';

        // Get column mapping or use default
        const mappingSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_google_sheet_mapping` },
        });
        
        let columnMapping: ColumnMapping;
        if (mappingSetting?.value) {
          try {
            columnMapping = JSON.parse(mappingSetting.value);
          } catch {
            // Fallback to default mapping
            columnMapping = {
              'Address': 'address',
              'Postcode': 'postcode',
              'Latitude': 'latitude',
              'Longitude': 'longitude',
              'Property Type': 'propertyType',
              'Cleaning Date': 'cleaningDate',
              'Notes': 'notes',
            };
          }
        } else {
          // Default column mapping
          columnMapping = {
            'Address': 'address',
            'Postcode': 'postcode',
            'Latitude': 'latitude',
            'Longitude': 'longitude',
            'Property Type': 'propertyType',
            'Cleaning Date': 'cleaningDate',
            'Notes': 'notes',
          };
        }

        // Fetch sheet data
        const sheetRows = await fetchSheetData(spreadsheetId, range);
        
        if (sheetRows.length === 0) {
          console.log(`[CRON] ⚠ No data found in sheet for ${company.name}`);
          results.push({
            companyId: company.id,
            companyName: company.name,
            success: false,
            error: 'No data found in sheet',
          });
          continue;
        }

        // Get headers (first row)
        const headerRow = sheetRows[0] || [];

        // Parse and validate rows with column mapping
        const { properties, errors } = parsePropertyRows(sheetRows, columnMapping, headerRow);

        // Create or update properties in database
        let createdCount = 0;
        let updatedCount = 0;
        let geocodedCount = 0;

        for (const property of properties) {
          try {
            // Geocode if lat/lon are missing
            let latitude = property.latitude;
            let longitude = property.longitude;

            if ((!latitude || !longitude) && property.address) {
              const geocodeResult = await geocodeAddress(property.address, property.postcode || undefined);
              if (geocodeResult) {
                latitude = geocodeResult.lat;
                longitude = geocodeResult.lng;
                geocodedCount++;
              }
            }

            const existingProperty = await prisma.property.findFirst({
              where: {
                companyId: company.id,
                address: property.address,
                postcode: property.postcode || null,
              },
            });

            if (existingProperty) {
              await prisma.property.update({
                where: { id: existingProperty.id },
                data: {
                  notes: property.notes,
                  latitude: latitude || existingProperty.latitude,
                  longitude: longitude || existingProperty.longitude,
                  propertyType: property.propertyType || existingProperty.propertyType,
                },
              });
              updatedCount++;
            } else {
              await prisma.property.create({
                data: {
                  companyId: company.id,
                  address: property.address,
                  postcode: property.postcode || null,
                  latitude: latitude || null,
                  longitude: longitude || null,
                  propertyType: property.propertyType || 'apartment',
                  notes: property.notes || null,
                  isActive: true,
                },
              });
              createdCount++;
            }

            // Create task for cleaning date if provided
            if (property.cleaningDate) {
              const propertyRecord = await prisma.property.findFirst({
                where: {
                  companyId: company.id,
                  address: property.address,
                  postcode: property.postcode || null,
                },
              });

              if (propertyRecord) {
                // Check if task already exists for this property and date
                const existingTask = await prisma.task.findFirst({
                  where: {
                    companyId: company.id,
                    propertyId: propertyRecord.id,
                    scheduledDate: new Date(property.cleaningDate),
                    title: { startsWith: 'Cleaning:' },
                  },
                });

                if (!existingTask) {
                  await prisma.task.create({
                    data: {
                      companyId: company.id,
                      propertyId: propertyRecord.id,
                      title: `Cleaning: ${property.address}`,
                      description: property.notes || null,
                      scheduledDate: new Date(property.cleaningDate),
                      status: 'PLANNED',
                    },
                  });
                }
              }
            }
          } catch (error) {
            console.error(`[CRON] Error processing property for ${company.name}:`, error);
          }
        }

        // Update company property count
        const totalProperties = await prisma.property.count({ where: { companyId: company.id } });
        await prisma.company.update({
          where: { id: company.id },
          data: { propertyCount: totalProperties },
        });

        results.push({
          companyId: company.id,
          companyName: company.name,
          success: true,
          propertiesAdded: createdCount,
          propertiesUpdated: updatedCount,
          geocodedAddresses: geocodedCount,
          errors: errors.length,
          totalProcessed: properties.length,
        });

        console.log(`[CRON] ✓ Synced ${company.name}: +${createdCount} properties, ~${updatedCount} updated, ${geocodedCount} geocoded, ${errors.length} errors`);
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
