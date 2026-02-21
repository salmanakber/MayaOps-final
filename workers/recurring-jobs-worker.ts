#!/usr/bin/env node

/**
 * Standalone Recurring Jobs Worker
 * 
 * This file can be run as a separate process using PM2 or directly with Node.js
 * 
 * Usage:
 *   node workers/recurring-jobs-worker.js
 *   OR
 *   pm2 start workers/recurring-jobs-worker.js
 */

import { initializeRecurringJobsWorker } from '../lib/recurring-jobs-worker';
import { recoverRecurringJobs } from '../lib/recurring-jobs-recovery';

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught Exception:', error);
  // Don't exit - let PM2 handle restarts
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let PM2 handle restarts
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

/**
 * Initialize and start the worker
 */
async function startWorker() {
  console.log('[Worker] ========================================');
  console.log('[Worker] Starting Recurring Jobs Worker');
  console.log('[Worker] ========================================');
  console.log(`[Worker] Node version: ${process.version}`);
  console.log(`[Worker] PID: ${process.pid}`);
  console.log(`[Worker] Redis: ${process.env.REDIS_URL || `${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`}`);
  console.log('[Worker] ========================================');

  try {
    // Initialize the worker
    console.log('[Worker] Initializing BullMQ worker...');
    initializeRecurringJobsWorker();
    console.log('[Worker] ✓ Worker initialized');

    // Run recovery to schedule any active jobs
    console.log('[Worker] Running recovery to schedule active jobs...');
    try {
      await recoverRecurringJobs();
      console.log('[Worker] ✓ Recovery completed');
    } catch (recoveryError: any) {
      if (recoveryError.message?.includes('ECONNREFUSED') || recoveryError.message?.includes('Redis')) {
        console.error('[Worker] ❌ Recovery failed - Redis is not available');
        console.error('[Worker] ❌ Worker will not process jobs until Redis is available');
        console.error('[Worker] ❌ Please ensure Redis is running and accessible');
        // Still continue - worker will retry when Redis becomes available
      } else {
        throw recoveryError;
      }
    }

    console.log('[Worker] ========================================');
    console.log('[Worker] ✓ Worker is running and ready');
    console.log('[Worker] ✓ Listening for recurring job executions');
    console.log('[Worker] ========================================');

    // Keep the process alive
    // The worker will continue running and processing jobs
  } catch (error: any) {
    console.error('[Worker] ❌ Failed to start worker:', error);
    
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('Redis')) {
      console.error('[Worker] ❌ Redis connection failed');
      console.error('[Worker] ❌ Please ensure Redis is running and accessible');
      console.error('[Worker] ❌ Worker will exit - PM2 will restart it');
      process.exit(1);
    } else {
      console.error('[Worker] ❌ Unexpected error:', error);
      process.exit(1);
    }
  }
}

// Start the worker
startWorker().catch((error) => {
  console.error('[Worker] Fatal error during startup:', error);
  process.exit(1);
});
