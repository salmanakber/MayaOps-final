import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { cancelSubscription, createStripeInstance } from '@/lib/stripe';

/**
 * POST /api/admin/billing/[id]/cancel-subscription
 * Cancel subscription for a billing record (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.ADMIN_UNIQUE && role !== UserRole.DEVELOPER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid billing record ID' }, { status: 400 });
    }

    // Get billing record
    const billingRecord = await prisma.billingRecord.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!billingRecord) {
      return NextResponse.json({ success: false, message: 'Billing record not found' }, { status: 404 });
    }

    if (!billingRecord.subscriptionId) {
      return NextResponse.json({ 
        success: false, 
        message: 'No subscription ID found for this billing record' 
      }, { status: 400 });
    }

    // Get Stripe secret key from SystemSetting
    let stripeSecretKey = '';
    try {
      const secretKeySetting = await prisma.systemSetting.findUnique({
        where: { key: 'stripe_secret_key' },
      });
      if (secretKeySetting) {
        const { decrypt } = await import('@/lib/stripe');
        stripeSecretKey = secretKeySetting.isEncrypted 
          ? decrypt(secretKeySetting.value) 
          : secretKeySetting.value;
      }
    } catch (error) {
      console.warn('Failed to fetch Stripe secret key from settings:', error);
      stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    }

    if (!stripeSecretKey) {
      return NextResponse.json({ 
        success: false, 
        message: 'Stripe configuration not found' 
      }, { status: 500 });
    }

    // Create Stripe instance and cancel subscription
    const stripeInstance = createStripeInstance(stripeSecretKey);
    await stripeInstance.subscriptions.cancel(billingRecord.subscriptionId);

    // Update billing record status
    await prisma.billingRecord.update({
      where: { id },
      data: {
        status: 'canceled',
      },
    });

    // Update company subscription status
    await prisma.company.update({
      where: { id: billingRecord.companyId },
      data: {
        subscriptionStatus: 'canceled',
        isTrialActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription canceled successfully',
    });
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to cancel subscription' 
    }, { status: 500 });
  }
}
