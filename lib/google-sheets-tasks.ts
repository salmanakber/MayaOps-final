import { google } from "googleapis";
import prisma from "./prisma";
import { UserRole } from "@prisma/client";
import { sendExpoPushNotification } from "./expo-push";
import { createNotification } from "./notifications";

const sheets = google.sheets("v4");

export interface TaskColumnMapping {
  [sheetColumn: string]: string; // Maps sheet column name to task field
}

export interface TaskRow {
  title?: string;
  description?: string;
  scheduledDate?: string;
  moveInDate?: string;
  assignedUserId?: number;
  status?: string;
  [key: string]: any; // Allow other fields
}

/**
 * Extract spreadsheet ID from Google Sheets URL
 */
export function extractSpreadsheetId(url: string): string | null {
  try {
    // Handle different URL formats:
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Initialize Google Sheets client with service account
 */
export function initializeSheetsClient() {
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
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

/**
 * Verify Google Sheet access and get sheet info
 */
export async function verifyGoogleSheet(spreadsheetId: string) {
  try {
    const auth = await initializeSheetsClient();
    
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      auth,
    });

    const spreadsheet = response.data;
    const sheetsList = spreadsheet.sheets?.map(sheet => ({
      id: sheet.properties?.sheetId,
      title: sheet.properties?.title,
      rowCount: sheet.properties?.gridProperties?.rowCount || 0,
      columnCount: sheet.properties?.gridProperties?.columnCount || 0,
    })) || [];

    return {
      success: true,
      title: spreadsheet.properties?.title || "Untitled",
      sheets: sheetsList,
    };
  } catch (error: any) {
    console.error("Error verifying Google Sheet:", error);
    
    if (error?.code === 403 || error?.code === 404) {
      const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS || "{}");
      const serviceAccountEmail = credentials.client_email || "";
      
      throw new Error(
        `Permission denied. Please share the spreadsheet with: ${serviceAccountEmail} ` +
        "and grant at least 'Viewer' access."
      );
    }
    
    throw new Error(`Failed to verify sheet: ${error.message}`);
  }
}

/**
 * Fetch headers from a specific sheet
 */
export async function fetchSheetHeaders(spreadsheetId: string, sheetName: string = "Sheet1") {
  try {
    const auth = await initializeSheetsClient();
    
    const range = `${sheetName}!1:1`; // First row only
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      auth,
    });

    const values = response.data.values;
    if (!values || values.length === 0) {
      throw new Error("No headers found in sheet. Please ensure the first row contains column names.");
    }

    return (values[0] || []).map((cell: any) => String(cell || "").trim());
  } catch (error: any) {
    console.error("Error fetching sheet headers:", error);
    throw new Error(`Failed to fetch headers: ${error.message}`);
  }
}

/**
 * Fetch all data from a sheet
 */
export async function fetchSheetData(spreadsheetId: string, sheetName: string = "Sheet1") {
  try {
    const auth = await initializeSheetsClient();
    
    const range = `${sheetName}!A:Z`; // Fetch all columns A-Z
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      auth,
    });

    return response.data.values || [];
  } catch (error: any) {
    console.error("Error fetching sheet data:", error);
    throw new Error(`Failed to fetch sheet data: ${error.message}`);
  }
}

/**
 * Parse date string in multiple formats: YYYY-MM-DD or DD/MM/YYYY
 */
function parseDate(dateString: string): Date | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();
  
  // Try ISO format first: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try DD/MM/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date
    const year = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && 
        date.getDate() === day && 
        date.getMonth() === month && 
        date.getFullYear() === year) {
      return date;
    }
  }
  
  // Fallback to standard Date parsing
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  return null;
}

/**
 * Parse sheet rows into task data using column mapping
 */
