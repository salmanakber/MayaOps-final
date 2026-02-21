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
    console.log('[Recurring Jobs Init] ✓ Worker initialized');

    // Run recovery to ensure all active jobs have scheduled executions
    // This will gracefully handle Redis connection errors
    try {
      await recoverRecurringJobs();
      console.log('[Recurring Jobs Init] ✓ Recovery completed');
    } catch (recoveryError: any) {
      // If Redis is not available, log warning but don't fail initialization
      if (recoveryError.message?.includes('ECONNREFUSED') || recoveryError.message?.includes('Redis')) {
        console.warn('[Recurring Jobs Init] ⚠️ Recovery skipped - Redis is not running');
        console.warn('[Recurring Jobs Init] ⚠️ Recurring jobs will not execute until Redis is started');
        console.warn('[Recurring Jobs Init] ⚠️ Start Redis with: brew services start redis (macOS) or redis-server');
      } else {
        throw recoveryError;
      }
    }

    initialized = true;
    console.log('[Recurring Jobs Init] ✓ System initialized (worker ready, recovery attempted)');
  } catch (error: any) {
    // Handle Redis connection errors gracefully
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('Redis')) {
      console.error('[Recurring Jobs Init] ❌ Redis connection failed');
      console.error('[Recurring Jobs Init] ⚠️ Worker initialized but will not process jobs until Redis is available');
      console.error('[Recurring Jobs Init] ⚠️ Please start Redis: brew services start redis (macOS) or redis-server');
      // Still mark as initialized so we don't retry constantly
      initialized = true;
      return;
    }
    console.error('[Recurring Jobs Init] Initialization error:', error);
    throw error;
  }
}
