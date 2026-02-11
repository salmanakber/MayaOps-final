import { NextRequest, NextResponse } from 'next/server';
import { syncAllPropertySheets } from '@/lib/google-sheets-tasks';
import { syncAllCompanyTaskSheets } from '@/lib/google-sheets-tasks';


/**
 * Cron endpoint to sync all company task sheets (company-level sync)
 * Uses the latest setup with:
 * - Company-level task sync with add/remove actions (via importTasksFromCompanySheet)
 * - Hash-based unique identifiers (sha1(propertyId + taskTitle + address))
 * - Batch notifications (one per user for all imported tasks)
 * - Legacy per-property sync for backward compatibility
 * 
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
    // Sync company-level task sheets (new approach with add/remove actions)
    const companyResults = await syncAllCompanyTaskSheets();
    
    // Also sync legacy per-property sheets for backward compatibility
    const propertyResults = await syncAllPropertySheets();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      companySheets: companyResults,
      propertySheets: propertyResults,
    });
  } catch (error: any) {
    console.error('Error in cron sync:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to sync sheets' 
    }, { status: 500 });
  }
}