export function parseTaskRows(
  rows: any[][],
  columnMapping: TaskColumnMapping,
  headerRow: string[]
): TaskRow[] {
  const tasks: TaskRow[] = [];

  if (rows.length <= 1) return tasks; // Skip if only headers or empty

  // Create reverse mapping: task field -> column index
  const fieldToIndex: { [field: string]: number } = {};
  Object.entries(columnMapping).forEach(([sheetColumn, taskField]) => {
    const index = headerRow.indexOf(sheetColumn);
    if (index !== -1) {
      fieldToIndex[taskField] = index;
    }
  });

  // Process data rows (skip header row at index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const task: TaskRow = {};

    // Map columns based on mapping
    Object.entries(fieldToIndex).forEach(([taskField, columnIndex]) => {
      const value = row[columnIndex];
      if (value !== undefined && value !== null && value !== "") {
        task[taskField] = String(value).trim();
      }
    });

    // Only add if at least title is present
    if (task.title) {
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Import tasks from Google Sheet for a property
 */
export async function importTasksFromSheet(
  propertyId: number,
  spreadsheetId: string,
  sheetName: string,
  columnMapping: TaskColumnMapping,
  uniqueColumn?: string
) {
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { company: true },
    });

    if (!property) {
      console.log('Property not found');
      throw new Error("Property not found");
    }

    // Fetch sheet data
    const rows = await fetchSheetData(spreadsheetId, sheetName);
    if (rows.length === 0) {
      console.log('No data found in sheet');
      throw new Error("No data found in sheet");

    }

    const headerRow = rows[0] || [];
    const taskRows = parseTaskRows(rows, columnMapping, headerRow);
    
    

    const createdTasks = [];
    const updatedTasks = [];
    const errors = [];

    // Map uniqueColumn (sheet column name) to the task field it maps to
    let uniqueTaskField: string | null = null;
    if (uniqueColumn) {
      // Find which task field the uniqueColumn maps to
      uniqueTaskField = columnMapping[uniqueColumn] || null;
      
      if (!uniqueTaskField) {
        console.log('111 Unique column not found in column mapping', uniqueColumn);
        console.warn(`[Sheet Sync] WARNING: Unique column "${uniqueColumn}" not found in column mapping!`);
      }
    } else {
      
    }

    
    
    for (const taskRow of taskRows) {
      try {
        // Get unique value from taskRow using the mapped field
        let uniqueValue: string | null = null;
        if (uniqueTaskField && taskRow[uniqueTaskField]) {
          uniqueValue = String(taskRow[uniqueTaskField]).trim();
          console.log('222 Unique value', uniqueValue);
        } else {
          
        }

        // Parse scheduled date (supports YYYY-MM-DD and DD/MM/YYYY formats)
        let scheduledDate: Date | null = null;
        if (taskRow.scheduledDate) {
          scheduledDate = parseDate(taskRow.scheduledDate);
          if (!scheduledDate) {
            console.log('Invalid scheduled date format', taskRow.scheduledDate);
            errors.push({ row: taskRow, error: `Invalid scheduled date format: ${taskRow.scheduledDate}. Expected YYYY-MM-DD or DD/MM/YYYY` });
            continue;
          }
        }

        // Parse move-in date (supports YYYY-MM-DD and DD/MM/YYYY formats)
        let moveInDate: Date | null = null;
        if (taskRow.moveInDate) {
          moveInDate = parseDate(taskRow.moveInDate);
          if (!moveInDate) {
            console.log('Invalid move-in date format', taskRow.moveInDate);
            errors.push({ row: taskRow, error: `Invalid move-in date format: ${taskRow.moveInDate}. Expected YYYY-MM-DD or DD/MM/YYYY` });
            continue;
          }
        }

        // Normalize dates to midnight for proper comparison (ignore time)
        if (scheduledDate) {
          scheduledDate.setHours(0, 0, 0, 0);
        }
        if (moveInDate) {
          moveInDate.setHours(0, 0, 0, 0);
        }

        // Find assigned user if email or name provided
        let assignedUserId: number | null = null;
        if (taskRow.assignedUserEmail) {
          const user = await prisma.user.findUnique({
            where: { email: taskRow.assignedUserEmail },
          });
          console.log('user', user);
          if (user && user.companyId === property.companyId) {
            assignedUserId = user.id;
          }
        }

        // Check if task already exists - ONLY using unique identifier per property
        let existingTask = null;
        
        if (uniqueValue) {
          // Use unique identifier to check for duplicates within this property
          const searchPattern = `[UNIQUE:${uniqueValue}]`;
          
          existingTask = await prisma.task.findFirst({
            where: {
              propertyId, // Ensure we only check within this property
              description: { contains: searchPattern },
            },
          });
          
          if (existingTask) {
            console.log(`[Sheet Sync] Found existing task by unique value: ${uniqueValue} (Task ID: ${existingTask.id}) for property ${propertyId}`);
          }
        } else if (uniqueColumn && uniqueTaskField) {
          console.log('Unique column is configured but no value in this row', uniqueColumn, uniqueTaskField);
          // Unique column is configured but no value in this row - log warning but continue
          console.warn(`[Sheet Sync] WARNING: Unique column "${uniqueColumn}" configured but no value in row for task: ${taskRow.title}`);
          console.warn(`[Sheet Sync] Skipping duplicate check - unique identifier is required to prevent duplicates`);
        } else {
          console.log('No unique column configured', uniqueColumn, uniqueTaskField);
            // No unique column configured - log warning
          console.warn(`[Sheet Sync] WARNING: No unique column configured for property ${propertyId}. Cannot prevent duplicate entries.`);
          console.warn(`[Sheet Sync] Please configure a unique identifier column in the mapping settings.`);
        }

        // Build description with unique value marker if available
        let description = taskRow.description || null;
        if (uniqueValue) {
          // Prepend unique marker to description for easy lookup
          description = description 
            ? `[UNIQUE:${uniqueValue}] ${description}`
            : `[UNIQUE:${uniqueValue}]`;
        }

        // Determine status: if moveInDate >= scheduledDate, set to RESERVED
        // This means the move-in date is greater than or equal to the available/scheduled date
        let taskStatus = taskRow.status || "PLANNED";
        if (moveInDate && scheduledDate) {
          // Compare dates: if moveInDate >= scheduledDate, mark as RESERVED
          if (moveInDate.getTime() >= scheduledDate.getTime()) {
            taskStatus = "RESERVED";
          }
        } else if (moveInDate && !scheduledDate) {
          // If only moveInDate exists without scheduledDate, also mark as RESERVED
          taskStatus = "RESERVED";
        }

        const taskData: any = {
          companyId: property.companyId,
          propertyId,
          title: taskRow.title || "Untitled Task",
          description,
          status: taskStatus,
          scheduledDate,
          moveInDate: moveInDate || null,
          assignedUserId: assignedUserId || null,
        };

        if (existingTask) {
          // Update existing task
          await prisma.task.update({
            where: { id: existingTask.id },
            data: taskData,
          });
          updatedTasks.push(existingTask.id);
          
        } else {
          // Create new task
          const newTask = await prisma.task.create({
            data: taskData,
          });
          createdTasks.push(newTask.id);
          

          // Send notification to assigned user if applicable, otherwise notify owners and managers
          if (assignedUserId) {
            try {
              await sendExpoPushNotification(
                assignedUserId,
                "New Task Assigned",
                `You have been assigned a new task: ${taskData.title}`,
                { type: "task_assignment", taskId: newTask.id }
              );
              await createNotification({
                userId: assignedUserId,
                title: "New Task Assigned",
                message: `You have been assigned a new task: ${taskData.title}`,
                type: "task_assigned",
                metadata: { taskId: newTask.id },
                screenRoute: "TaskDetail",
                screenParams: { taskId: newTask.id },
              });
            } catch (notifError) {
              console.error("Error sending notification:", notifError);
            }
          } else {
            // No user assigned - notify owners and managers in the company
            try {
              const ownersAndManagers = await prisma.user.findMany({
                where: {
                  companyId: property.companyId,
                  role: { in: [UserRole.OWNER, UserRole.MANAGER] },
                  isActive: true,
                },
                select: { id: true },
              });
            

              // Send notifications to all owners and managers
              for (const user of ownersAndManagers) {
                console.log('Sending notification to user', user.id);
                try {
                  await sendExpoPushNotification(
                    user.id,
                    "New Task Created",
                    `A new task has been created: ${taskData.title} at ${property.address}`,
                    { type: "task_created", taskId: newTask.id }
                  );
                  await createNotification({
                    userId: user.id,
                    title: "New Task Created",
                    message: `A new task has been created: ${taskData.title} at ${property.address}`,
                    type: "task_created",
                    metadata: { taskId: newTask.id },
                    screenRoute: "TaskDetail",
                    screenParams: { taskId: newTask.id },
                  });
                } catch (notifError) {
                  console.error(`Error sending notification to user ${user.id}:`, notifError);
                }
              }
            } catch (notifError) {
              console.error("Error sending notifications to owners/managers:", notifError);
            }
          }
        }
      } catch (error: any) {
        errors.push({ row: taskRow, error: error.message });
      }
    }

    // Update property sync timestamp
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        // @ts-ignore - Field exists in schema but types may not be updated
        sheetLastSyncedAt: new Date(),
      },
    });

    return {
      success: true,
      created: createdTasks.length,
      updated: updatedTasks.length,
      errors: errors.length,
      errorDetails: errors,
    };
  } catch (error: any) {
    console.error("Error importing tasks from sheet:", error);
    throw error;
  }
}

