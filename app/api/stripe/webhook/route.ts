import { NextRequest, NextResponse } from 'next/server';
import { handleWebhook } from '@/lib/stripe';
import prisma from '@/lib/prisma';
import stripe from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    const event = await handleWebhook(body, signature);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;

      case 'customer.subscription.trial_will_end':
        const trialEndingSub = event.data.object;
        await handleTrialEnding(trialEndingSub);
        break;

      case 'customer.subscription.deleted':
        const deletedSub = event.data.object;
        await handleSubscriptionCancellation(deletedSub);
        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        await handlePaymentSuccess(invoice);
        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        await handlePaymentFailure(failedInvoice);
        break;

      case 'invoice.payment_action_required':
        // Payment requires action (e.g., 3D Secure)
        console.log('Payment action required:', event.data.object.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

async function handleSubscriptionUpdate(subscription: any) {
  const customerId = subscription.customer;
  const status = subscription.status;
  const subscriptionId = subscription.id;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
  const isTrialing = status === 'trialing';
  const now = new Date();

  // Find billing record by customer ID
  const billingRecord = await prisma.billingRecord.findFirst({
    where: { stripeCustomerId: customerId },
    orderBy: { createdAt: 'desc' },
  });

  if (!billingRecord) {
    console.error(`No billing record found for customer ${customerId}`);
    return;
  }

  const companyId = billingRecord.companyId;

  // Determine if subscription/trial is active
  const isActive = (status === 'active' || status === 'trialing') && 
                   (!trialEnd || trialEnd > now) &&
                   (!currentPeriodEnd || currentPeriodEnd > now);

  // Update billing record
  await prisma.billingRecord.update({
    where: { id: billingRecord.id },
    data: {
      subscriptionId,
      status: status === 'trialing' ? 'trialing' : status === 'active' ? 'active' : 'inactive',
      trialEndsAt: trialEnd,
      isTrialPeriod: isTrialing,
      nextBillingDate: currentPeriodEnd,
    },
  });

  // Update company subscription status and access
  await prisma.company.update({
    where: { id: companyId },
    data: {
      subscriptionStatus: status === 'trialing' ? 'trialing' : status === 'active' ? 'active' : 'inactive',
      trialEndsAt: trialEnd,
      isTrialActive: isTrialing && trialEnd && trialEnd > now,
    },
  });

  // If subscription is inactive/expired, ensure users are aware (but don't deactivate them)
  // The subscription check middleware will handle access restriction
  if (!isActive && (status === 'past_due' || status === 'unpaid' || status === 'canceled' || status === 'incomplete_expired')) {
    console.log(`Subscription ${subscriptionId} is inactive for company ${companyId}`);
    // Access will be restricted by requireActiveSubscription middleware
  }
}

async function handleTrialEnding(subscription: any) {
  const customerId = subscription.customer;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  // Send notification about trial ending (3 days before)
  if (trialEnd) {
    const daysUntilEnd = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilEnd <= 3) {
      // Notification will be sent via notification service
      console.log(`Trial ending in ${daysUntilEnd} days for customer ${customerId}`);
    }
  }
}

async function handleSubscriptionCancellation(subscription: any) {
  const customerId = subscription.customer;

  // Find billing record
  const billingRecord = await prisma.billingRecord.findFirst({
    where: { stripeCustomerId: customerId },
    orderBy: { createdAt: 'desc' },
  });

  if (!billingRecord) {
    console.error(`No billing record found for customer ${customerId}`);
    return;
  }

  const companyId = billingRecord.companyId;

  // Update billing record
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

  // Access will be restricted by requireActiveSubscription middleware
  console.log(`Subscription canceled for company ${companyId} - access restricted`);
}

async function handlePaymentSuccess(invoice: any) {
  const customerId = invoice.customer;
  const amountPaid = invoice.amount_paid / 100;
  const subscriptionId = invoice.subscription;
  const invoiceId = invoice.id;
  const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : null;

  // Find billing record
  const billingRecord = await prisma.billingRecord.findFirst({
    where: { stripeCustomerId: customerId },
    orderBy: { createdAt: 'desc' },
  });

  if (!billingRecord) {
    console.error(`No billing record found for customer ${customerId}`);
    return;
  }

  const companyId = billingRecord.companyId;

  // Get subscription to check status
  let subscription = null;
  let isTrialEnding = false;
  if (subscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
      // If this is the first payment after trial, mark trial as ended
      if (subscription.status === 'active' && subscription.trial_end) {
        const trialEndDate = new Date(subscription.trial_end * 1000);
        if (trialEndDate <= new Date()) {
          isTrialEnding = true;
        }
      }
    } catch (error) {
      console.error('Error retrieving subscription:', error);
    }
  }

  // Update billing record
  await prisma.billingRecord.update({
    where: { id: billingRecord.id },
    data: {
      amountPaid: amountPaid,
      status: 'active',
      billingDate: new Date(),
      isTrialPeriod: !isTrialEnding,
      nextBillingDate: periodEnd,
    },
  });

  // Update company - ACTIVATE ACCESS
  await prisma.company.update({
    where: { id: companyId },
    data: {
      subscriptionStatus: 'active',
      isTrialActive: false,
    },
  });

  // ACTIVATE ALL USERS IN THE COMPANY - Allow access
  await prisma.user.updateMany({
    where: { 
      companyId: companyId,
      isActive: false, // Only update inactive users
    },
    data: {
      isActive: true, // Activate users when payment succeeds
    },
  });

  console.log(`Payment succeeded for company ${companyId} - Access activated for all users`);
}

async function handlePaymentFailure(invoice: any) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  // Find billing record
  const billingRecord = await prisma.billingRecord.findFirst({
    where: { stripeCustomerId: customerId },
    orderBy: { createdAt: 'desc' },
  });

  if (!billingRecord) {
    console.error(`No billing record found for customer ${customerId}`);
    return;
  }

  const companyId = billingRecord.companyId;

  // Get subscription to check if it's past due or will be canceled
  let subscription = null;
  if (subscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error('Error retrieving subscription:', error);
    }
  }

  // Update billing record
  await prisma.billingRecord.update({
    where: { id: billingRecord.id },
    data: {
      status: 'failed',
    },
  });

  // If subscription is past_due or will be canceled, restrict access
  if (subscription && (subscription.status === 'past_due' || subscription.status === 'unpaid')) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: subscription.status,
      },
    });

    // Access will be restricted by requireActiveSubscription middleware
    console.log(`Payment failed for company ${companyId} - Access restricted due to ${subscription.status} status`);
  }
}
