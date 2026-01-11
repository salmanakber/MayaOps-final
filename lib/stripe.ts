import Stripe from 'stripe';

// Helper function to decrypt encrypted settings (for use in route handlers)
export function decrypt(encryptedText: string): string {
  const crypto = require('crypto');
  const ALGORITHM = 'aes-256-cbc';
  const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'default-key-change-in-production';
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Get Stripe secret key - use env var directly here
// Route handlers will fetch from SystemSetting and pass it in
// This keeps the library functions synchronous while allowing routes to use settings
function getStripeSecretKey(): string {
  // For library use, fallback to env var
  // Routes should fetch from SystemSetting and initialize Stripe there
  return process.env.STRIPE_SECRET_KEY || '';
}

// Initialize Stripe with secret key from env (fallback)
// Route handlers that use SystemSetting should create their own Stripe instance
const stripeSecretKey = getStripeSecretKey();
const stripe = new Stripe(stripeSecretKey || 'dummy-key-for-initialization', {
  apiVersion: '2023-10-16',
});

// Export a function to create Stripe instance with custom key (for route handlers)
export function createStripeInstance(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2023-10-16',
  });
}

export interface BillingCalculation {
  basePrice: number;
  propertyCount: number;
  propertyFee: number;
  totalAmount: number;
}

export function calculateBilling(
  propertyCount: number, 
  basePrice: number = 55.0, 
  pricePerUnit: number = 1.0
): BillingCalculation {
  const propertyFee = propertyCount * pricePerUnit;
  const totalAmount = basePrice + propertyFee;

  return {
    basePrice,
    propertyCount,
    propertyFee,
    totalAmount,
  };
}

export async function createCustomer(email: string, name: string, companyId: number, stripeInstance?: Stripe) {
  const s = stripeInstance || stripe;
  const customer = await s.customers.create({
    email,
    name,
    metadata: {
      companyId: companyId.toString(),
    },
  });

  return customer;
}

export async function createSubscription(
  customerId: string,
  priceId: string,
  quantity: number = 1,
  trialDays: number = 14
) {
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [
      {
        price: priceId,
        quantity,
      },
    ],
    trial_period_days: trialDays,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });

  return subscription;
}

export async function createSubscriptionWithTrial(
  customerId: string,
  basePriceId: string,
  propertyPriceId: string,
  propertyCount: number = 0,
  trialDays: number = 14,
  stripeInstance?: Stripe
) {
  const s = stripeInstance || stripe;
  
  // Create subscription with trial period using both base and property usage prices
  const items: Stripe.SubscriptionCreateParams.Item[] = [
    {
      price: basePriceId,
      quantity: 1, // Base subscription is always quantity 1
    },
  ];

  // Add property usage price item (metered - no quantity needed)
  // For metered plans, we report usage instead of setting quantity
  if (propertyPriceId) {
    items.push({
      price: propertyPriceId,
      // Don't set quantity for metered plans - we'll report usage instead
    });
  }

  const subscription = await s.subscriptions.create({
    customer: customerId,
    items,
    trial_period_days: trialDays,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent', 'latest_invoice'],
  });

  // If there are properties, report initial usage for metered plan
  if (propertyCount > 0 && propertyPriceId) {
    const propertyItem = subscription.items.data.find(
      (item) => item.price.id === propertyPriceId
    );
    
    if (propertyItem) {
      // Report usage for the current billing period
      await s.subscriptionItems.update(
        propertyItem.id,
        {
          quantity: propertyCount,
          proration_behavior: 'create_prorations', // or 'none'
        }
      );
      
    }
  }

  return subscription;
}

/**
 * Update subscription quantity
 * Note: stripeInstance parameter should be created with credentials from SystemSetting in route handlers
 */
export async function updateSubscriptionQuantity(
  subscriptionId: string,
  itemId: string,
  newQuantity: number,
  stripeInstance?: Stripe
) {
  const s = stripeInstance || stripe;
  
  const subscription = await s.subscriptions.update(subscriptionId, {
    items: [
      {
        id: itemId,
        quantity: newQuantity,
      },
    ],
    proration_behavior: 'always_invoice',
  });

  return subscription;
}

