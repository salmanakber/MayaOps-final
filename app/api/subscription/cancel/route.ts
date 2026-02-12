import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { cancelSubscription, createStripeInstance } from '@/lib/stripe';

/**
 * POST /api/subscription/cancel
 * Cancel an active Stripe subscription
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only owners, company admins, and managers can cancel subscriptions
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Not authorized to cancel subscriptions' }, { status: 403 });
  }

  const companyId = requireCompanyScope(tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

  try {
    // Get the active billing record
    const billingRecord = await prisma.billingRecord.findFirst({
      where: {
        companyId,
        status: { in: ['active', 'trialing'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!billingRecord || !billingRecord.subscriptionId) {
      return NextResponse.json({ 
        success: false, 
        message: 'No active subscription found to cancel' 
      }, { status: 404 });
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
    await cancelSubscription(billingRecord.subscriptionId);

    // Update billing record status
    await prisma.billingRecord.update({
      where: { id: billingRecord.id },
      data: {
        status: 'canceled',
      },
    });

    // Update company subscription status
    await prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: 'canceled',
        isTrialActive: false,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Subscription canceled successfully',
      data: {
        subscriptionId: billingRecord.subscriptionId,
        canceledAt: new Date().toISOString(),
      }
    });
  } catch (error: any) {
    console.error('Subscription cancellation error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to cancel subscription' 
    }, { status: 500 });
  }
}
