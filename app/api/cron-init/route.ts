import { NextResponse } from 'next/server';
import { initCronScheduler } from '@/lib/cron-scheduler';
import { setupWatchesForAllCompanies } from '@/lib/google-drive-watch';
import { initializeRecurringJobsSystem } from '@/lib/recurring-jobs-init';

// Track initialization state
let recurringJobsInitialized = false;

// Initialize cron scheduler on server startup
// This sets up scheduled jobs for:
// - Task reminders (every 10 seconds)
// - Google Drive watch renewal (daily at 03:00) - renews push notification channels
// - Property sheets sync (every 6 minutes) - includes both company-level and legacy per-property sync
// - Device token expiration (daily at midnight)
initCronScheduler();

// Initialize recurring jobs system (BullMQ worker + recovery)
// This sets up:
// - BullMQ worker to process recurring job executions
// - Recovery to schedule any active recurring jobs that don't have scheduled executions
// This runs automatically when the module loads (server startup)
initializeRecurringJobsSystem()
  .then(() => {
    recurringJobsInitialized = true;
  })
  .catch((error) => {
    console.error('[Cron Init] Failed to initialize recurring jobs system:', error);
    // Don't block startup if Redis is not available
    if (error.message?.includes('Redis') || error.message?.includes('ECONNREFUSED')) {
      console.warn('[Cron Init] ⚠️ Recurring jobs disabled - Redis is not running. Please start Redis to enable recurring jobs.');
      // Still mark as attempted so GET endpoint knows
      recurringJobsInitialized = true;
    }
  });

// Set up Google Drive watches on startup (async, don't block)
// Only set up if we have a valid public URL (not localhost)
const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.CRON_BASE_URL || '';
if (baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
  setupWatchesForAllCompanies().catch((error) => {
    console.error('Error setting up Google Drive watches on startup:', error);
  });
} else {
  console.log('[Watch] ⚠️ Skipping watch setup - no valid public URL configured (NEXT_PUBLIC_API_URL or CRON_BASE_URL)');
  console.log('[Watch] Current baseUrl:', baseUrl || 'not set');
}

export async function GET() {
  // Ensure initialization runs when this endpoint is called
  // This is useful for manual initialization or health checks
  if (!recurringJobsInitialized) {
    try {
      await initializeRecurringJobsSystem();
      recurringJobsInitialized = true;
    } catch (error: any) {
      // Already handled in the function, just log here
      if (!error.message?.includes('Redis') && !error.message?.includes('ECONNREFUSED')) {
        console.error('[Cron Init] Error re-initializing recurring jobs:', error);
      }
    }
  }

  return NextResponse.json({ 
    success: true, 
    message: 'System Initialized',
    initialized: {
      cronScheduler: true,
      recurringJobs: recurringJobsInitialized,
      googleDriveWatches: baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1'),
    },
    note: 'Cron jobs, recurring jobs worker, and Google Drive push notifications are configured.'
  });
}
