/**
 * Setup/Initialize Google Drive Watches
 * Call this endpoint to set up watches for all companies
 */

import { NextRequest, NextResponse } from 'next/server';
import { setupWatchesForAllCompanies } from '@/lib/google-drive-watch';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only allow admins to set up watches
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const results = await setupWatchesForAllCompanies();
    return NextResponse.json({
      success: true,
      message: 'Watch channels set up successfully',
      ...results,
    });
  } catch (error: any) {
    console.error('Error setting up watches:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to set up watches' },
      { status: 500 }
    );
  }
}
