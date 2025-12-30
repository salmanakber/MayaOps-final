import { google } from "googleapis"

const sheets = google.sheets("v4")

export interface SheetsConfig {
  spreadsheetId: string
  range: string
}

export interface PropertyRow {
  propertyId?: number
  address: string
  postcode?: string
  latitude?: number
  longitude?: number
  propertyType?: string
  checkInDate?: string
  checkOutDate?: string
  cleaningDate?: string
  notes?: string
}

export interface ColumnMapping {
  [sheetColumn: string]: string // Maps sheet column name to database field
}

export interface ValidationError {
  row: number
  message: string
  data: PropertyRow
}

/**
 * Initialize Google Sheets client with service account
 */
export function initializeSheetsClient() {
  const credentialsStr = process.env.GOOGLE_SHEETS_CREDENTIALS
  
  if (!credentialsStr || credentialsStr === "{}") {
    throw new Error(
      "GOOGLE_SHEETS_CREDENTIALS environment variable is not set or is empty. " +
      "Please configure your Google Service Account credentials."
    )
  }

  let credentials
  try {
    credentials = JSON.parse(credentialsStr)
  } catch (error) {
    throw new Error(
      "GOOGLE_SHEETS_CREDENTIALS environment variable contains invalid JSON. " +
      "Please ensure it's a valid JSON string."
    )
  }

  if (!credentials.client_email) {
    throw new Error(
      "GOOGLE_SHEETS_CREDENTIALS is missing 'client_email' field. " +
      "Please ensure your service account credentials are complete."
    )
  }

  return google.auth.getClient({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}



/**
 * Fetch data from Google Sheets
 */
export async function fetchSheetData(spreadsheetId: string, range: string) {
  try {
    const auth = await initializeSheetsClient()
    
    // Get service account email for better error messages
    let serviceAccountEmail = ""
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS || "{}")
      serviceAccountEmail = credentials.client_email || ""
    } catch {
      // Ignore parsing errors, we'll use generic message
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      auth,
    })

    return response.data.values || []
  } catch (error: any) {
    console.error("Error fetching sheet data:", error)
    
    // Get service account email for error messages
    let serviceAccountEmail = ""
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS || "{}")
      serviceAccountEmail = credentials.client_email || ""
    } catch {
      // Ignore parsing errors
    }
    
    const emailHint = serviceAccountEmail 
      ? `\n\nService Account Email: ${serviceAccountEmail}\nShare the spreadsheet with this email address.`
      : "\n\nCheck your GOOGLE_SHEETS_CREDENTIALS for the 'client_email' field."
    
    // Provide more helpful error messages
    if (error?.code === 400 || error?.response?.status === 400) {
      const errorMessage = error?.response?.data?.error?.message || error?.message || ""
      
      if (errorMessage.includes("not supported") || errorMessage.includes("failedPrecondition")) {
        throw new Error(
          "This operation is not supported for this document. Please ensure:\n" +
          "1. The spreadsheet is shared with your Google Service Account email\n" +
          "2. The service account has at least 'Viewer' permissions\n" +
          "3. The spreadsheet is not a Google Forms response sheet or protected document\n" +
          "4. The sheet name in the range is correct (check for typos)\n" +
          "5. The range format is valid (e.g., 'Sheet1!A1:F10000')" +
          emailHint
        )
      }
      
      if (errorMessage.includes("permission") || errorMessage.includes("access") || error?.code === 403) {
        throw new Error(
          "Permission denied. Please share the spreadsheet with your Google Service Account email " +
          "and grant at least 'Viewer' access." +
          emailHint
        )
      }
      
      if (errorMessage.includes("Unable to parse range") || errorMessage.includes("Invalid range")) {
        throw new Error(
          `Invalid range format: "${range}". Please use format like "Sheet1!A1:F10000" or "Sheet1!1:10000".` +
          "\nEnsure the sheet name matches exactly (case-sensitive)."
        )
      }
    }
    
    if (error?.code === 404) {
      throw new Error(
        `Spreadsheet not found: ${spreadsheetId}. Please verify:\n` +
        "1. The spreadsheet ID is correct\n" +
        "2. The spreadsheet is shared with your service account" +
        emailHint
      )
    }
    
    throw error
  }
}

/**
 * Extract header range from a full range
 * Converts ranges like "Sheet1!A1:F10000" to "Sheet1!A1:F1" (first row only)
 */
function extractHeaderRange(range: string): string {
  // Remove any whitespace
  range = range.trim()
  
  // Check if range already specifies a single row (e.g., "Sheet1!1:1" or "Sheet1!A1:F1")
  const singleRowMatch = range.match(/^(.+!)(\d+):(\d+)$/)
  if (singleRowMatch && singleRowMatch[2] === singleRowMatch[3]) {
    return range // Already a single row
  }

  // Extract sheet name and cell range
  const parts = range.split('!')
  if (parts.length === 1) {
    // No sheet name, just range like "A1:F10000"
    const cellRange = parts[0]
    const columnMatch = cellRange.match(/^([A-Z]+)\d+:([A-Z]+)\d+$/i)
    if (columnMatch) {
      return `${columnMatch[1]}1:${columnMatch[2]}1`
    }
    // If no column match, try to get first row
    return `1:1`
  }

  const sheetName = parts[0]
  const cellRange = parts[1] || ''

  // Extract column letters if present (e.g., "A1:F10000" -> "A1:F1")
  const columnMatch = cellRange.match(/^([A-Z]+)\d+:([A-Z]+)\d+$/i)
  if (columnMatch) {
    // Use column range with row 1: "Sheet1!A1:F1"
    return `${sheetName}!${columnMatch[1]}1:${columnMatch[2]}1`
  }

  // Check if it's a row range like "1:10000"
  const rowMatch = cellRange.match(/^(\d+):(\d+)$/)
  if (rowMatch) {
    return `${sheetName}!1:1`
  }

  // Fallback: just fetch first row of the sheet
  return `${sheetName}!1:1`
}

