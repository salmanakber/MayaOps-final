import { NextResponse } from 'next/server';
import { initCronScheduler } from '@/lib/cron-scheduler';

initCronScheduler();

export async function GET() {
  return NextResponse.json({ success: true, message: 'Cron Scheduler Initialized' });
}
