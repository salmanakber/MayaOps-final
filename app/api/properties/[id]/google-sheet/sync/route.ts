import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { syncNewRowsFromSheet } from '@/lib/google-sheets-tasks';
import { UserRole } from '@prisma/client';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only allow COMPANY_ADMIN, MANAGER, OWNER, DEVELOPER, SUPER_ADMIN
  if (
    role !== UserRole.COMPANY_ADMIN &&
    role !== UserRole.MANAGER &&
    role !== UserRole.OWNER &&
    role !== UserRole.DEVELOPER &&
    role !== UserRole.SUPER_ADMIN
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const propertyId = parseInt(params.id);
    const result = await syncNewRowsFromSheet(propertyId);

    return NextResponse.json({
      success: result.success !== false,
      data: result,
    });
  } catch (error: any) {
    console.error('Error syncing Google Sheet:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to sync Google Sheet' 
    }, { status: 500 });
  }
}