/**
 * Fetch only header row from Google Sheets
 * Optimized to only fetch the first row instead of the entire range
 */
export async function fetchSheetHeaders(spreadsheetId: string, range: string): Promise<string[]> {
  try {
    // Extract just the header row from the range to optimize the API call
    const headerRange = extractHeaderRange(range)
    
    // Fetch only the first row
    const data = await fetchSheetData(spreadsheetId, headerRange)
    
    if (data.length === 0) {
      throw new Error("No data found in sheet. Please ensure the sheet has at least one row with headers.")
    }

    // Return the first row as headers
    return (data[0] || []).map((cell: any) => String(cell || "").trim())
  } catch (error: any) {
    console.error("Error fetching sheet headers:", error)
    
    // Provide more specific error messages
    if (error?.message?.includes("not supported")) {
      throw new Error(
        "This operation is not supported for this document. Please ensure:\n" +
        "1. The spreadsheet is shared with your Google Service Account email\n" +
        "2. The service account has at least 'Viewer' permissions\n" +
        "3. The spreadsheet is not a Google Forms response sheet or protected document\n" +
        "4. The sheet name in the range is correct (e.g., 'Sheet1')\n" +
        "5. The GOOGLE_SHEETS_CREDENTIALS environment variable is correctly configured"
      )
    }
    
    throw error
  }
}

/**
 * Parse and validate property data from sheet rows with column mapping
 */
export function parsePropertyRows(
  rows: any[][],
  columnMapping: ColumnMapping,
  headerRow: string[]
): {
  properties: PropertyRow[]
  errors: ValidationError[]
} {
  const properties: PropertyRow[] = []
  const errors: ValidationError[] = []

  if (rows.length === 0) return { properties, errors }

  // Create reverse mapping: database field -> column index
  const fieldToIndex: { [field: string]: number } = {}
  Object.entries(columnMapping).forEach(([sheetColumn, dbField]) => {
    const index = headerRow.indexOf(sheetColumn)
    if (index !== -1) {
      fieldToIndex[dbField] = index
    }
  })

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]

    try {
      if (!row || row.length === 0) {
        errors.push({
          row: i + 1,
          message: "Empty row",
          data: {} as PropertyRow,
        })
        continue
      }

      const property: PropertyRow = {
        address: "",
        postcode: undefined,
        latitude: undefined,
        longitude: undefined,
        propertyType: undefined,
        checkInDate: undefined,
        checkOutDate: undefined,
        cleaningDate: undefined,
        notes: undefined,
      }

      // Map columns based on mapping
      if (fieldToIndex.address !== undefined) {
        property.address = row[fieldToIndex.address]?.trim() || ""
      }
      if (fieldToIndex.postcode !== undefined) {
        property.postcode = row[fieldToIndex.postcode]?.trim() || undefined
      }
      if (fieldToIndex.latitude !== undefined) {
        const lat = parseFloat(row[fieldToIndex.latitude]?.trim() || "")
        property.latitude = isNaN(lat) ? undefined : lat
      }
      if (fieldToIndex.longitude !== undefined) {
        const lon = parseFloat(row[fieldToIndex.longitude]?.trim() || "")
        property.longitude = isNaN(lon) ? undefined : lon
      }
      if (fieldToIndex.propertyType !== undefined) {
        property.propertyType = row[fieldToIndex.propertyType]?.trim() || undefined
      }
      if (fieldToIndex.checkInDate !== undefined) {
        property.checkInDate = row[fieldToIndex.checkInDate]?.trim() || undefined
      }
      if (fieldToIndex.checkOutDate !== undefined) {
        property.checkOutDate = row[fieldToIndex.checkOutDate]?.trim() || undefined
      }
      if (fieldToIndex.cleaningDate !== undefined) {
        property.cleaningDate = row[fieldToIndex.cleaningDate]?.trim() || undefined
      }
      if (fieldToIndex.notes !== undefined) {
        property.notes = row[fieldToIndex.notes]?.trim() || undefined
      }

      // Validate required fields
      if (!property.address) {
        errors.push({
          row: i + 1,
          message: "Address is required",
          data: property,
        })
        continue
      }

      // Validate cleaning date if provided
      if (property.cleaningDate && !isValidDate(property.cleaningDate)) {
        errors.push({
          row: i + 1,
          message: "Invalid cleaning date format (use YYYY-MM-DD)",
          data: property,
        })
        continue
      }

      properties.push(property)
    } catch (error) {
      errors.push({
        row: i + 1,
        message: `Error processing row: ${error}`,
        data: {} as PropertyRow,
      })
    }
  }

  return { properties, errors }
}

/**
 * Validate date string
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateString)) return false
  const date = new Date(dateString)
  return date instanceof Date && !isNaN(date.getTime())
}

/**
 * Append validation errors to sheets
 */
export async function appendValidationReport(spreadsheetId: string, errors: ValidationError[]) {
  try {
    const auth = await initializeSheetsClient()

    const reportData = [
      ["Validation Report", new Date().toISOString()],
      ["Row", "Message", "Data"],
      ...errors.map((e) => [e.row, e.message, JSON.stringify(e.data)]),
    ]

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "ValidationReport!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: reportData,
      },
      auth,
    })
  } catch (error) {
    console.error("Error appending validation report:", error)
    throw error
  }
}
