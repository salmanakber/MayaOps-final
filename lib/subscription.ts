import prisma from '@/lib/prisma';
import { JWTPayload } from '@/lib/auth';

/**
 * Check if a company has an active subscription or trial
 */
export async function hasActiveSubscription(companyId: number): Promise<boolean> {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) return false;

    const now = new Date();

    // Check subscription status first
    const subscriptionStatus = company.subscriptionStatus;
    
    // If subscription is canceled, past_due, unpaid, or inactive, deny access
    if (['canceled', 'past_due', 'unpaid', 'inactive', 'incomplete_expired'].includes(subscriptionStatus)) {
      return false;
    }

    // Check if company has active trial (from Company model)
    // @ts-ignore - Fields exist in schema but types may not be updated
    if (company.isTrialActive && company.trialEndsAt) {
      // @ts-ignore
      const trialEnd = new Date(company.trialEndsAt);
      if (trialEnd > now) {
        return true; // Trial is still active
      } else {
        // Trial expired - check if there's an active paid subscription
        if (subscriptionStatus === 'active') {
          return true;
        }
        return false; // Trial expired and no active subscription
      }
    }

    // Get latest billing record
    const billingRecord = await prisma.billingRecord.findFirst({
      where: {
        companyId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (billingRecord) {
      const status = billingRecord.status;
      
      // Check if billing record is active or trialing
      if (status === 'active' || status === 'trialing') {
        // @ts-ignore - Fields exist in schema
        if (billingRecord.isTrialPeriod && billingRecord.trialEndsAt) {
          // @ts-ignore
          const trialEnd = new Date(billingRecord.trialEndsAt);
          if (trialEnd > now) {
            return true; // Trial still active
          } else {
            // Trial expired - check subscription status
            return subscriptionStatus === 'active';
          }
        } else if (status === 'active') {
          // Check if subscription period hasn't ended
          // @ts-ignore
          if (billingRecord.nextBillingDate) {
            // @ts-ignore
            const nextBilling = new Date(billingRecord.nextBillingDate);
            if (nextBilling > now) {
              return true; // Subscription period still active
            }
          } else {
            return true; // Active subscription without end date
          }
        }
      }

      // If billing record status is failed, canceled, or inactive, deny access
      if (['failed', 'canceled', 'inactive'].includes(status)) {
        return false;
      }
    }

    // Final check: subscription status must be active or trialing
    if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}

/**
 * Middleware function to require active subscription
 * Returns true if access is allowed, false otherwise
 */
export async function requireActiveSubscription(tokenUser: JWTPayload): Promise<{ allowed: boolean; message?: string }> {
  // Super admins and developers always have access (platform owners)
  if (tokenUser.role === 'SUPER_ADMIN' || tokenUser.role === 'DEVELOPER') {
    return { allowed: true };
  }

  // Company owners need active subscription/trial
  if (!tokenUser.companyId) {
    return { allowed: false, message: 'No company associated with user' };
  }

  const hasActive = await hasActiveSubscription(tokenUser.companyId);
  
  if (!hasActive) {
    return { 
      allowed: false, 
      message: 'Your trial has expired or subscription is inactive. Please subscribe to continue using the platform.' 
    };
  }

  return { allowed: true };
}

