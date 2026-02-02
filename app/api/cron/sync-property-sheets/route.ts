import { NextRequest, NextResponse } from 'next/server';
import { syncAllPropertySheets } from '@/lib/google-sheets-tasks';


/**
 * Cron endpoint to sync all property Google Sheets
 * Call this from Vercel Cron or external cron service
 */
export async function GET(request: NextRequest) {
  // Optional: Add API key authentication for cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await syncAllPropertySheets();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    console.error('Error in cron sync:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to sync property sheets' 
    }, { status: 500 });
  }
}

