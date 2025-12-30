import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import stripe from '@/lib/stripe';

// Create a payment method (for subscription signup)
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { cardNumber, expiryMonth, expiryYear, cvv } = body;

    if (!cardNumber || !expiryMonth || !expiryYear || !cvv) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required card fields' 
      }, { status: 400 });
    }

    // Create payment method
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: cardNumber.replace(/\s/g, ''),
        exp_month: parseInt(expiryMonth),
        exp_year: parseInt(expiryYear),
        cvc: cvv,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        paymentMethodId: paymentMethod.id,
      },
    });
  } catch (error: any) {
    console.error('Payment method creation error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to create payment method' 
    }, { status: 500 });
  }
}

