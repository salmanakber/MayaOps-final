import { NextRequest, NextResponse } from 'next/server';
import { handleSheetsSyncCron } from '@/lib/cron-sheets-sync';

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'development-secret';
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await handleSheetsSyncCron();
    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Cron error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// Configure this endpoint in vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/sheets-sync",
//     "schedule": "*/15 * * * *"
//   }]
// }
