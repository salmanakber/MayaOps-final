import { NextResponse } from 'next/server';
import { initCronScheduler } from '@/lib/cron-scheduler';

// Initialize cron scheduler on server startup
// This sets up scheduled jobs for:
// - Task reminders (every 10 seconds)
// - Sheets sync (every 1 minute) - includes company-level task sync with add/remove actions
// - Property sheets sync (every 6 minutes) - includes both company-level and legacy per-property sync
// - Device token expiration (daily at midnight)
initCronScheduler();

export async function GET() {
  return NextResponse.json({ 
    success: true, 
    message: 'Cron Scheduler Initialized',
    note: 'Cron jobs are configured to use the latest setup including company-level task sync with add/remove actions'
  });
}
