/**
 * Initialize recurring jobs system on server startup
 * This should be called when the server starts
 */
import { initializeRecurringJobsWorker } from './recurring-jobs-worker';
import { recoverRecurringJobs } from './recurring-jobs-recovery';

let initialized = false;

export async function initializeRecurringJobsSystem() {
  if (initialized) {
    console.log('[Recurring Jobs Init] Already initialized');
    return;
  }

  try {
    console.log('[Recurring Jobs Init] Initializing recurring jobs system...');
    
    // Initialize the worker
    initializeRecurringJobsWorker();
    console.log('[Recurring Jobs Init] Worker initialized');

    // Run recovery to ensure all active jobs have scheduled executions
    await recoverRecurringJobs();
    console.log('[Recurring Jobs Init] Recovery completed');

    initialized = true;
    console.log('[Recurring Jobs Init] System fully initialized');
  } catch (error) {
    console.error('[Recurring Jobs Init] Initialization error:', error);
    throw error;
  }
}
