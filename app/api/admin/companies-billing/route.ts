import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/admin/companies-billing - Get all companies with their billing and trial information
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only super admins and owners can access this
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // 'active', 'trialing', 'expired', 'inactive'
    const trialFilter = searchParams.get('trial'); // 'active', 'expired', 'none'

    // Build where clause
    const where: any = {};

    if (statusFilter) {
      where.subscriptionStatus = statusFilter;
    }

    if (trialFilter === 'active') {
      where.isTrialActive = true;
      where.trialEndsAt = {
        gt: new Date(),
      };
    } else if (trialFilter === 'expired') {
      where.OR = [
        { isTrialActive: false },
        { trialEndsAt: { lte: new Date() } },
      ];
    }

    // Get all companies with their billing records
    const companies = await prisma.company.findMany({
      where,
      include: {
        billingRecords: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Get last 5 billing records
        },
        _count: {
          select: {
            users: true,
            properties: true,
            tasks: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();

    // Format response with trial and subscription status
    const formattedCompanies = companies.map(company => {
      const latestBilling = company.billingRecords[0];
      const trialEndsAt = company.trialEndsAt;
      const isTrialActive = company.isTrialActive && trialEndsAt && new Date(trialEndsAt) > now;
      const daysRemaining = trialEndsAt && isTrialActive
        ? Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Calculate total revenue for this company
      const totalRevenue = company.billingRecords.reduce(
        (sum, record) => sum + Number(record.amountPaid),
        0
      );

      return {
        id: company.id,
        name: company.name,
        subscriptionStatus: company.subscriptionStatus,
        isTrialActive,
        trialEndsAt: trialEndsAt?.toISOString(),
        daysRemaining,
        basePrice: Number(company.basePrice),
        propertyCount: company.propertyCount,
        totalRevenue,
        stats: {
          users: company._count.users,
          properties: company._count.properties,
          tasks: company._count.tasks,
        },
        latestBilling: latestBilling ? {
          id: latestBilling.id,
          status: latestBilling.status,
          amountPaid: Number(latestBilling.amountPaid),
          amountDue: Number(latestBilling.amountDue),
          billingDate: latestBilling.billingDate?.toISOString(),
          nextBillingDate: latestBilling.nextBillingDate?.toISOString(),
          isTrialPeriod: latestBilling.isTrialPeriod,
          trialEndsAt: latestBilling.trialEndsAt?.toISOString(),
        } : null,
        billingHistory: company.billingRecords.slice(0, 5).map(record => ({
          id: record.id,
          status: record.status,
          amountPaid: Number(record.amountPaid),
          amountDue: Number(record.amountDue),
          billingDate: record.billingDate?.toISOString(),
          isTrialPeriod: record.isTrialPeriod,
          createdAt: record.createdAt.toISOString(),
        })),
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      };
    });

    // Calculate platform-wide statistics
    const platformStats = await prisma.billingRecord.aggregate({
      _sum: {
        amountPaid: true,
      },
      _count: {
        id: true,
      },
    });

    const activeTrials = await prisma.company.count({
      where: {
        isTrialActive: true,
        trialEndsAt: {
          gt: now,
        },
      },
    });

    const activeSubscriptions = await prisma.company.count({
      where: {
        subscriptionStatus: 'active',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        companies: formattedCompanies,
        platformStats: {
          totalRevenue: Number(platformStats._sum.amountPaid || 0),
          totalTransactions: platformStats._count.id,
          activeTrials,
          activeSubscriptions,
          totalCompanies: companies.length,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching companies billing:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to fetch companies billing' 
    }, { status: 500 });
  }
}