/**
 * Report property usage for metered billing in Stripe subscription
 * For metered plans, we report usage instead of updating quantity
 * 
 * Note: For metered plans, Stripe accumulates usage throughout the billing period.
 * We report the current total property count as usage.
 * Note: stripeInstance parameter should be created with credentials from SystemSetting in route handlers
 */
export async function reportPropertyUsage(
  propertyItemId: string,
  propertyCount: number,
  stripeInstance?: Stripe
) {
  const s = stripeInstance || stripe;
  
  // Report usage for the current billing period
  // For metered plans, this reports the usage quantity
  // Stripe will bill based on the total usage reported during the billing period
  const usageRecord = await s.subscriptionItems.update(
    propertyItemId,
    {
      quantity: propertyCount,
      proration_behavior: 'create_prorations', // or 'none'
    }
  );

  return usageRecord;
}

/**
 * Update property usage quantity in Stripe subscription
 * For metered plans, we report usage instead of updating quantity
 * Note: stripeInstance parameter should be created with credentials from SystemSetting in route handlers
 */
export async function updatePropertyUsageQuantity(
  subscriptionId: string,
  propertyItemId: string,
  newPropertyCount: number,
  stripeInstance?: Stripe
) {
  const s = stripeInstance || stripe;
  
  // For metered plans, we report usage instead of updating quantity
  // Report the new total usage
  await reportPropertyUsage(propertyItemId, newPropertyCount, s);
  
  // Return the subscription for consistency
  return await s.subscriptions.retrieve(subscriptionId);
}

/**
 * Add property usage item to existing subscription if it doesn't exist
 * For metered plans, we add the item without quantity and report usage
 * Note: stripeInstance parameter should be created with credentials from SystemSetting in route handlers
 */
export async function addPropertyUsageToSubscription(
  subscriptionId: string,
  propertyPriceId: string,
  propertyCount: number,
  stripeInstance?: Stripe
) {
  const s = stripeInstance || stripe;
  const subscription = await s.subscriptions.retrieve(subscriptionId);
  
  // Check if property usage item already exists
  const existingPropertyItem = subscription.items.data.find(
    (item) => item.price.id === propertyPriceId
  );

  if (existingPropertyItem) {
    // Report usage for existing metered item
    await reportPropertyUsage(existingPropertyItem.id, propertyCount, s);
    return subscription;
  }

  // Add new property usage item (metered - no quantity)
  const updatedSubscription = await s.subscriptions.update(subscriptionId, {
    items: [
      {
        price: propertyPriceId,
        // Don't set quantity for metered plans
      },
    ],
    proration_behavior: 'always_invoice',
  });

  // Find the newly added item and report usage
  const newPropertyItem = updatedSubscription.items.data.find(
    (item) => item.price.id === propertyPriceId
  );

  if (newPropertyItem && propertyCount > 0) {
    await reportPropertyUsage(newPropertyItem.id, propertyCount, s);
  }

  return updatedSubscription;
}

export async function cancelSubscription(subscriptionId: string) {
  const subscription = await stripe.subscriptions.cancel(subscriptionId);
  return subscription;
}

/**
 * Handle Stripe webhook with signature verification
 * Note: webhookSecret should be fetched from SystemSetting in the route handler
 * This function accepts it as a parameter to allow fetching from SystemSetting at the route level
 */
export async function handleWebhook(
  payload: string | Buffer, 
  signature: string, 
  webhookSecret?: string
) {
  // If webhookSecret is not provided, fallback to env var (for backward compatibility)
  // Route handlers should fetch from SystemSetting and pass it here
  const secret = webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!secret) {
    throw new Error('Stripe webhook secret not configured. Please configure it in Admin Settings.');
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return event;
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    throw err;
  }
}

export async function retrieveInvoice(invoiceId: string) {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return invoice;
}

export async function listInvoices(customerId: string, limit: number = 10) {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });

  return invoices;
}

export default stripe;
