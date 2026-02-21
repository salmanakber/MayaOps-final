import prisma from './prisma';
import { scheduleRecurringJobExecution, hasScheduledJob } from './recurring-jobs-queue';
import { shouldJobBeActive } from './recurring-jobs';

/**
 * Recovery logic to run on system startup
 * Ensures all active recurring jobs have scheduled BullMQ jobs
 */
export async function recoverRecurringJobs(): Promise<void> {
  console.log('[Recurring Jobs Recovery] Starting recovery process...');

  try {
    // Fetch all active recurring jobs
    const activeJobs = await prisma.recurringJob.findMany({
      where: {
        active: true,
      },
      select: {
        id: true,
        nextRunAt: true,
        recurrenceType: true,
        intervalDays: true,
        allowedDaysOfWeek: true,
        endDate: true,
        maxOccurrences: true,
        currentOccurrenceCount: true,
      },
    });

    console.log(`[Recurring Jobs Recovery] Found ${activeJobs.length} active recurring jobs`);

    let recovered = 0;
    let skipped = 0;
    let expired = 0;

    for (const job of activeJobs) {
      try {
        // Check if job should still be active
        if (!shouldJobBeActive(job)) {
          // Auto-disable expired jobs
          await prisma.recurringJob.update({
            where: { id: job.id },
            data: { active: false },
          });
          expired++;
          console.log(`[Recurring Jobs Recovery] Disabled expired job ${job.id}`);
          continue;
        }

        // Check if a scheduled BullMQ job exists
        const hasJob = await hasScheduledJob(job.id);

        if (hasJob) {
          skipped++;
          console.log(`[Recurring Jobs Recovery] Job ${job.id} already has scheduled execution, skipping`);
          continue;
        }

        // Determine when to schedule
        const now = new Date();
        const nextRunAt = new Date(job.nextRunAt);

        if (nextRunAt <= now) {
          // Schedule immediate execution (delay = 0)
          await scheduleRecurringJobExecution(job.id, now);
          console.log(`[Recurring Jobs Recovery] Scheduled immediate execution for job ${job.id}`);
        } else {
          // Schedule delayed job
          await scheduleRecurringJobExecution(job.id, nextRunAt);
          console.log(`[Recurring Jobs Recovery] Scheduled delayed execution for job ${job.id} at ${nextRunAt.toISOString()}`);
        }

        recovered++;
      } catch (error) {
        console.error(`[Recurring Jobs Recovery] Error recovering job ${job.id}:`, error);
      }
    }

    console.log(`[Recurring Jobs Recovery] Recovery complete: ${recovered} recovered, ${skipped} skipped, ${expired} expired`);
  } catch (error) {
    console.error('[Recurring Jobs Recovery] Recovery error:', error);
    throw error;
  }
}
