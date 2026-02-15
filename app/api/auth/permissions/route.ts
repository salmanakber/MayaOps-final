import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { getUserPermissions } from '@/lib/permissions';

/**
 * GET /api/auth/permissions
 * Get current user's permissions
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request);
    if (!auth) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    const { tokenUser } = auth;
    const permissions = await getUserPermissions(tokenUser.userId);

    return NextResponse.json({
      success: true,
      data: {
        permissions,
        userId: tokenUser.userId,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Get permissions error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
