import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/billing - Get billing information for company or all companies (for owners)
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const { searchParams } = new URL(request.url);
  const companyIdParam = searchParams.get('companyId');

  try {
    let companyId: number | null = null;

    // Owners and developers can see all companies, others see only their company
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    } else if (companyIdParam) {
      companyId = parseInt(companyIdParam);
    }

    const where = companyId ? { companyId } : {};

    // Get company information (for managers/owners - their own company)
    let companyInfo = null;
    if (companyId) {
      companyInfo = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          subscriptionStatus: true,
          basePrice: true,
          propertyCount: true,
          isTrialActive: true,
          trialEndsAt: true,
          createdAt: true,
        },
      });
    }

    // Get billing records
    const billingRecords = await prisma.billingRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            subscriptionStatus: true,
            basePrice: true,
            propertyCount: true,
            isTrialActive: true,
            trialEndsAt: true,
          },
        },
      },
    });

    // Calculate summary using Prisma aggregations
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const summary = await prisma.billingRecord.aggregate({
      where: {
        ...where,
        billingDate: {
          gte: thirtyDaysAgo,
        },
      },
      _sum: {
        amountPaid: true,
      },
      _count: {
        id: true,
      },
    });

    const failedCount = await prisma.billingRecord.count({
      where: {
        ...where,
        billingDate: {
          gte: thirtyDaysAgo,
        },
        status: 'failed',
      },
    });

    // Get latest billing record for current subscription info
    const latestBillingRecord = billingRecords.length > 0 ? billingRecords[0] : null;

    return NextResponse.json({
      success: true,
      company: companyInfo ? {
        id: companyInfo.id,
        name: companyInfo.name,
        subscriptionStatus: companyInfo.subscriptionStatus,
        basePrice: Number(companyInfo.basePrice),
        propertyCount: companyInfo.propertyCount,
        isTrialActive: companyInfo.isTrialActive,
        trialEndsAt: companyInfo.trialEndsAt?.toISOString(),
        createdAt: companyInfo.createdAt.toISOString(),
        // Calculate monthly cost: basePrice + (propertyCount * £1)
        monthlyCost: Number(companyInfo.basePrice) + (companyInfo.propertyCount * 1),
      } : null,
      currentSubscription: latestBillingRecord ? {
        subscriptionId: latestBillingRecord.subscriptionId,
        status: latestBillingRecord.status,
        nextBillingDate: latestBillingRecord.nextBillingDate?.toISOString(),
        isTrialPeriod: latestBillingRecord.isTrialPeriod,
        trialEndsAt: latestBillingRecord.trialEndsAt?.toISOString(),
      } : null,
      billingRecords: billingRecords.map(record => ({
        id: record.id,
        companyId: record.companyId,
        companyName: record.company.name,
        stripeCustomerId: record.stripeCustomerId,
        subscriptionId: record.subscriptionId,
        status: record.status,
        amountPaid: Number(record.amountPaid),
        amountDue: Number(record.amountDue),
        billingDate: record.billingDate?.toISOString(),
        nextBillingDate: record.nextBillingDate?.toISOString(),
        propertyCount: record.propertyCount,
        isTrialPeriod: record.isTrialPeriod,
        trialEndsAt: record.trialEndsAt?.toISOString(),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      })),
      summary: {
        total_revenue: Number(summary._sum.amountPaid || 0),
        total_transactions: summary._count.id,
        failed_payments: failedCount,
      },
    });
  } catch (error: any) {
    console.error('Error fetching billing:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to fetch billing' 
    }, { status: 500 });
  }
}


