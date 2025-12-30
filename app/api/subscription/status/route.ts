import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

// Get subscription status including trial information
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const companyId = tokenUser.companyId;
  

  if (!companyId) {
    return NextResponse.json({ success: false, message: 'No company associated' }, { status: 400 });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        billingRecords: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    const billingRecord = company.billingRecords[0];
    const now = new Date();
    const trialEndsAt = company.trialEndsAt;
    const isTrialActive = company.isTrialActive && trialEndsAt && new Date(trialEndsAt) > now;
    const daysRemaining = trialEndsAt 
      ? Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        company: {
          id: company.id,
          name: company.name,
          subscriptionStatus: company.subscriptionStatus,
          isTrialActive,
          trialEndsAt: trialEndsAt?.toISOString(),
          daysRemaining: isTrialActive ? daysRemaining : 0,
        },
        billing: billingRecord ? {
          id: billingRecord.id,
          status: billingRecord.status,
          amountPaid: Number(billingRecord.amountPaid),
          amountDue: Number(billingRecord.amountDue),
          propertyCount: billingRecord.propertyCount,
          isTrialPeriod: billingRecord.isTrialPeriod,
          trialEndsAt: billingRecord.trialEndsAt?.toISOString(),
          nextBillingDate: billingRecord.nextBillingDate?.toISOString(),
        } : null,
      },
    });
  } catch (error: any) {
    console.error('Subscription status error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to get subscription status' 
    }, { status: 500 });
  }
}

