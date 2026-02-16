import { google } from "googleapis";
import prisma from "./prisma";
import { extractSpreadsheetId, verifyGoogleSheet, fetchSheetData, fetchSheetHeaders } from "./google-sheets-tasks";
import { geocodeAddress } from "./geocoding";

const sheets = google.sheets("v4");

export interface PropertyColumnMapping {
  [sheetColumn: string]: string; // Maps sheet column name to property field
}

export interface PropertyRow {
  propertyId?: string;
  address?: string;
  postcode?: string;
  propertyType?: string;
  unitCount?: string;
  pricePerUnit?: string;
  notes?: string;
  [key: string]: any;
}

/**
 * Parse sheet rows into property data using column mapping
 */
export function parsePropertyRows(
  rows: any[][],
  columnMapping: PropertyColumnMapping,
  headerRow: string[]
): PropertyRow[] {
  const properties: PropertyRow[] = [];

  if (rows.length <= 1) return properties; // Skip if only headers or empty

  // Create reverse mapping: property field -> column index
  const fieldToIndex: { [field: string]: number } = {};
  Object.entries(columnMapping).forEach(([sheetColumn, propertyField]) => {
    const index = headerRow.indexOf(sheetColumn);
    if (index !== -1) {
      fieldToIndex[propertyField] = index;
    }
  });

  // Process data rows (skip header row at index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const property: PropertyRow = {};

    // Map columns based on mapping
    Object.entries(fieldToIndex).forEach(([propertyField, columnIndex]) => {
      const value = row[columnIndex];
      if (value !== undefined && value !== null && value !== "") {
        property[propertyField] = String(value).trim();
      }
    });

    // Only add if both propertyId and address are present
    if (property.propertyId && property.address) {
      properties.push(property);
    }
  }

  return properties;
}

/**
 * Import properties from Google Sheet
 */
