/**
 * Rota Conflict Detection and Validation
 * 
 * This module provides utilities for detecting conflicts in rota assignments:
 * - Skill mismatches
 * - Availability conflicts
 * - Overlapping shifts
 * - Maximum working hours violations
 * 
 * All conflicts are returned as warnings (non-blocking) to allow manual override.
 */

import prisma from "@/lib/prisma";
import { Task, User, Property, CleanerAvailability, LeaveRequest } from "@prisma/client";

export interface ConflictWarning {
  type: 'skill_mismatch' | 'availability' | 'overlap' | 'max_hours' | 'on_leave';
  severity: 'warning' | 'error';
  message: string;
  details?: any;
}

export interface AssignmentValidationResult {
  valid: boolean;
  warnings: ConflictWarning[];
  canAssign: boolean; // true if assignment is allowed despite warnings
}

/**
 * Check if cleaner has required skills for a property
 * Returns warnings if skills are missing (non-blocking - allows assignment)
 */
export async function validateSkillCompatibility(
  cleanerId: number,
  propertyId: number
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = [];

  // Get required skills for the property
  const propertySkills = await prisma.propertyRequiredSkill.findMany({
    where: { propertyId },
    include: { skill: true },
  });

  // If no skills required, skip validation (backward compatibility)
  if (propertySkills.length === 0) {
    return warnings;
  }

  // Get cleaner's skills
  const cleanerSkills = await prisma.cleanerSkill.findMany({
    where: { userId: cleanerId },
    include: { skill: true },
  });

  const cleanerSkillIds = new Set(cleanerSkills.map(cs => cs.skillId));

  // Check for missing required skills
  const missingRequired = propertySkills.filter(ps => ps.isRequired && !cleanerSkillIds.has(ps.skillId));
  const missingPreferred = propertySkills.filter(ps => !ps.isRequired && !cleanerSkillIds.has(ps.skillId));

  if (missingRequired.length > 0) {
    warnings.push({
      type: 'skill_mismatch',
      severity: 'warning',
      message: `Cleaner missing required skills: ${missingRequired.map(ps => ps.skill.name).join(', ')}`,
      details: {
        missingSkills: missingRequired.map(ps => ps.skill.name),
        skillLevel: 'required',
      },
    });
  }

  if (missingPreferred.length > 0) {
    warnings.push({
      type: 'skill_mismatch',
      severity: 'warning',
      message: `Cleaner missing preferred skills: ${missingPreferred.map(ps => ps.skill.name).join(', ')}`,
      details: {
        missingSkills: missingPreferred.map(ps => ps.skill.name),
        skillLevel: 'preferred',
      },
    });
  }

  return warnings;
}

/**
 * Check if cleaner is available at the scheduled time
 */
export async function validateAvailability(
  cleanerId: number,
  scheduledDate: Date
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = [];

  // Get cleaner availability
  const dayOfWeek = scheduledDate.getDay(); // 0 = Sunday, 6 = Saturday
  const availability = await prisma.cleanerAvailability.findMany({
    where: {
      userId: cleanerId,
      dayOfWeek,
      isAvailable: true,
    },
  });

  if (availability.length === 0) {
    warnings.push({
      type: 'availability',
      severity: 'warning',
      message: `Cleaner is not available on ${getDayName(dayOfWeek)}`,
      details: { dayOfWeek, scheduledDate },
    });
    return warnings;
  }

  // Check if scheduled time falls within any available window
  const scheduledTime = `${scheduledDate.getHours().toString().padStart(2, '0')}:${scheduledDate.getMinutes().toString().padStart(2, '0')}`;
  
  const isAvailable = availability.some(avail => {
    return scheduledTime >= avail.startTime && scheduledTime <= avail.endTime;
  });

  if (!isAvailable) {
    warnings.push({
      type: 'availability',
      severity: 'warning',
      message: `Scheduled time ${scheduledTime} falls outside cleaner's available hours on ${getDayName(dayOfWeek)}`,
      details: {
        scheduledTime,
        availableWindows: availability.map(a => `${a.startTime}-${a.endTime}`),
      },
    });
  }

  // Check for approved leave requests
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      userId: cleanerId,
      status: 'approved',
      startDate: { lte: scheduledDate },
      endDate: { gte: scheduledDate },
    },
  });

  if (leaveRequests.length > 0) {
    warnings.push({
      type: 'on_leave',
      severity: 'warning',
      message: `Cleaner has approved leave request for this date`,
      details: {
        leaveRequests: leaveRequests.map(lr => ({
          startDate: lr.startDate,
          endDate: lr.endDate,
          reason: lr.reason,
        })),
      },
    });
  }

  return warnings;
}

/**
 * Check for overlapping shifts (tasks assigned to the same cleaner at overlapping times)
 */
