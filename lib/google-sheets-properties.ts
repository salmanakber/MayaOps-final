import { google } from "googleapis";
import prisma from "./prisma";
import { extractSpreadsheetId, verifyGoogleSheet, fetchSheetData, fetchSheetHeaders } from "./google-sheets-tasks";

const sheets = google.sheets("v4");

export interface PropertyColumnMapping {
  [sheetColumn: string]: string; // Maps sheet column name to property field
}

export interface PropertyRow {
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

    // Only add if at least address is present
    if (property.address) {
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
        // Find the corresponding raw row to extract unique identifier
        let uniqueValue: string | null = null;
        
        if (uniqueColumn && uniqueColumnIndex !== null && uniqueColumnIndex !== -1) {
          const addressIndex = fieldToIndex['address'];
          if (addressIndex !== undefined && propertyRow.address) {
            // Find the raw row that matches this propertyRow
            for (let rawRowIndex = 1; rawRowIndex < rows.length; rawRowIndex++) {
              const rawRow = rows[rawRowIndex];
              if (!rawRow || rawRow.length === 0) continue;
              
              const rawAddress = rawRow[addressIndex];
              if (rawAddress && String(rawAddress).trim() === propertyRow.address.trim()) {
                // Found matching row - extract unique value
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
        }

        // Validate required fields
        if (!propertyRow.address) {
          errors.push({ row: propertyRow, error: 'Address is required' });
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

        // Check if property already exists - using unique identifier or address + postcode
        let existingProperty = null;
        
        if (uniqueValue && uniqueValue.trim()) {
          // Use unique identifier if available (we'll need to add this field to Property model or use address+postcode)
          // For now, we'll use address + postcode as unique identifier
          existingProperty = await prisma.property.findFirst({
            where: {
              companyId,
              address: propertyRow.address,
              postcode: propertyRow.postcode || null,
            },
          });
        } else {
          // Use address + postcode as unique identifier
          existingProperty = await prisma.property.findFirst({
            where: {
              companyId,
              address: propertyRow.address,
              postcode: propertyRow.postcode || null,
            },
          });
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
        };

        if (existingProperty) {
          // Update existing property
          console.log(`[Property Import] Updating existing property ID: ${existingProperty.id}`);
          await prisma.property.update({
            where: { id: existingProperty.id },
            data: propertyData,
          });
          updatedProperties.push(existingProperty.id);
          console.log(`[Property Import] ✓ Property updated successfully (ID: ${existingProperty.id})`);
        } else {
          // Create new property
          console.log(`[Property Import] Creating new property: ${propertyRow.address}`);
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
