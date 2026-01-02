import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

/**
 * POST /api/auth/logout
 * Logout user and deactivate device tokens
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user to deactivate their device tokens
    const auth = requireAuth(request);
    
    if (auth && auth.tokenUser) {
      const userId = auth.tokenUser.userId;
      
      // Deactivate all device tokens for this user
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
        
        console.log(`✅ Deactivated ${result.count} device token(s) for user ${userId} on logout`);
      } catch (tokenError) {
        console.error('Error deactivating device tokens on logout:', tokenError);
        // Don't fail logout if token deactivation fails
      }
    }
    
    // In a JWT-based system, logout is handled client-side by removing the token
    // This endpoint deactivates device tokens and logs the logout
    
    return NextResponse.json({
      success: true,
      message: 'Logout successful'
    }, { status: 200 });

  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
