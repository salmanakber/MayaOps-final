import { Worker, Job } from 'bullmq';
import prisma from './prisma';
import { TaskStatus, UserRole } from '@prisma/client';
import type { RecurringJob } from './recurring-jobs';
import { 
  calculateNextRunAt, 
  shouldJobBeActive,
  validateRecurringJobConfig 
} from './recurring-jobs';
import { scheduleRecurringJobExecution, removeScheduledRecurringJob } from './recurring-jobs-queue';
import { createNotification } from './notifications';

// Redis connection options for BullMQ - use connection object instead of IORedis instance
// This avoids type conflicts between BullMQ's bundled ioredis and separately installed ioredis
const connectionOptions = (() => {
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      // Fallback if URL parsing fails
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };
})();

/**
 * Worker that processes recurring job executions
 */
export const recurringJobsWorker = new Worker(
  'recurring-jobs',
  async (job: Job) => {
    const { recurringJobId } = job.data;
    
    console.log(`[Recurring Jobs Worker] Processing job ${recurringJobId}`);

      // Use a transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
      // Step 1: Load & Lock
      // Note: recurringJob model will be available after running: npx prisma migrate dev && npx prisma generate
      const recurringJob = await (tx as any).recurringJob.findUnique({
        where: { id: recurringJobId },
        include: {
          property: {
            select: {
              id: true,
              address: true,
              companyId: true,
            },
          },
        },
      });

      if (!recurringJob) {
        console.log(`[Recurring Jobs Worker] Recurring job ${recurringJobId} not found, skipping`);
        return { success: false, reason: 'not_found' };
      }

      // Check if job should still be active
      if (!recurringJob.active) {
        console.log(`[Recurring Jobs Worker] Recurring job ${recurringJobId} is inactive, skipping`);
        return { success: false, reason: 'inactive' };
      }

      if (!shouldJobBeActive(recurringJob)) {
        // Auto-disable expired jobs
        await (tx as any).recurringJob.update({
          where: { id: recurringJobId },
          data: { active: false },
        });
        console.log(`[Recurring Jobs Worker] Recurring job ${recurringJobId} expired, disabled`);
        return { success: false, reason: 'expired' };
      }

      // Step 2: Idempotency Check
      // Check if a task has already been created for this scheduled timestamp
      const scheduledTimestamp = recurringJob.nextRunAt;
      const existingTask = await tx.task.findFirst({
        where: {
          recurringJobId: recurringJobId,
          scheduledDate: scheduledTimestamp,
        },
      });

      if (existingTask) {
        console.log(`[Recurring Jobs Worker] Task already exists for job ${recurringJobId} at ${scheduledTimestamp.toISOString()}, skipping`);
        // Still update nextRunAt and reschedule
        const nextRunAt = calculateNextRunAt(recurringJob);
        await (tx as any).recurringJob.update({
          where: { id: recurringJobId },
          data: { nextRunAt },
        });
        // Reschedule next execution
        await scheduleRecurringJobExecution(recurringJobId, nextRunAt);
        return { success: true, reason: 'already_executed', taskId: existingTask.id };
      }

      // Step 3: Task Creation
      const task = await tx.task.create({
        data: {
          companyId: recurringJob.companyId,
          propertyId: recurringJob.propertyId,
          title: recurringJob.taskTitle,
          description: recurringJob.taskDescription,
          status: TaskStatus.DRAFT,
          scheduledDate: scheduledTimestamp,
          recurringJobId: recurringJobId,
        },
      });

      console.log(`[Recurring Jobs Worker] Created task ${task.id} for recurring job ${recurringJobId}`);

      // Step 4: Update Recurring Job
      const nextRunAt = calculateNextRunAt(recurringJob);
      const updatedJob = await (tx as any).recurringJob.update({
        where: { id: recurringJobId },
        data: {
          currentOccurrenceCount: recurringJob.currentOccurrenceCount + 1,
          nextRunAt,
          lastGeneratedTaskId: task.id,
        },
      });

      // Step 5: Create Notifications for Owners and Managers
      try {
        const ownersAndManagers = await tx.user.findMany({
          where: {
            companyId: recurringJob.companyId,
            role: { in: [UserRole.OWNER, UserRole.MANAGER] },
            isActive: true,
          },
          select: { id: true },
        });

        const propertyAddress = recurringJob.property.address;
        const taskTitle = recurringJob.taskTitle;

        for (const user of ownersAndManagers) {
          await createNotification({
            userId: user.id,
            title: 'Recurring Task Created',
            message: `A recurring task "${taskTitle}" has been created for property ${propertyAddress}`,
            type: 'task_created',
            metadata: {
              taskId: task.id,
              recurringJobId: recurringJobId,
              propertyId: recurringJob.propertyId,
            },
            screenRoute: 'TaskDetail',
            screenParams: { taskId: task.id },
          }).catch((notifError) => {
            console.error(`[Recurring Jobs Worker] Error sending notification to user ${user.id}:`, notifError);
          });
        }

        console.log(`[Recurring Jobs Worker] Sent notifications to ${ownersAndManagers.length} owner(s)/manager(s)`);
      } catch (notifError) {
        console.error('[Recurring Jobs Worker] Error creating notifications:', notifError);
        // Don't fail the job if notifications fail
      }

      // Step 6: Reschedule Next Execution (outside transaction)
      // We need to do this after the transaction commits
      // Use setImmediate to ensure transaction is committed
      setImmediate(async () => {
        try {
          // Check if job is still active before rescheduling
          const stillActive = await (prisma as any).recurringJob.findUnique({
            where: { id: recurringJobId },
            select: { active: true },
          });

          if (stillActive?.active && shouldJobBeActive(updatedJob)) {
            await scheduleRecurringJobExecution(recurringJobId, nextRunAt);
            console.log(`[Recurring Jobs Worker] Rescheduled next execution for job ${recurringJobId} at ${nextRunAt.toISOString()}`);
          } else {
            console.log(`[Recurring Jobs Worker] Job ${recurringJobId} is no longer active, not rescheduling`);
          }
        }
        } catch (rescheduleError) {
          console.error(`[Recurring Jobs Worker] Error rescheduling job ${recurringJobId}:`, rescheduleError);
        }
      });

      return {
        success: true,
        taskId: task.id,
        nextRunAt: nextRunAt.toISOString(),
      };
    }, {
      timeout: 30000, // 30 second timeout
    });
  },
  {
    connection: connectionOptions,
    concurrency: 5, // Process up to 5 jobs concurrently
    limiter: {
      max: 100, // Max 100 jobs per interval
      duration: 60000, // Per minute
    },
  }
);

// Worker event handlers
recurringJobsWorker.on('completed', (job) => {
  console.log(`[Recurring Jobs Worker] Job ${job.id} completed successfully`);
});

recurringJobsWorker.on('failed', (job, err) => {
  console.error(`[Recurring Jobs Worker] Job ${job?.id} failed:`, err);
});

recurringJobsWorker.on('error', (err) => {
  console.error('[Recurring Jobs Worker] Worker error:', err);
});

/**
 * Initialize the worker (call this on server startup)
 */
export function initializeRecurringJobsWorker() {
  console.log('[Recurring Jobs Worker] Worker initialized');
  return recurringJobsWorker;
}
