import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';

// GET /api/stripe/config - Get Stripe publishable key and pricing configuration
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

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
    console.error('Error fetching Stripe config:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to fetch Stripe config' 
    }, { status: 500 });
  }
}



