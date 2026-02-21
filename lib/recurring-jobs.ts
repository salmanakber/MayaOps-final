import prisma from './prisma';
import { RecurringJob } from '@prisma/client';

export type RecurrenceType = 'interval' | 'weekly';

/**
 * Calculate next run time for interval-based recurrence
 * Always calculates from previous scheduled time to prevent drift
 */
export function calculateNextIntervalRun(
  previousNextRunAt: Date,
  intervalDays: number
): Date {
  const next = new Date(previousNextRunAt);
  next.setUTCDate(next.getUTCDate() + intervalDays);
  return next;
}

/**
 * Calculate next run time for weekly recurrence
 * Finds the next closest allowed weekday strictly after current execution
 * Maintains the same time of day
 */
export function calculateNextWeeklyRun(
  previousNextRunAt: Date,
  allowedDaysOfWeek: number[] // [1,2,3] where 1=Monday, 7=Sunday
): Date {
  if (allowedDaysOfWeek.length === 0) {
    throw new Error('allowedDaysOfWeek must contain at least one day');
  }

  // Get current day of week (0=Sunday, 1=Monday, etc.)
  // Convert to our format (1=Monday, 7=Sunday)
  let currentDay = previousNextRunAt.getUTCDay();
  if (currentDay === 0) currentDay = 7; // Sunday = 7
  else currentDay = currentDay; // Monday = 1, etc.

  // Find next allowed day
  const sortedDays = [...allowedDaysOfWeek].sort((a, b) => a - b);
  
  // Look for next day in current week
  let nextDay = sortedDays.find(day => day > currentDay);
  
  // If no day found in current week, use first day of next week
  if (!nextDay) {
    nextDay = sortedDays[0];
  }

  // Calculate days to add
  let daysToAdd: number;
  if (nextDay > currentDay) {
    daysToAdd = nextDay - currentDay;
  } else {
    // Wrap to next week
    daysToAdd = (7 - currentDay) + nextDay;
  }

  const next = new Date(previousNextRunAt);
  next.setUTCDate(next.getUTCDate() + daysToAdd);
  
  // Maintain same time of day
  return next;
}

/**
 * Calculate next run time based on recurrence type
 */
export function calculateNextRunAt(
  recurringJob: RecurringJob
): Date {
  if (recurringJob.recurrenceType === 'interval') {
    if (!recurringJob.intervalDays || recurringJob.intervalDays <= 0) {
      throw new Error('intervalDays must be greater than 0 for interval type');
    }
    return calculateNextIntervalRun(recurringJob.nextRunAt, recurringJob.intervalDays);
  } else if (recurringJob.recurrenceType === 'weekly') {
    if (!recurringJob.allowedDaysOfWeek) {
      throw new Error('allowedDaysOfWeek is required for weekly type');
    }
    const days = JSON.parse(recurringJob.allowedDaysOfWeek) as number[];
    if (days.length === 0) {
      throw new Error('allowedDaysOfWeek must contain at least one day');
    }
    return calculateNextWeeklyRun(recurringJob.nextRunAt, days);
  } else {
    throw new Error(`Unknown recurrence type: ${recurringJob.recurrenceType}`);
  }
}

/**
 * Check if recurring job should still be active
 */
export function shouldJobBeActive(recurringJob: RecurringJob): boolean {
  // Check end date
  if (recurringJob.endDate) {
    const now = new Date();
    if (now > recurringJob.endDate) {
      return false;
    }
  }

  // Check max occurrences
  if (recurringJob.maxOccurrences) {
    if (recurringJob.currentOccurrenceCount >= recurringJob.maxOccurrences) {
      return false;
    }
  }

  return true;
}

/**
 * Validate recurring job configuration
 */
export function validateRecurringJobConfig(data: {
  recurrenceType: RecurrenceType;
  intervalDays?: number | null;
  allowedDaysOfWeek?: string | null;
  nextRunAt: Date;
  endDate?: Date | null;
  maxOccurrences?: number | null;
}): { valid: boolean; error?: string } {
  if (data.recurrenceType === 'interval') {
    if (!data.intervalDays || data.intervalDays <= 0) {
      return { valid: false, error: 'intervalDays must be greater than 0 for interval type' };
    }
  } else if (data.recurrenceType === 'weekly') {
    if (!data.allowedDaysOfWeek) {
      return { valid: false, error: 'allowedDaysOfWeek is required for weekly type' };
    }
    try {
      const days = JSON.parse(data.allowedDaysOfWeek) as number[];
      if (!Array.isArray(days) || days.length === 0) {
        return { valid: false, error: 'allowedDaysOfWeek must be a non-empty array' };
      }
      // Validate day numbers (1-7)
      for (const day of days) {
        if (typeof day !== 'number' || day < 1 || day > 7) {
          return { valid: false, error: 'allowedDaysOfWeek must contain numbers between 1 and 7' };
        }
      }
    } catch (e) {
      return { valid: false, error: 'allowedDaysOfWeek must be valid JSON array' };
    }
  } else {
    return { valid: false, error: `Unknown recurrence type: ${data.recurrenceType}` };
  }

  // Validate nextRunAt is in the future
  if (data.nextRunAt <= new Date()) {
    return { valid: false, error: 'nextRunAt must be in the future' };
  }

  // Validate endDate is after nextRunAt if provided
  if (data.endDate && data.endDate <= data.nextRunAt) {
    return { valid: false, error: 'endDate must be after nextRunAt' };
  }

  // Validate maxOccurrences is positive if provided
  if (data.maxOccurrences !== null && data.maxOccurrences !== undefined) {
    if (data.maxOccurrences <= 0) {
      return { valid: false, error: 'maxOccurrences must be greater than 0' };
    }
  }

  return { valid: true };
}
