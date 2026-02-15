import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { requirePermission, PERMISSIONS, initializePermissions } from '@/lib/permissions';

// POST - Initialize default permissions in the database
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission(request, PERMISSIONS.SYSTEM_ADMIN);
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }

    await initializePermissions();

    return NextResponse.json({
      success: true,
      message: 'Permissions initialized successfully',
    });
  } catch (error: any) {
    console.error('Error initializing permissions:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to initialize permissions' },
      { status: 500 }
    );
  }
}
