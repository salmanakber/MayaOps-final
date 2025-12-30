import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole;

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.ADMIN_UNIQUE) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const companyId = searchParams.get("companyId")

    // Build where clause
    const where: any = {}
    if (companyId) {
      where.companyId = parseInt(companyId)
    }

    // Fetch billing records using Prisma
    const billingRecords = await prisma.billingRecord.findMany({
      where,
      orderBy: { billingDate: 'desc' },
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
    })

    // Calculate billing summary for last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const summaryRecords = await prisma.billingRecord.findMany({
      where: {
        billingDate: {
          gte: thirtyDaysAgo,
        },
      },
    })

    const totalRevenue = summaryRecords.reduce((sum, r) => sum + Number(r.amountPaid || 0), 0)
    const totalTransactions = summaryRecords.length
    const failedPayments = summaryRecords.filter(r => r.status === 'failed').length

    // Format response
    const formattedRecords = billingRecords.map(record => ({
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
      company: {
        id: record.company.id,
        name: record.company.name,
        subscriptionStatus: record.company.subscriptionStatus,
        basePrice: Number(record.company.basePrice),
        propertyCount: record.company.propertyCount,
        isTrialActive: record.company.isTrialActive,
        trialEndsAt: record.company.trialEndsAt?.toISOString(),
      },
    }))

    return NextResponse.json({
      success: true,
      billingRecords: formattedRecords,
      summary: {
        total_revenue: totalRevenue.toFixed(2),
        total_transactions: totalTransactions,
        failed_payments: failedPayments,
      },
    })
  } catch (error) {
    console.error("Error fetching billing:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch billing" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole;

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.ADMIN_UNIQUE) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const body = await request.json()
    const { companyId, amountPaid, amountDue, billingDate, nextBillingDate, propertyCount, status, isTrialPeriod } = body

    if (!companyId) {
      return NextResponse.json({ success: false, error: "Company ID is required" }, { status: 400 })
    }

    const billingRecord = await prisma.billingRecord.create({
      data: {
        companyId: parseInt(companyId),
        amountPaid: amountPaid || 0,
        amountDue: amountDue || 0,
        billingDate: billingDate ? new Date(billingDate) : new Date(),
        nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null,
        propertyCount: propertyCount || 0,
        status: status || 'active',
        isTrialPeriod: isTrialPeriod || false,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            subscriptionStatus: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: billingRecord.id,
        companyId: billingRecord.companyId,
        companyName: billingRecord.company.name,
        amountPaid: Number(billingRecord.amountPaid),
        amountDue: Number(billingRecord.amountDue),
        billingDate: billingRecord.billingDate?.toISOString(),
        nextBillingDate: billingRecord.nextBillingDate?.toISOString(),
        propertyCount: billingRecord.propertyCount,
        status: billingRecord.status,
        isTrialPeriod: billingRecord.isTrialPeriod,
        createdAt: billingRecord.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("Error processing billing:", error)
    return NextResponse.json({ success: false, error: "Failed to process billing" }, { status: 500 })
  }
}
