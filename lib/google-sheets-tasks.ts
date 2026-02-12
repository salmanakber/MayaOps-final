import { google } from "googleapis";
import prisma from "./prisma";
import { UserRole } from "@prisma/client";
import { sendExpoPushNotification } from "./expo-push";
import { createNotification } from "./notifications";
import crypto from "crypto";

const sheets = google.sheets("v4");

export interface TaskColumnMapping {
  [sheetColumn: string]: string; // Maps sheet column name to task field
}

export interface TaskRow {
  propertyId?: string; // Property ID from sheet (matches property's sheetUniqueColumn)
  title?: string;
  description?: string;
  scheduledDate?: string;
  moveInDate?: string;
  availableDate?: string;
  assignedUserId?: number;
  status?: string;
  action?: string; // "add" or "remove"
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
 * Parse date string in multiple formats: YYYY-MM-DD, DD/MM/YYYY, or Google Sheets serial number
 */
function parseDate(dateString: string | number): Date | null {
  if (!dateString) {
    return null;
  }

  // Handle Google Sheets date serial numbers (days since 1899-12-30)
  if (typeof dateString === 'number') {
    // Google Sheets epoch is December 30, 1899
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + dateString * 24 * 60 * 60 * 1000);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return null;
  }

  if (typeof dateString !== 'string') {
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
  
  // Try DD/MM/YYYY format (e.g., 21/12/2025 or 12/2/2026) - ALWAYS prioritize DD/MM format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const firstPart = parseInt(parts[0], 10);
    const secondPart = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    // ALWAYS treat as DD/MM/YYYY format (day first, month second)
    // This is the standard format used in the UK/EU
    const day = firstPart;
    const month = secondPart - 1; // Month is 0-indexed in Date
    
    // Validate ranges
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 1900 && year <= 2100) {
    const date = new Date(year, month, day);
      // Check if date is valid
      if (!isNaN(date.getTime())) {
        // Verify the date components match (handles invalid dates like 31/02)
        if (date.getDate() === day && 
        date.getMonth() === month && 
        date.getFullYear() === year) {
      return date;
        } else {
          // Date was adjusted (e.g., 31/02 became 03/03), so it was invalid
          console.warn(`[Date Parse] Invalid date "${trimmed}" (DD/MM format) - date was adjusted to ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`);
        }
      }
    }
    
    // If DD/MM didn't work (e.g., invalid date like 31/02/2026), try MM/DD/YYYY as fallback
    // Only if the first attempt failed
    const monthUS = firstPart - 1;
    const dayUS = secondPart;
    
    if (dayUS >= 1 && dayUS <= 31 && monthUS >= 0 && monthUS <= 11 && year >= 1900 && year <= 2100) {
      const dateUS = new Date(year, monthUS, dayUS);
      if (!isNaN(dateUS.getTime()) && 
          dateUS.getDate() === dayUS && 
          dateUS.getMonth() === monthUS && 
          dateUS.getFullYear() === year) {
        // Only use MM/DD if DD/MM was invalid
        console.warn(`[Date Parse] Interpreted "${trimmed}" as MM/DD/YYYY (${monthUS + 1}/${dayUS}/${year}) because DD/MM format was invalid`);
        return dateUS;
      }
    }
    
