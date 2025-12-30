import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
export async function POST(request: NextRequest) {
  try {
    // In a JWT-based system, logout is handled client-side by removing the token
    // This endpoint is mainly for logging purposes or future token blacklisting
    
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
