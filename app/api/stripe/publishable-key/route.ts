import { NextRequest, NextResponse } from 'next/server';

// GET /api/stripe/publishable-key - Get Stripe publishable key for mobile app
export async function GET(request: NextRequest) {
  try {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      return NextResponse.json({ 
        success: false, 
        message: 'Stripe publishable key not configured' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        publishableKey,
      },
    });
  } catch (error: any) {
    console.error('Error fetching Stripe publishable key:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to fetch publishable key' 
    }, { status: 500 });
  }
}

