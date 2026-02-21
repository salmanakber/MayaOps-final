#!/usr/bin/env node

/**
 * Standalone Recurring Jobs Worker (JavaScript version)
 * 
 * This is the compiled JavaScript version for production use
 * Use this if you're not using tsx/ts-node
 * 
 * Usage:
 *   node workers/recurring-jobs-worker.js
 *   OR
 *   pm2 start workers/recurring-jobs-worker.js
 */

// For production, you'll need to compile the TypeScript file first:
// npx tsc workers/recurring-jobs-worker.ts --outDir workers --module commonjs --target es2020

require('tsx/cjs/register'); // Enable TypeScript support

const { initializeRecurringJobsWorker } = require('../lib/recurring-jobs-worker');
const { recoverRecurringJobs } = require('../lib/recurring-jobs-recovery');

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled Rejection at:', promise, 'reason:', reason);
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
    } catch (recoveryError) {
      if (recoveryError.message?.includes('ECONNREFUSED') || recoveryError.message?.includes('Redis')) {
        console.error('[Worker] ❌ Recovery failed - Redis is not available');
        console.error('[Worker] ❌ Worker will not process jobs until Redis is available');
        console.error('[Worker] ❌ Please ensure Redis is running and accessible');
      } else {
        throw recoveryError;
      }
    }

    console.log('[Worker] ========================================');
    console.log('[Worker] ✓ Worker is running and ready');
    console.log('[Worker] ✓ Listening for recurring job executions');
    console.log('[Worker] ========================================');

    // Keep the process alive
  } catch (error) {
    console.error('[Worker] ❌ Failed to start worker:', error);
    
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('Redis')) {
      console.error('[Worker] ❌ Redis connection failed');
      console.error('[Worker] ❌ Please ensure Redis is running and accessible');
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