    // If both formats failed, return null (don't use fallback Date parsing which can be unpredictable)
    console.error(`[Date Parse] Failed to parse date "${trimmed}" in both DD/MM/YYYY and MM/DD/YYYY formats`);
    return null;
  }
  
  // Fallback to standard Date parsing (but be careful - this can be unpredictable)
  // Only use this for formats we don't explicitly handle
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    // Additional validation to ensure it's a reasonable date
    const parsedYear = date.getFullYear();
    if (parsedYear >= 1900 && parsedYear <= 2100) {
    return date;
    }
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
    
    // Find the index of the unique column in the header row
    let uniqueColumnIndex: number | null = null;
    if (uniqueColumn) {
      uniqueColumnIndex = headerRow.indexOf(uniqueColumn);
      if (uniqueColumnIndex === -1) {
        console.warn(`[Sheet Sync] WARNING: Unique column "${uniqueColumn}" not found in sheet headers!`);
      } else {
        console.log(`[Sheet Sync] Unique column "${uniqueColumn}" found at index ${uniqueColumnIndex}`);
      }
    }

    const createdTasks = [];
    const updatedTasks = [];
    const errors = [];
    
    // Track tasks for batch notifications: userId -> { taskIds: [], taskTitles: [] }
    const tasksByAssignedUser = new Map<number, { taskIds: number[]; taskTitles: string[] }>();
    const unassignedTasks: { taskId: number; title: string; propertyAddress: string }[] = [];
    
    // Build fieldToIndex mapping once (reused for checking titles)
    const fieldToIndex: { [field: string]: number } = {};
    Object.entries(columnMapping).forEach(([sheetColumn, taskField]) => {
      const index = headerRow.indexOf(sheetColumn);
      if (index !== -1) {
        fieldToIndex[taskField] = index;
      }
    });
    
    // Process each taskRow and match it back to the raw row to extract unique identifier
    for (let taskRowIndex = 0; taskRowIndex < taskRows.length; taskRowIndex++) {
      const taskRow = taskRows[taskRowIndex];
      
      try {
        // Find the corresponding raw row by matching title (since parseTaskRows filters rows)
        let uniqueValue: string | null = null;
        let matchedRawRowIndex: number | null = null;
        
        // Try to find the raw row that matches this taskRow
        // We'll search for a row with the same title
        if (uniqueColumn && uniqueColumnIndex !== null && uniqueColumnIndex !== -1) {
          const titleIndex = fieldToIndex['title'];
          if (titleIndex !== undefined && taskRow.title) {
            // Find the raw row that has this title
            for (let rawRowIndex = 1; rawRowIndex < rows.length; rawRowIndex++) {
              const rawRow = rows[rawRowIndex];
              if (!rawRow || rawRow.length === 0) continue;
              
              const rawTitle = rawRow[titleIndex];
              if (rawTitle && String(rawTitle).trim() === taskRow.title.trim()) {
                // Found matching row - extract unique value
                matchedRawRowIndex = rawRowIndex;
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
        
        if (uniqueValue) {
          console.log(`[Sheet Sync] Extracted unique value from column "${uniqueColumn}" (index ${uniqueColumnIndex}): "${uniqueValue}"`);
        } else if (uniqueColumn) {
          console.log(`[Sheet Sync] Unique column "${uniqueColumn}" configured but no value found for task: ${taskRow.title}`);
        }

        // Parse scheduled date (supports YYYY-MM-DD, DD/MM/YYYY formats, and Google Sheets serial numbers)
        let scheduledDate: Date | null = null;
        if (taskRow.scheduledDate) {
          scheduledDate = parseDate(taskRow.scheduledDate);
          if (!scheduledDate) {
            console.log('Invalid scheduled date format', taskRow.scheduledDate);
            errors.push({ row: taskRow, error: `Invalid scheduled date format: ${taskRow.scheduledDate}. Expected DD/MM/YYYY, YYYY-MM-DD, or Google Sheets date serial number` });
            continue;
          }
        }

        // Parse move-in date (supports YYYY-MM-DD, DD/MM/YYYY formats, and Google Sheets serial numbers)
        let moveInDate: Date | null = null;
        if (taskRow.moveInDate) {
          moveInDate = parseDate(taskRow.moveInDate);
          if (!moveInDate) {
            console.log('Invalid move-in date format', taskRow.moveInDate);
            errors.push({ row: taskRow, error: `Invalid move-in date format: ${taskRow.moveInDate}. Expected DD/MM/YYYY, YYYY-MM-DD, or Google Sheets date serial number` });
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
        
        if (uniqueValue && uniqueValue.trim()) {
          // Use unique identifier field to check for duplicates within this property
          console.log(`[Sheet Sync] Checking for existing task with unique identifier: "${uniqueValue}" for property ${propertyId}`);
          
          existingTask = await prisma.task.findFirst({
            where: {
              propertyId, // Ensure we only check within this property
              uniqueIdentifier: uniqueValue, // Use dedicated uniqueIdentifier field
            },
          });
          
          if (existingTask) {
            console.log(`[Sheet Sync] ✓ Found existing task by unique identifier: ${uniqueValue} (Task ID: ${existingTask.id}) for property ${propertyId}`);
          } else {
            console.log(`[Sheet Sync] ✗ No existing task found with unique identifier: ${uniqueValue} - will create new task`);
          }
        } else if (uniqueColumn) {
          // Unique column is configured but no value in this row - log warning but continue
          console.warn(`[Sheet Sync] WARNING: Unique column "${uniqueColumn}" configured but no value in row for task: ${taskRow.title}`);
          console.warn(`[Sheet Sync] Skipping duplicate check - unique identifier is required to prevent duplicates`);
        } else {
          // No unique column configured - log warning
          console.warn(`[Sheet Sync] WARNING: No unique column configured for property ${propertyId}. Cannot prevent duplicate entries.`);
          console.warn(`[Sheet Sync] Please configure a unique identifier column in the mapping settings.`);
        }

        // Description - no need to add unique marker anymore since we have a dedicated field
        let description = taskRow.description || null;

        // Determine status (Awaiting Reservation logic)
        // Rule: if moveInDate >= availableDate (or scheduledDate fallback), show as AWAITING (Awaiting Reservation)
        let taskStatus = taskRow.status || "PLANNED";
        const compareDate = scheduledDate; // legacy sheets treat scheduledDate as available date
        if (moveInDate && compareDate) {
          if (moveInDate.getTime() >= compareDate.getTime()) {
            taskStatus = "AWAITING";
          }
        } else if (moveInDate && !compareDate) {
          taskStatus = "AWAITING";
        }

        const taskData: any = {
          companyId: property.companyId,
          propertyId,
          title: taskRow.title || "Untitled Task",
          description,
          status: taskStatus,
          scheduledDate,
          moveInDate: moveInDate || null,
          uniqueIdentifier: uniqueValue && uniqueValue.trim() ? uniqueValue.trim() : null,
          assignedUserId: assignedUserId || null,
        };

        if (existingTask) {
          // Check if any data actually changed before updating
          const hasChanges = 
            existingTask.title !== taskData.title ||
            existingTask.description !== taskData.description ||
            (existingTask.scheduledDate?.getTime() !== taskData.scheduledDate?.getTime()) ||
            (existingTask.moveInDate?.getTime() !== taskData.moveInDate?.getTime()) ||
            existingTask.status !== taskData.status ||
            existingTask.assignedUserId !== taskData.assignedUserId;
          
          if (hasChanges) {
          console.log(`[Sheet Sync] Updating existing task ID: ${existingTask.id} with unique value: ${uniqueValue}`);
          await prisma.task.update({
            where: { id: existingTask.id },
            data: taskData,
          });
          updatedTasks.push(existingTask.id);
          console.log(`[Sheet Sync] ✓ Task updated successfully (ID: ${existingTask.id})`);
          } else {
            console.log(`[Sheet Sync] Task unchanged (ID: ${existingTask.id}) - skipping update`);
          }
        } else {
          // Create new task (only if unique identifier check didn't find existing task)
          if (uniqueValue && uniqueValue.trim()) {
            console.log(`[Sheet Sync] Creating new task with unique value: ${uniqueValue}`);
          } else {
            console.log(`[Sheet Sync] Creating new task without unique identifier (may create duplicates)`);
          }
          const newTask = await prisma.task.create({
            data: taskData,
          });
          createdTasks.push(newTask.id);
          console.log(`[Sheet Sync] ✓ New task created (ID: ${newTask.id}) with description: ${taskData.description?.substring(0, 100)}`);
          
          // Track for batch notification
          if (assignedUserId) {
            if (!tasksByAssignedUser.has(assignedUserId)) {
              tasksByAssignedUser.set(assignedUserId, { taskIds: [], taskTitles: [] });
            }
            const userTasks = tasksByAssignedUser.get(assignedUserId)!;
            userTasks.taskIds.push(newTask.id);
            userTasks.taskTitles.push(taskData.title);
          } else {
            unassignedTasks.push({ taskId: newTask.id, title: taskData.title, propertyAddress: property.address });
          }
        }
      } catch (error: any) {
        errors.push({ row: taskRow, error: error.message });
      }
    }

    // Send batch notifications for assigned users - ONLY if there are new tasks
    if (tasksByAssignedUser.size > 0) {
      console.log(`[Sheet Sync] Sending notifications for ${tasksByAssignedUser.size} assigned user(s) with new tasks`);
      for (const [userId, { taskIds, taskTitles }] of Array.from(tasksByAssignedUser.entries())) {
        try {
          const taskCount = taskIds.length;
          const titleText = taskCount === 1 
            ? `You have been assigned a new task: ${taskTitles[0]}`
            : `You have been assigned ${taskCount} new tasks`;
          const messageText = taskCount === 1
            ? taskTitles[0]
            : taskTitles.slice(0, 3).join(', ') + (taskCount > 3 ? ` and ${taskCount - 3} more` : '');
          
              await sendExpoPushNotification(
            userId,
            "New Tasks Assigned",
            titleText,
            { type: "task_assignment", taskIds, taskCount }
              );
              await createNotification({
            userId,
            title: "New Tasks Assigned",
            message: messageText,
                type: "task_assigned",
            metadata: { taskIds, taskCount },
            screenRoute: "TasksList",
              });
          console.log(`[Sheet Sync] ✓ Notification sent to user ${userId} for ${taskCount} new task(s)`);
            } catch (notifError) {
          console.error(`Error sending batch notification to user ${userId}:`, notifError);
        }
            }
          } else {
      console.log(`[Sheet Sync] No new tasks for assigned users - skipping notifications`);
    }
    
    // Send batch notification to owners/managers for unassigned tasks - ONLY if there are new tasks
    if (unassignedTasks.length > 0) {
      console.log(`[Sheet Sync] Sending notifications for ${unassignedTasks.length} unassigned new task(s)`);
            try {
              const ownersAndManagers = await prisma.user.findMany({
                where: {
                  companyId: property.companyId,
                  role: { in: [UserRole.OWNER, UserRole.MANAGER] },
                  isActive: true,
                },
                select: { id: true },
              });
            
        const taskCount = unassignedTasks.length;
        const titleText = taskCount === 1
          ? `A new task has been created: ${unassignedTasks[0].title}`
          : `${taskCount} new tasks have been created`;
        const messageText = taskCount === 1
          ? `${unassignedTasks[0].title} at ${unassignedTasks[0].propertyAddress}`
          : unassignedTasks.slice(0, 3).map(t => t.title).join(', ') + (taskCount > 3 ? ` and ${taskCount - 3} more` : '');
        
              for (const user of ownersAndManagers) {
                try {
                  await sendExpoPushNotification(
                    user.id,
              "New Tasks Created",
              titleText,
              { type: "task_created", taskIds: unassignedTasks.map(t => t.taskId), taskCount }
                  );
                  await createNotification({
                    userId: user.id,
              title: "New Tasks Created",
              message: messageText,
                    type: "task_created",
              metadata: { taskIds: unassignedTasks.map(t => t.taskId), taskCount },
              screenRoute: "TasksList",
                  });
            console.log(`[Sheet Sync] ✓ Notification sent to owner/manager ${user.id} for ${taskCount} new task(s)`);
                } catch (notifError) {
            console.error(`Error sending batch notification to user ${user.id}:`, notifError);
                }
              }
            } catch (notifError) {
        console.error("Error sending batch notifications to owners/managers:", notifError);
      }
    } else {
      console.log(`[Sheet Sync] No new unassigned tasks - skipping notifications`);
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
 * Generate unique identifier hash for a task
 * Format: sha1(propertyId + propertyAddress)
 * Note: Title is excluded so that updating the title doesn't create a new task
 */
function generateTaskUniqueIdentifier(propertyId: number, propertyAddress: string): string {
  const hashInput = `${propertyId}${propertyAddress}`;
  return crypto.createHash('sha1').update(hashInput).digest('hex');
}

/**
 * Import tasks from Google Sheet for a company (company-level sync)
 * Uses property ID column to match tasks to properties
 * Generates unique identifier hash: sha1(propertyId + address)
 * Note: Title is excluded from hash so updating title updates existing task instead of creating new one
 */
export async function importTasksFromCompanySheet(
  companyId: number,
  spreadsheetId: string,
  sheetName: string,
  columnMapping: TaskColumnMapping,
  propertyIdColumn?: string,
  actionColumn?: string
) {
  try {
    if (!propertyIdColumn) {
      throw new Error("propertyIdColumn is required for company task sync");
    }
    if (!actionColumn) {
      throw new Error("actionColumn is required for company task sync");
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // Fetch sheet data
    const rows = await fetchSheetData(spreadsheetId, sheetName);
    if (rows.length === 0) {
      throw new Error("No data found in sheet");
    }

    const headerRow = rows[0] || [];
    const taskRows = parseTaskRows(rows, columnMapping, headerRow);
    
    // Find indices for property ID and action columns
    const propertyIdColumnIndex = headerRow.indexOf(propertyIdColumn);
    const actionColumnIndex = headerRow.indexOf(actionColumn);

    if (propertyIdColumnIndex === -1) {
      throw new Error(`Property ID column "${propertyIdColumn}" not found in sheet headers`);
    }
    if (actionColumnIndex === -1) {
      throw new Error(`Action column "${actionColumn}" not found in sheet headers`);
    }

    const createdTasks = [];
    const updatedTasks = [];
    const removedTasks = [];
    const errors = [];
    
    // Track tasks for batch notifications: userId -> { taskIds: [], taskTitles: [] }
    const tasksByAssignedUser = new Map<number, { taskIds: number[]; taskTitles: string[] }>();
    const unassignedTasks: { taskId: number; title: string; propertyAddress: string }[] = [];
    
    // Track updated tasks for notifications: userId -> { taskIds: [], taskTitles: [] }
    const updatedTasksByAssignedUser = new Map<number, { taskIds: number[]; taskTitles: string[] }>();
    const updatedUnassignedTasks: { taskId: number; title: string; propertyAddress: string }[] = [];
    
    // Build fieldToIndex mapping
    const fieldToIndex: { [field: string]: number } = {};
    Object.entries(columnMapping).forEach(([sheetColumn, taskField]) => {
      const index = headerRow.indexOf(sheetColumn);
      if (index !== -1) {
        fieldToIndex[taskField] = index;
      }
    });
    
    // Get all properties for this company with their sheetUniqueColumn values and addresses
    const properties = await prisma.property.findMany({
      where: { companyId, isActive: true },
      select: { id: true, sheetUniqueColumn: true, address: true },
    });
    
    // Create a map: sheetUniqueColumn -> { propertyId, address }
    const propertyIdMap = new Map<string, { id: number; address: string }>();
    properties.forEach(prop => {
      // @ts-ignore
      if (prop.sheetUniqueColumn) {
        // @ts-ignore
        propertyIdMap.set(String(prop.sheetUniqueColumn), { id: prop.id, address: prop.address || '' });
      }
    });
    
    // Process each RAW sheet row (do not rely on title matching; needed for reliable remove)
    for (let rawRowIndex = 1; rawRowIndex < rows.length; rawRowIndex++) {
      const rawRow = rows[rawRowIndex];
      if (!rawRow || rawRow.length === 0) continue;

      try {
        const sheetPropertyId = String(rawRow[propertyIdColumnIndex] ?? "").trim();
        const action = String(rawRow[actionColumnIndex] ?? "").trim().toLowerCase();

        // Skip completely empty control rows
        if (!sheetPropertyId && !action) continue;

        if (!sheetPropertyId) {
          errors.push({ row: { rawRowIndex: rawRowIndex + 1 }, error: "Property ID is required" });
          continue;
        }
        if (!action) {
          errors.push({ row: { rawRowIndex: rawRowIndex + 1 }, error: "Action is required (add/remove)" });
          continue;
        }
        if (action !== "add" && action !== "remove") {
          errors.push({ row: { rawRowIndex: rawRowIndex + 1 }, error: `Invalid action "${action}". Use add/remove.` });
          continue;
        }

        const propertyInfo = propertyIdMap.get(sheetPropertyId) ?? null;
        if (!propertyInfo) {
          errors.push({ row: { rawRowIndex: rawRowIndex + 1 }, error: `Property ID "${sheetPropertyId}" not found in company properties` });
          continue;
        }
        const propertyId = propertyInfo.id;
        const propertyAddress = propertyInfo.address;

        // For REMOVE action, generate hash from propertyId and address (no title needed)
        if (action === "remove") {
          // Generate hash to find the task (only one task per property based on hash)
          const uniqueValue = generateTaskUniqueIdentifier(propertyId, propertyAddress);
          
          const taskToDelete = await prisma.task.findFirst({
            where: { companyId, propertyId, uniqueIdentifier: uniqueValue },
          });

          if (taskToDelete) {
            await prisma.task.delete({ where: { id: taskToDelete.id } });
            removedTasks.push(taskToDelete.id);
            console.log(`[Sheet Sync] Task removed (ID: ${taskToDelete.id}) for property "${sheetPropertyId}"`);
          } else {
            // Not fatal, but useful feedback
            errors.push({ row: { rawRowIndex: rawRowIndex + 1 }, error: `No task found to remove for property "${sheetPropertyId}"` });
          }
          continue;
        }

        // ADD: map task fields from row using mapping
        const title = fieldToIndex.title !== undefined ? String(rawRow[fieldToIndex.title] ?? "").trim() : "";
        const description = fieldToIndex.description !== undefined ? String(rawRow[fieldToIndex.description] ?? "").trim() : "";
        // Extract date values - preserve raw value (could be string, number, or Date object)
        const scheduledDateRaw = fieldToIndex.scheduledDate !== undefined ? rawRow[fieldToIndex.scheduledDate] : null;
        const moveInDateRaw = fieldToIndex.moveInDate !== undefined ? rawRow[fieldToIndex.moveInDate] : null;
        const availableDateRaw = fieldToIndex.availableDate !== undefined ? rawRow[fieldToIndex.availableDate] : null;
        const assignedUserEmail = fieldToIndex.assignedUserEmail !== undefined ? String(rawRow[fieldToIndex.assignedUserEmail] ?? "").trim() : "";
        const statusStr = fieldToIndex.status !== undefined ? String(rawRow[fieldToIndex.status] ?? "").trim() : "";

        if (!title) {
          errors.push({ row: { rawRowIndex: rawRowIndex + 1 }, error: "Title is required for action=add" });
          continue;
        }

        // Parse dates - handle both string formats (DD/MM/YYYY) and Google Sheets serial numbers
        // Note: If scheduledDate is not mapped, we'll try to auto-detect it from unmapped date columns
        let scheduledDate: Date | null = null;
        if (scheduledDateRaw !== null && scheduledDateRaw !== undefined && scheduledDateRaw !== "") {
          scheduledDate = parseDate(scheduledDateRaw);
          if (!scheduledDate) {
            const dateStr = typeof scheduledDateRaw === 'string' ? scheduledDateRaw : String(scheduledDateRaw);
            errors.push({ row: { rawRowIndex: rawRowIndex + 1 }, error: `Invalid scheduled/available date format: ${dateStr}. Expected DD/MM/YYYY or YYYY-MM-DD` });
            continue;
          }
          scheduledDate.setHours(0, 0, 0, 0);
        } else if (fieldToIndex.scheduledDate === undefined) {
          // If scheduledDate is not mapped, try to auto-detect it by looking for date-like values in the row
          // Skip columns that are already mapped to other fields (especially other date fields)
          const mappedIndices = new Set(Object.values(fieldToIndex));
          const dateFieldIndices = new Set([
            fieldToIndex.moveInDate,
            fieldToIndex.availableDate,
          ].filter(idx => idx !== undefined));
          
          for (let colIdx = 0; colIdx < rawRow.length; colIdx++) {
            // Skip already mapped columns and columns mapped to other date fields
            if (mappedIndices.has(colIdx) || dateFieldIndices.has(colIdx)) continue;
            
            const cellValue = rawRow[colIdx];
            if (cellValue !== null && cellValue !== undefined && cellValue !== "") {
              const parsed = parseDate(cellValue);
              if (parsed) {
                // Found a date that's not mapped to any date field - use it as scheduledDate
                scheduledDate = parsed;
                scheduledDate.setHours(0, 0, 0, 0);
                console.log(`[Sheet Sync] ⚠️ Auto-detected scheduledDate from column index ${colIdx} (value: ${cellValue}). Please map this column to "Scheduled Date" in your configuration.`);
                break;
              }
            }
          }
          
          if (!scheduledDate) {
            console.log(`[Sheet Sync] ⚠️ scheduledDate not mapped and no unmapped date found in row ${rawRowIndex + 1}. Please map a column to "Scheduled Date" in your configuration.`);
          }
        }

        let moveInDate: Date | null = null;
        if (moveInDateRaw !== null && moveInDateRaw !== undefined && moveInDateRaw !== "") {
          moveInDate = parseDate(moveInDateRaw);
          if (moveInDate) moveInDate.setHours(0, 0, 0, 0);
        }

        let availableDate: Date | null = null;
        if (availableDateRaw !== null && availableDateRaw !== undefined && availableDateRaw !== "") {
          availableDate = parseDate(availableDateRaw);
          if (availableDate) availableDate.setHours(0, 0, 0, 0);
        }

        // Find assigned user
        let assignedUserId: number | null = null;
        if (assignedUserEmail) {
          const user = await prisma.user.findUnique({ where: { email: assignedUserEmail } });
          if (user && user.companyId === companyId) assignedUserId = user.id;
        }

        // Determine status (Awaiting Reservation logic)
        let taskStatus = statusStr || "PLANNED";
        const compareDate = availableDate || scheduledDate;
        if (moveInDate && compareDate) {
          if (moveInDate.getTime() >= compareDate.getTime()) {
            taskStatus = "AWAITING";
          }
        } else if (moveInDate && !compareDate) {
          taskStatus = "AWAITING";
        }

        // Generate unique identifier hash: sha1(propertyId + address)
        // Note: Title is excluded so updating title updates existing task instead of creating new one
        const uniqueValue = generateTaskUniqueIdentifier(propertyId, propertyAddress);

        // Upsert by uniqueIdentifier per property
        const existingTask = await prisma.task.findFirst({
          where: { companyId, propertyId, uniqueIdentifier: uniqueValue },
        });

        const taskData: any = {
          companyId,
          propertyId,
          title,
          description: description || null,
          scheduledDate: scheduledDate || null,
          moveInDate: moveInDate || null,
          status: taskStatus,
          assignedUserId: assignedUserId || null,
          uniqueIdentifier: uniqueValue,
        };

        

        if (existingTask) {
          // Check if any data actually changed before updating
          const hasChanges = 
            existingTask.title !== title ||
            existingTask.description !== (description || null) ||
            (existingTask.scheduledDate?.getTime() !== scheduledDate?.getTime()) ||
            (existingTask.moveInDate?.getTime() !== moveInDate?.getTime()) ||
            existingTask.status !== taskStatus ||
            existingTask.assignedUserId !== (assignedUserId || null);
          
          if (hasChanges) {
            await prisma.task.update({ where: { id: existingTask.id }, data: taskData });
            updatedTasks.push(existingTask.id);
            console.log(`[Sheet Sync] Task updated (ID: ${existingTask.id}) - changes detected`);
            
            // Track for batch notification - ONLY for updated tasks
            if (assignedUserId) {
              if (!updatedTasksByAssignedUser.has(assignedUserId)) {
                updatedTasksByAssignedUser.set(assignedUserId, { taskIds: [], taskTitles: [] });
              }
              const userTasks = updatedTasksByAssignedUser.get(assignedUserId)!;
              userTasks.taskIds.push(existingTask.id);
              userTasks.taskTitles.push(title);
            } else {
              updatedUnassignedTasks.push({ taskId: existingTask.id, title, propertyAddress });
            }
          } else {
            console.log(`[Sheet Sync] Task unchanged (ID: ${existingTask.id}) - skipping update`);
          }
        } else {
          // Only create new task and send notification if task doesn't exist
          const newTask = await prisma.task.create({ data: taskData });
          createdTasks.push(newTask.id);
          console.log(`[Sheet Sync] New task created (ID: ${newTask.id})`);
          
          // Track for batch notification - ONLY for newly created tasks
          if (assignedUserId) {
            if (!tasksByAssignedUser.has(assignedUserId)) {
              tasksByAssignedUser.set(assignedUserId, { taskIds: [], taskTitles: [] });
            }
            const userTasks = tasksByAssignedUser.get(assignedUserId)!;
            userTasks.taskIds.push(newTask.id);
            userTasks.taskTitles.push(title);
          } else {
            unassignedTasks.push({ taskId: newTask.id, title, propertyAddress });
          }
        }
      } catch (error: any) {
        errors.push({ row: { rawRowIndex: rawRowIndex + 1 }, error: error.message });
      }
    }
    
    // Send batch notifications for assigned users - ONLY if there are new tasks
    if (tasksByAssignedUser.size > 0) {
      console.log(`[Sheet Sync] Sending notifications for ${tasksByAssignedUser.size} assigned user(s) with new tasks`);
      for (const [userId, { taskIds, taskTitles }] of Array.from(tasksByAssignedUser.entries())) {
        try {
          const taskCount = taskIds.length;
          const titleText = taskCount === 1 
            ? `You have been assigned a new task: ${taskTitles[0]}`
            : `You have been assigned ${taskCount} new tasks`;
          const messageText = taskCount === 1
            ? taskTitles[0]
            : taskTitles.slice(0, 3).join(', ') + (taskCount > 3 ? ` and ${taskCount - 3} more` : '');
          
          await sendExpoPushNotification(
            userId,
            "New Tasks Assigned",
            titleText,
            { type: "task_assignment", taskIds, taskCount }
          );
          await createNotification({
            userId,
            title: "New Tasks Assigned",
            message: messageText,
            type: "task_assigned",
            metadata: { taskIds, taskCount },
            screenRoute: "TasksList",
          });
          console.log(`[Sheet Sync] ✓ Notification sent to user ${userId} for ${taskCount} new task(s)`);
        } catch (notifError) {
          console.error(`Error sending batch notification to user ${userId}:`, notifError);
        }
      }
    } else {
      console.log(`[Sheet Sync] No new tasks for assigned users - skipping notifications`);
    }
    
    // Send batch notification to owners/managers for unassigned tasks - ONLY if there are new tasks
    if (unassignedTasks.length > 0) {
      console.log(`[Sheet Sync] Sending notifications for ${unassignedTasks.length} unassigned new task(s)`);
      try {
        const ownersAndManagers = await prisma.user.findMany({
          where: {
            companyId,
            role: { in: [UserRole.OWNER, UserRole.MANAGER] },
            isActive: true,
          },
          select: { id: true },
        });
        
        const taskCount = unassignedTasks.length;
        const titleText = taskCount === 1
          ? `A new task has been created: ${unassignedTasks[0].title}`
          : `${taskCount} new tasks have been created`;
        const messageText = taskCount === 1
          ? `${unassignedTasks[0].title} at ${unassignedTasks[0].propertyAddress}`
          : unassignedTasks.slice(0, 3).map(t => t.title).join(', ') + (taskCount > 3 ? ` and ${taskCount - 3} more` : '');
        
        for (const user of ownersAndManagers) {
          try {
            await sendExpoPushNotification(
              user.id,
              "New Tasks Created",
              titleText,
              { type: "task_created", taskIds: unassignedTasks.map(t => t.taskId), taskCount }
            );
            await createNotification({
              userId: user.id,
              title: "New Tasks Created",
              message: messageText,
              type: "task_created",
              metadata: { taskIds: unassignedTasks.map(t => t.taskId), taskCount },
              screenRoute: "TasksList",
            });
            console.log(`[Sheet Sync] ✓ Notification sent to owner/manager ${user.id} for ${taskCount} new task(s)`);
          } catch (notifError) {
            console.error(`Error sending batch notification to user ${user.id}:`, notifError);
          }
        }
      } catch (notifError) {
        console.error("Error sending batch notifications to owners/managers:", notifError);
      }
    } else {
      console.log(`[Sheet Sync] No new unassigned tasks - skipping notifications`);
    }
    
    // Send batch notifications for updated tasks
    if (updatedTasksByAssignedUser.size > 0) {
      console.log(`[Sheet Sync] Sending notifications for ${updatedTasksByAssignedUser.size} assigned user(s) with updated tasks`);
      for (const [userId, { taskIds, taskTitles }] of Array.from(updatedTasksByAssignedUser.entries())) {
        try {
          const taskCount = taskIds.length;
          const titleText = taskCount === 1 
            ? `Task updated: ${taskTitles[0]}`
            : `${taskCount} tasks have been updated`;
          const messageText = taskCount === 1
            ? taskTitles[0]
            : taskTitles.slice(0, 3).join(', ') + (taskCount > 3 ? ` and ${taskCount - 3} more` : '');
          
          await sendExpoPushNotification(
            userId,
            "Tasks Updated",
            titleText,
            { type: "task_updated", taskIds, taskCount }
          );
          await createNotification({
            userId,
            title: "Tasks Updated",
            message: messageText,
            type: "task_updated",
            metadata: { taskIds, taskCount },
            screenRoute: "TasksList",
          });
          console.log(`[Sheet Sync] ✓ Notification sent to user ${userId} for ${taskCount} updated task(s)`);
        } catch (notifError) {
          console.error(`Error sending batch notification to user ${userId}:`, notifError);
        }
      }
    }
    
    // Send batch notification to owners/managers for updated unassigned tasks
    if (updatedUnassignedTasks.length > 0) {
      console.log(`[Sheet Sync] Sending notifications for ${updatedUnassignedTasks.length} updated unassigned task(s)`);
      try {
        const ownersAndManagers = await prisma.user.findMany({
          where: {
            companyId,
            role: { in: [UserRole.OWNER, UserRole.MANAGER] },
            isActive: true,
          },
          select: { id: true },
        });
        
        const taskCount = updatedUnassignedTasks.length;
        const titleText = taskCount === 1
          ? `Task updated: ${updatedUnassignedTasks[0].title}`
          : `${taskCount} tasks have been updated`;
        const messageText = taskCount === 1
          ? `${updatedUnassignedTasks[0].title} at ${updatedUnassignedTasks[0].propertyAddress}`
          : updatedUnassignedTasks.slice(0, 3).map(t => t.title).join(', ') + (taskCount > 3 ? ` and ${taskCount - 3} more` : '');
        
        for (const user of ownersAndManagers) {
          try {
            await sendExpoPushNotification(
              user.id,
              "Tasks Updated",
              titleText,
              { type: "task_updated", taskIds: updatedUnassignedTasks.map(t => t.taskId), taskCount }
            );
            await createNotification({
              userId: user.id,
              title: "Tasks Updated",
              message: messageText,
              type: "task_updated",
              metadata: { taskIds: updatedUnassignedTasks.map(t => t.taskId), taskCount },
              screenRoute: "TasksList",
            });
            console.log(`[Sheet Sync] ✓ Notification sent to owner/manager ${user.id} for ${taskCount} updated task(s)`);
          } catch (notifError) {
            console.error(`Error sending batch notification to user ${user.id}:`, notifError);
          }
        }
      } catch (notifError) {
        console.error("Error sending batch notifications to owners/managers:", notifError);
      }
    }
    
    return {
      success: true,
      created: createdTasks.length,
      updated: updatedTasks.length,
      removed: removedTasks.length,
      errors: errors.length,
      errorDetails: errors,
    };
  } catch (error: any) {
    console.error("Error importing tasks from company sheet:", error);
    throw error;
  }
}

/**
 * Sync all company task sheets (company-level sync)
 */
export async function syncAllCompanyTaskSheets() {
  try {
    // Get all companies
    const companies = await prisma.company.findMany({
      where: { subscriptionStatus: 'active' },
      select: { id: true, name: true },
    });

    const results = [];
    for (const company of companies) {
      try {
        // Get company task sheet configuration from SystemSettings
        const spreadsheetIdSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_task_sheet_id` },
        });

        if (!spreadsheetIdSetting || !spreadsheetIdSetting.value) {
          continue; // Skip companies without task sheet configured
        }

        const spreadsheetId = spreadsheetIdSetting.value;
        const sheetNameSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_task_sheet_name` },
        });
        const sheetName = sheetNameSetting?.value || 'Sheet1';

        const mappingSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_task_sheet_mapping` },
        });
        if (!mappingSetting || !mappingSetting.value) {
          continue; // Skip if no mapping configured
        }

        const columnMapping: TaskColumnMapping = JSON.parse(mappingSetting.value);

        const propertyIdColumnSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_task_sheet_property_id_column` },
        });
        if (!propertyIdColumnSetting || !propertyIdColumnSetting.value) {
          continue; // Property ID column is required
        }
        const propertyIdColumn = propertyIdColumnSetting.value;

        const actionColumnSetting = await prisma.systemSetting.findUnique({
          where: { key: `company_${company.id}_task_sheet_action_column` },
        });
        if (!actionColumnSetting || !actionColumnSetting.value) {
          continue; // Action column is required
        }
        const actionColumn = actionColumnSetting.value;

        // Sync tasks from company sheet
        const result = await importTasksFromCompanySheet(
          company.id,
          spreadsheetId,
          sheetName,
          columnMapping,
          propertyIdColumn,
          actionColumn
        );

        results.push({
          companyId: company.id,
          companyName: company.name,
          ...result,
        });
      } catch (error: any) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  } catch (error: any) {
    console.error("Error syncing all company task sheets:", error);
    throw error;
  }
}

/**
 * Sync all properties with enabled sheet sync (legacy per-property sync)
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

