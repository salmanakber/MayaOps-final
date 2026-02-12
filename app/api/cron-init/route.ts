import { NextResponse } from 'next/server';
import { initCronScheduler } from '@/lib/cron-scheduler';
import { setupWatchesForAllCompanies } from '@/lib/google-drive-watch';

// Initialize cron scheduler on server startup
// This sets up scheduled jobs for:
// - Task reminders (every 10 seconds)
// - Google Drive watch renewal (daily at 03:00) - renews push notification channels
// - Property sheets sync (every 6 minutes) - includes both company-level and legacy per-property sync
// - Device token expiration (daily at midnight)
initCronScheduler();

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
  return NextResponse.json({ 
    success: true, 
    message: 'Cron Scheduler Initialized',
    note: 'Cron jobs are configured. Google Drive push notifications are enabled for sheet changes.'
  });
}
