import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createCustomer, createSubscriptionWithTrial, calculateBilling } from '@/lib/stripe';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// Create subscription with 14-day free trial
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only Company Admin, Owner, or Developer can create subscriptions
  const allowedRoles: UserRole[] = [UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.DEVELOPER, UserRole.SUPER_ADMIN];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { 
      companyId, 
      companyName, 
      email, 
      paymentMethodId
    } = body;

    if (!companyId || !companyName || !email || !paymentMethodId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required fields: companyId, companyName, email, paymentMethodId' 
      }, { status: 400 });
    }

    // Verify company access
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      if (tokenUser.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Not authorized for this company' }, { status: 403 });
      }
    }

    // Get or create company
    let company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    // Get actual property count from database (automatic calculation)
    // Count should be sum of unitCount (each unit counts as a property)
    const properties = await prisma.property.findMany({
      where: { companyId },
      select: { unitCount: true },
    });
    
    // Sum up all unitCount values (each unit = 1 property for billing)
    const propertyCount = properties.reduce((sum, prop) => {
      // @ts-ignore - Field exists in schema but types may not be updated
      return sum + (prop.unitCount || 1);
    }, 0);

    // Get pricing from admin configuration
    const adminConfig = await prisma.adminConfiguration.findUnique({
      where: { companyId },
    });

    const basePrice = adminConfig 
      ? Number(adminConfig.subscriptionBasePrice) 
      : Number(company.basePrice) || 55.00;
    
    const pricePerUnit = adminConfig 
      ? Number(adminConfig.propertyPricePerUnit) 
      : 1.00;

    // Check if already has active subscription
    const existingBilling = await prisma.billingRecord.findFirst({
      where: {
        companyId,
        status: { in: ['active', 'trialing'] },
      },
    });

    if (existingBilling && existingBilling.isTrialPeriod) {
      const trialEndsAt = existingBilling.trialEndsAt;
      if (trialEndsAt && new Date(trialEndsAt) > new Date()) {
        return NextResponse.json({ 
          success: false, 
          message: 'Company already has an active trial period',
          data: { trialEndsAt }
        }, { status: 400 });
      }
    }

    // Calculate billing based on actual property count
    const propertyFee = propertyCount * pricePerUnit;
    const totalAmount = basePrice + propertyFee;
    
    const billing = {
      basePrice,
      propertyCount,
      propertyFee,
      totalAmount,
    };

    // Create or get Stripe customer
    let customerId: string;
    const billingRecord = await prisma.billingRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    if (billingRecord?.stripeCustomerId) {
      customerId = billingRecord.stripeCustomerId;
      // Update customer if needed
      await stripe.customers.update(customerId, {
        email,
        name: companyName,
        metadata: { companyId: companyId.toString() },
      });
    } else {
      const customer = await createCustomer(email, companyName, companyId);
      customerId = customer.id;
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Get Stripe price IDs from admin settings
    const stripeBasePriceId = await (prisma as any).systemSetting.findUnique({
      where: { key: 'stripe_base_price_id' },
    }).catch(() => null);
    const stripePropertyPriceId = await (prisma as any).systemSetting.findUnique({
      where: { key: 'stripe_property_price_id' },
    }).catch(() => null);
    
    // Fallback to environment variables if not in settings
    const basePriceId = stripeBasePriceId?.value || process.env.STRIPE_PRICE_ID_BASE_55_PRICE || '';
    const propertyPriceId = stripePropertyPriceId?.value || process.env.STRIPE_PRICe_ID_PROPERTY_BASE || '';
    
    if (!basePriceId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Stripe base price ID not configured. Please configure it in Admin Settings.' 
      }, { status: 500 });
    }

    if (!propertyPriceId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Stripe property price ID not configured. Please configure it in Admin Settings.' 
      }, { status: 500 });
    }

    // Create subscription with 14-day trial using both price IDs
    const TRIAL_DAYS = 14;
    const subscription = await createSubscriptionWithTrial(
      customerId,
      basePriceId,
      propertyPriceId,
      propertyCount,
      TRIAL_DAYS
    );

    // Extract subscription item IDs from the subscription
    const baseItem = subscription.items.data.find(
      (item) => item.price.id === basePriceId
    );
    const propertyItem = subscription.items.data.find(
      (item) => item.price.id === propertyPriceId
    );

    // Calculate trial end date
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    // Create or update billing record
    const billingData: any = {
      companyId,
      stripeCustomerId: customerId,
      subscriptionId: subscription.id,
      status: subscription.status === 'trialing' ? 'trialing' : 'active',
      amountPaid: 0,
      amountDue: Number(billing.totalAmount),
      propertyCount,
      trialEndsAt,
      isTrialPeriod: true,
      billingDate: new Date(),
      nextBillingDate: trialEndsAt,
    };
    
    // Add subscription item IDs (fields exist in schema but Prisma client needs regeneration)
    if (baseItem?.id) {
      billingData.baseSubscriptionItemId = baseItem.id;
    }
    if (propertyItem?.id) {
      billingData.propertyUsageItemId = propertyItem.id;
    }

    let updatedBilling;
    if (existingBilling) {
      updatedBilling = await prisma.billingRecord.update({
        where: { id: existingBilling.id },
        data: billingData,
      });
    } else {
      updatedBilling = await prisma.billingRecord.create({
        data: billingData,
      });
    }

    // Update company
    await prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: 'trialing',
        trialEndsAt,
        isTrialActive: true,
        propertyCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription created with 14-day free trial',
      data: {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        },
        billing: updatedBilling,
        trialEndsAt: trialEndsAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Subscription creation error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to create subscription' 
    }, { status: 500 });
  }
}