export async function importPropertiesFromSheet(
  companyId: number,
  spreadsheetId: string,
  sheetName: string,
  columnMapping: PropertyColumnMapping,
  uniqueColumn?: string
) {
  try {
    // Fetch sheet data
    const rows = await fetchSheetData(spreadsheetId, sheetName);
    if (rows.length === 0) {
      throw new Error("No data found in sheet");
    }

    const headerRow = rows[0] || [];
    const propertyRows = parsePropertyRows(rows, columnMapping, headerRow);
    
    // Find the index of the unique column in the header row
    let uniqueColumnIndex: number | null = null;
    if (uniqueColumn) {
      uniqueColumnIndex = headerRow.indexOf(uniqueColumn);
      if (uniqueColumnIndex === -1) {
        console.warn(`[Property Import] WARNING: Unique column "${uniqueColumn}" not found in sheet headers!`);
      }
    }

    const createdProperties = [];
    const updatedProperties = [];
    const errors = [];
    
    // Build fieldToIndex mapping
    const fieldToIndex: { [field: string]: number } = {};
    Object.entries(columnMapping).forEach(([sheetColumn, propertyField]) => {
      const index = headerRow.indexOf(sheetColumn);
      if (index !== -1) {
        fieldToIndex[propertyField] = index;
      }
    });
    
    // Process each property row
    for (let propertyRowIndex = 0; propertyRowIndex < propertyRows.length; propertyRowIndex++) {
      const propertyRow = propertyRows[propertyRowIndex];
      
      try {
        // Extract unique identifier (property ID) from the row
        // The uniqueColumn should be the Property ID column, so we extract it directly
        let uniqueValue: string | null = null;
        
        if (uniqueColumn && uniqueColumnIndex !== null && uniqueColumnIndex !== -1) {
          // Find the raw row that matches this propertyRow by address (to get the correct row)
          const addressIndex = fieldToIndex['address'];
          if (addressIndex !== undefined && propertyRow.address) {
            for (let rawRowIndex = 1; rawRowIndex < rows.length; rawRowIndex++) {
              const rawRow = rows[rawRowIndex];
              if (!rawRow || rawRow.length === 0) continue;
              
              const rawAddress = rawRow[addressIndex];
              if (rawAddress && String(rawAddress).trim() === propertyRow.address.trim()) {
                // Found matching row - extract unique value (property ID) from uniqueColumn
                const rawValue = rawRow[uniqueColumnIndex];
                if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
                  uniqueValue = String(rawValue).trim();
                  if (uniqueValue.length === 0) {
                    uniqueValue = null;
                  }
                }
                break;
              }
            }
          }
        } else if (propertyRow.propertyId) {
          // If unique column is propertyId itself (mapped in columnMapping), use it directly
          uniqueValue = propertyRow.propertyId.trim();
        }

        // Validate required fields - ignore rows without propertyId or address
        if (!propertyRow.propertyId || !propertyRow.address) {
          // Silently skip rows without propertyId or address
          continue;
        }

        if (!propertyRow.propertyType) {
          errors.push({ row: propertyRow, error: 'Property type is required' });
          continue;
        }

        // Validate property type
        const validPropertyTypes = ['block', 'apartment', 'hmo', 'house', 'commercial'];
        const propertyType = propertyRow.propertyType.toLowerCase();
        if (!validPropertyTypes.includes(propertyType)) {
          errors.push({ row: propertyRow, error: `Invalid property type: ${propertyRow.propertyType}. Must be one of: ${validPropertyTypes.join(', ')}` });
          continue;
        }

        // Parse numeric fields
        const unitCount = propertyRow.unitCount ? parseInt(propertyRow.unitCount, 10) : 1;

        // Get price per unit from admin configuration (always use setting, not from sheet)
        let pricePerUnitFromSetting = 1.00;
        const adminConfig = await prisma.adminConfiguration.findUnique({
          where: { companyId },
        });
        // @ts-ignore - Field exists in schema but types may not be updated
        if (adminConfig && adminConfig.propertyPricePerUnit) {
          // @ts-ignore
          pricePerUnitFromSetting = Number(adminConfig.propertyPricePerUnit);
        }

        // pricePerUnit is always set from the setting
        const finalPricePerUnit = pricePerUnitFromSetting;
        // totalPrice = unitCount * pricePerUnit (from setting)
        const totalPrice = finalPricePerUnit * unitCount;

        // Geocode address to get latitude and longitude
        let latitude: number | null = null;
        let longitude: number | null = null;
        
        if (propertyRow.address) {
          try {
            const geocodeResult = await geocodeAddress(propertyRow.address, propertyRow.postcode || undefined);
            if (geocodeResult) {
              latitude = geocodeResult.lat;
              longitude = geocodeResult.lng;
              console.log(`[Property Import] ✓ Geocoded address: ${propertyRow.address} -> (${latitude}, ${longitude})`);
            } else {
              console.warn(`[Property Import] ⚠ Failed to geocode address: ${propertyRow.address}`);
            }
          } catch (geocodeError) {
            console.error(`[Property Import] Error geocoding address ${propertyRow.address}:`, geocodeError);
            // Continue without coordinates if geocoding fails
          }
        }

        // Check if property already exists by unique identifier (property ID stored in sheetUniqueColumn)
        // We need to find properties where sheetUniqueColumn matches the uniqueValue
        let existingProperty = null;
        
        if (uniqueValue && uniqueValue.trim()) {
          // Find property by companyId and the unique column value
          // We'll search for properties where sheetUniqueColumn matches
          const allCompanyProperties = await prisma.property.findMany({
            where: { companyId },
            select: { id: true, sheetUniqueColumn: true },
          });
          
          // Find property where sheetUniqueColumn matches uniqueValue
          for (const prop of allCompanyProperties) {
            // @ts-ignore - Field exists in schema but types may not be updated
            if (prop.sheetUniqueColumn === uniqueValue) {
              existingProperty = await prisma.property.findUnique({
                where: { id: prop.id },
              });
              break;
            }
          }
        }

        const propertyData: any = {
          companyId,
          address: propertyRow.address,
          postcode: propertyRow.postcode || null,
          propertyType: propertyType,
          unitCount,
          pricePerUnit: finalPricePerUnit,
          totalPrice,
          notes: propertyRow.notes || null,
          isActive: true,
          latitude: latitude !== null ? latitude : undefined,
          longitude: longitude !== null ? longitude : undefined,
          // @ts-ignore - Field exists in schema but types may not be updated
          sheetUniqueColumn: uniqueValue || null,
        };

        if (existingProperty) {
          // Update existing property
          console.log(`[Property Import] Updating existing property ID: ${existingProperty.id} with unique value: ${uniqueValue}`);
          await prisma.property.update({
            where: { id: existingProperty.id },
            data: propertyData,
          });
          updatedProperties.push(existingProperty.id);
          console.log(`[Property Import] ✓ Property updated successfully (ID: ${existingProperty.id})`);
        } else {
          // Create new property
          console.log(`[Property Import] Creating new property: ${propertyRow.address} with unique value: ${uniqueValue}`);
          const newProperty = await prisma.property.create({
            data: propertyData,
          });
          createdProperties.push(newProperty.id);
          console.log(`[Property Import] ✓ New property created (ID: ${newProperty.id})`);
        }
      } catch (error: any) {
        errors.push({ row: propertyRow, error: error.message });
      }
    }

    return {
      success: true,
      created: createdProperties.length,
      updated: updatedProperties.length,
      errors: errors.length,
      errorDetails: errors,
    };
  } catch (error: any) {
    console.error("Error importing properties from sheet:", error);
    throw error;
  }
}
