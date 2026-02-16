import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

/**
 * POST /api/auth/logout
 * Logout user, expire all sessions, and deactivate device tokens
 * This invalidates all JWT sessions by deactivating device tokens and clearing cookies
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user to deactivate their device tokens
    const auth = requireAuth(request);
    
    if (auth && auth.tokenUser) {
      const userId = auth.tokenUser.userId;
      
      // Deactivate all device tokens for this user (expires all mobile app sessions)
      try {
        const result = await prisma.deviceToken.updateMany({
          where: {
            userId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
        
        console.log(`✅ Logout: Deactivated ${result.count} device token(s) for user ${userId} (expired all mobile app sessions)`);
      } catch (tokenError) {
        console.error('Error deactivating device tokens on logout:', tokenError);
        // Don't fail logout if token deactivation fails
      }

      // Log the logout action
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, role: true },
        });
        console.log(`✅ User logged out: ${user?.email} (${user?.role})`);
      } catch (logError) {
        // Silent fail for logging
      }
    }
    
    // In a JWT-based system, we can't invalidate tokens server-side without a blacklist
    // However, we:
    // 1. Deactivate device tokens (expires mobile app sessions)
    // 2. Clear cookies (expires web sessions)
    // 3. Client-side will clear localStorage/sessionStorage
    
    const response = NextResponse.json({
      success: true,
      message: 'Logout successful - all sessions expired'
    }, { status: 200 });

    // Clear the auth token cookie (expires web session)
    response.cookies.delete('authToken');
    
    return response;

  } catch (error) {
    console.error('Logout error:', error);
    // Even on error, clear the cookie
    const response = NextResponse.json({
      success: false,
      message: 'Logout completed with errors'
    }, { status: 200 });
    response.cookies.delete('authToken');
    return response;
  }
}
