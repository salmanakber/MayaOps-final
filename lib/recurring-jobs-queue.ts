import { Queue, QueueOptions } from 'bullmq';

// Queue options - use connection string/options instead of IORedis instance
// This avoids type conflicts between BullMQ's bundled ioredis and separately installed ioredis
const queueOptions: QueueOptions = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    // If REDIS_URL is provided, parse it
    ...(process.env.REDIS_URL ? (() => {
      try {
        const url = new URL(process.env.REDIS_URL);
        return {
          host: url.hostname,
          port: parseInt(url.port) || 6379,
          password: url.password || undefined,
        };
      } catch {
        return {};
      }
    })() : {}),
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

// Create the recurring jobs queue
export const recurringJobsQueue = new Queue('recurring-jobs', queueOptions);

/**
 * Schedule a delayed job for a recurring job execution
 * jobId must equal recurring_job_id to ensure uniqueness
 */
export async function scheduleRecurringJobExecution(
  recurringJobId: number,
  executeAt: Date
): Promise<void> {
  const delay = Math.max(0, executeAt.getTime() - Date.now());

  // Use recurringJobId as jobId to ensure uniqueness
  // This prevents duplicate jobs for the same recurring job
  await recurringJobsQueue.add(
    'execute-recurring-job',
    { recurringJobId },
    {
      jobId: `recurring-job-${recurringJobId}`,
      delay,
    }
  );

  console.log(`[Recurring Jobs] Scheduled execution for job ${recurringJobId} at ${executeAt.toISOString()}`);
}

/**
 * Remove scheduled job for a recurring job
 */
export async function removeScheduledRecurringJob(recurringJobId: number): Promise<void> {
  try {
    const job = await recurringJobsQueue.getJob(`recurring-job-${recurringJobId}`);
    if (job) {
      await job.remove();
      console.log(`[Recurring Jobs] Removed scheduled job for recurring job ${recurringJobId}`);
    }
  } catch (error) {
    console.error(`[Recurring Jobs] Error removing scheduled job for ${recurringJobId}:`, error);
  }
}

/**
 * Check if a job exists for a recurring job
 */
export async function hasScheduledJob(recurringJobId: number): Promise<boolean> {
  try {
    const job = await recurringJobsQueue.getJob(`recurring-job-${recurringJobId}`);
    return job !== null;
  } catch (error) {
    console.error(`[Recurring Jobs] Error checking scheduled job for ${recurringJobId}:`, error);
    return false;
  }
}
