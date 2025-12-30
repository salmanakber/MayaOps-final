import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"
import { type NextRequest, NextResponse } from "next/server"

// GET /api/admin/companies/[id] - Get single company with billing and trial info
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireAuth(request)
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    
    const { tokenUser } = auth
    const role = tokenUser.role as UserRole

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const companyId = parseInt(params.id)
    if (isNaN(companyId)) {
      return NextResponse.json({ success: false, error: "Invalid company ID" }, { status: 400 })
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        billingRecords: {
          orderBy: { billingDate: 'desc' },
          take: 10,
        },
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
        properties: {
          select: {
            id: true,
            address: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            users: true,
            properties: true,
            tasks: true,
            billingRecords: true,
          },
        },
      },
    })

    if (!company) {
      return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 })
    }

    // Calculate trial status
    const now = new Date()
    const trialEndsAt = company.trialEndsAt
    const isTrialActive = company.isTrialActive && trialEndsAt && new Date(trialEndsAt) > now
    const daysRemaining = trialEndsAt && isTrialActive
      ? Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0

    // Calculate total revenue
    const totalRevenue = company.billingRecords.reduce(
      (sum, record) => sum + Number(record.amountPaid || 0),
      0
    )

    // Format response
    const formattedCompany = {
      id: company.id,
      name: company.name,
      subscriptionStatus: company.subscriptionStatus,
      basePrice: Number(company.basePrice),
      propertyCount: company.propertyCount,
      isTrialActive,
      trialEndsAt: trialEndsAt?.toISOString(),
      daysRemaining,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
      stats: {
        users: company._count.users,
        properties: company._count.properties,
        tasks: company._count.tasks,
        billingRecords: company._count.billingRecords,
      },
      totalRevenue,
      billingRecords: company.billingRecords.map(record => ({
        id: record.id,
        status: record.status,
        amountPaid: Number(record.amountPaid),
        amountDue: Number(record.amountDue),
        billingDate: record.billingDate?.toISOString(),
        nextBillingDate: record.nextBillingDate?.toISOString(),
        propertyCount: record.propertyCount,
        isTrialPeriod: record.isTrialPeriod,
        trialEndsAt: record.trialEndsAt?.toISOString(),
        createdAt: record.createdAt.toISOString(),
      })),
      users: company.users,
      properties: company.properties,
    }

    return NextResponse.json({
      success: true,
      data: formattedCompany,
    })
  } catch (error) {
    console.error("Error fetching company:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch company" }, { status: 500 })
  }
}

// PATCH /api/admin/companies/[id] - Update company
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireAuth(request)
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    
    const { tokenUser } = auth
    const role = tokenUser.role as UserRole

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const companyId = parseInt(params.id)
    if (isNaN(companyId)) {
      return NextResponse.json({ success: false, error: "Invalid company ID" }, { status: 400 })
    }

    const body = await request.json()
    const { name, basePrice, subscriptionStatus, isTrialActive, trialEndsAt } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (basePrice !== undefined) updateData.basePrice = basePrice
    if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus
    if (isTrialActive !== undefined) updateData.isTrialActive = isTrialActive
    if (trialEndsAt !== undefined) updateData.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null

    const company = await prisma.company.update({
      where: { id: companyId },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: company,
    })
  } catch (error) {
    console.error("Error updating company:", error)
    return NextResponse.json({ success: false, error: "Failed to update company" }, { status: 500 })
  }
}