/**
 * Sync new rows from sheet (for cron job)
 */
export async function syncNewRowsFromSheet(propertyId: number) {
  try {
    
    
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    // @ts-ignore - Fields exist in schema but types may not be updated
    if (!property || !property.sheetSyncEnabled || !property.googleSheetId) {
      
      return { success: false, message: "Sheet sync not enabled or configured" };
    }

    // @ts-ignore - Field exists in schema but types may not be updated
    const columnMapping: TaskColumnMapping = property.sheetColumnMapping
      // @ts-ignore
      ? JSON.parse(property.sheetColumnMapping)
      : {};

    if (Object.keys(columnMapping).length === 0) {
      
      return { success: false, message: "No column mapping configured" };
    }

    // @ts-ignore
    

    const result = await importTasksFromSheet(
      propertyId,
      // @ts-ignore
      property.googleSheetId,
      // @ts-ignore
      property.googleSheetName || "Sheet1",
      columnMapping,
      // @ts-ignore
      property.sheetUniqueColumn || undefined
    );

    
    
    return result;
  } catch (error: any) {
    console.error(`[Sheet Sync] Error syncing property ${propertyId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync all properties with enabled sheet sync
 */
export async function syncAllPropertySheets() {
  try {
    const properties = await prisma.property.findMany({
      where: {
        // @ts-ignore - Fields exist in schema but types may not be updated
        sheetSyncEnabled: true,
        // @ts-ignore
        googleSheetId: { not: null },
      },
    });

    const results = [];
    for (const property of properties) {
      try {
        const result = await syncNewRowsFromSheet(property.id);
        results.push({
          propertyId: property.id,
          propertyAddress: property.address,
          ...result,
        });
      } catch (error: any) {
        results.push({
          propertyId: property.id,
          propertyAddress: property.address,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  } catch (error: any) {
    console.error("Error syncing all property sheets:", error);
    throw error;
  }
}

