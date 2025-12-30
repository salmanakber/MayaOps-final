import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/cron/expire-device-tokens
 * Cron job to expire device tokens that haven't been updated in 3 days
 * Should be called daily via Vercel Cron or similar
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Calculate date 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    console.log(`[Cron] Expiring device tokens older than ${threeDaysAgo.toISOString()}`);

    // Find and deactivate tokens that haven't been updated in 3 days
    const result = await prisma.deviceToken.updateMany({
      where: {
        updatedAt: {
          lt: threeDaysAgo,
        },
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    console.log(`[Cron] Expired ${result.count} device token(s)`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        expiredCount: result.count,
        cutoffDate: threeDaysAgo.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Cron] Error expiring device tokens:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to expire device tokens',
    }, { status: 500 });
  }
}