export async function validateNoOverlap(
  cleanerId: number,
  taskId: number,
  scheduledDate: Date,
  estimatedDurationMinutes: number | null = null
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = [];

  // Default estimated duration: 2 hours if not specified
  const durationMs = (estimatedDurationMinutes || 120) * 60 * 1000;
  const taskStart = scheduledDate;
  const taskEnd = new Date(taskStart.getTime() + durationMs);

  // Find other tasks assigned to this cleaner around the same time
  // Look for tasks within a 6-hour window to catch potential overlaps
  const windowStart = new Date(taskStart.getTime() - 3 * 60 * 60 * 1000);
  const windowEnd = new Date(taskEnd.getTime() + 3 * 60 * 60 * 1000);

  const overlappingTasks = await prisma.task.findMany({
    where: {
      assignedUserId: cleanerId,
      id: { not: taskId }, // Exclude current task
      scheduledDate: {
        gte: windowStart,
        lte: windowEnd,
      },
      status: {
        in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'PLANNED'],
      },
    },
    include: {
      property: { select: { address: true } },
    },
  });

  // Check for actual overlaps
  for (const otherTask of overlappingTasks) {
    if (!otherTask.scheduledDate) continue;

    const otherDuration = (otherTask.estimatedDurationMinutes || 120) * 60 * 1000;
    const otherStart = otherTask.scheduledDate;
    const otherEnd = new Date(otherStart.getTime() + otherDuration);

    // Check if time ranges overlap
    if (taskStart < otherEnd && taskEnd > otherStart) {
      warnings.push({
        type: 'overlap',
        severity: 'warning',
        message: `Overlaps with task "${otherTask.title}" at ${otherTask.property?.address || 'unknown location'}`,
        details: {
          overlappingTaskId: otherTask.id,
          overlappingTaskTitle: otherTask.title,
          otherTaskTime: otherTask.scheduledDate,
          currentTaskTime: scheduledDate,
        },
      });
    }
  }

  return warnings;
}

/**
 * Check if assignment would exceed cleaner's maximum working hours
 */
export async function validateMaxWorkingHours(
  cleanerId: number,
  taskId: number,
  scheduledDate: Date,
  estimatedDurationMinutes: number | null = null,
  weekStart?: Date,
  weekEnd?: Date
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = [];

  // Get cleaner's max working hours (optional field)
  const cleaner = await prisma.user.findUnique({
    where: { id: cleanerId },
    select: { maxWorkingHours: true },
  });

  // If maxWorkingHours not set, skip validation (backward compatibility)
  if (!cleaner?.maxWorkingHours) {
    return warnings;
  }

  // Calculate week boundaries if not provided
  if (!weekStart || !weekEnd) {
    const date = new Date(scheduledDate);
    const day = date.getDay();
    const diff = date.getDate() - day; // Get Sunday
    weekStart = new Date(date.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
  }

  // Calculate current hours worked in the week
  const weekTasks = await prisma.task.findMany({
    where: {
      assignedUserId: cleanerId,
      id: { not: taskId }, // Exclude current task for now
      scheduledDate: {
        gte: weekStart,
        lte: weekEnd,
      },
      status: {
        in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'PLANNED'],
      },
    },
    select: {
      estimatedDurationMinutes: true,
    },
  });

  const currentHours = weekTasks.reduce((sum, task) => {
    return sum + (task.estimatedDurationMinutes || 120) / 60; // Convert minutes to hours
  }, 0);

  // Add the new task's hours
  const newTaskHours = (estimatedDurationMinutes || 120) / 60;
  const totalHours = currentHours + newTaskHours;

  if (totalHours > cleaner.maxWorkingHours) {
    warnings.push({
      type: 'max_hours',
      severity: 'warning',
      message: `Assignment would exceed maximum working hours (${totalHours.toFixed(1)}/${cleaner.maxWorkingHours} hours)`,
      details: {
        currentHours: currentHours.toFixed(1),
        newTaskHours: newTaskHours.toFixed(1),
        totalHours: totalHours.toFixed(1),
        maxHours: cleaner.maxWorkingHours,
      },
    });
  }

  return warnings;
}

/**
 * Comprehensive validation for a cleaner-task assignment
 * Returns all conflicts as warnings (non-blocking)
 */
export async function validateAssignment(
  cleanerId: number,
  taskId: number,
  scheduledDate: Date,
  propertyId: number,
  estimatedDurationMinutes: number | null = null,
  weekStart?: Date,
  weekEnd?: Date
): Promise<AssignmentValidationResult> {
  const warnings: ConflictWarning[] = [];

  // Run all validations in parallel
  const [
    skillWarnings,
    availabilityWarnings,
    overlapWarnings,
    maxHoursWarnings,
  ] = await Promise.all([
    validateSkillCompatibility(cleanerId, propertyId),
    validateAvailability(cleanerId, scheduledDate),
    validateNoOverlap(cleanerId, taskId, scheduledDate, estimatedDurationMinutes),
    validateMaxWorkingHours(cleanerId, taskId, scheduledDate, estimatedDurationMinutes, weekStart, weekEnd),
  ]);

  warnings.push(...skillWarnings, ...availabilityWarnings, ...overlapWarnings, ...maxHoursWarnings);

  // Assignment is always allowed (warnings only, not blocking)
  // This allows managers to override warnings if needed
  return {
    valid: true, // Always valid, warnings are non-blocking
    warnings,
    canAssign: true,
  };
}

/**
 * Helper function to get cleaner's current workload (hours assigned in a week)
 * Used for workload balancing
 */
export async function getCleanerWorkload(
  cleanerId: number,
  weekStart: Date,
  weekEnd: Date,
  excludeTaskId?: number
): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: {
      assignedUserId: cleanerId,
      id: excludeTaskId ? { not: excludeTaskId } : undefined,
      scheduledDate: {
        gte: weekStart,
        lte: weekEnd,
      },
      status: {
        in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'PLANNED'],
      },
    },
    select: {
      estimatedDurationMinutes: true,
    },
  });

  const totalMinutes = tasks.reduce((sum, task) => {
    return sum + (task.estimatedDurationMinutes || 120);
  }, 0);

  return totalMinutes / 60; // Return hours
}

/**
 * Get day name from day number
 */
function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}


