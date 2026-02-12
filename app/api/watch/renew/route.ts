/**
 * Renew Google Drive Watches
 * Call this endpoint to renew expiring watch channels
 * Supports both authenticated requests and cron requests (with CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { renewExpiringWatches } from '@/lib/google-drive-watch';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function POST(request: NextRequest) {
  // Check for cron secret first (for automated cron jobs)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'development-secret';
  
  if (authHeader === `Bearer ${cronSecret}`) {
    // Cron request - no auth required
    try {
      const results = await renewExpiringWatches();
      return NextResponse.json({
        success: true,
        message: 'Watch channels renewed successfully',
        ...results,
      });
    } catch (error: any) {
      console.error('Error renewing watches:', error);
      return NextResponse.json(
        { success: false, message: error.message || 'Failed to renew watches' },
        { status: 500 }
      );
    }
  }

  // Regular authenticated request
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only allow admins to renew watches
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const results = await renewExpiringWatches();
    return NextResponse.json({
      success: true,
      message: 'Watch channels renewed successfully',
      ...results,
    });
  } catch (error: any) {
    console.error('Error renewing watches:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to renew watches' },
      { status: 500 }
    );
  }
}
