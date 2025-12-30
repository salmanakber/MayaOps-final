import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    const { tokenUser } = auth
    const role = tokenUser.role as UserRole

    // Only Owner role can access all companies
    if ( role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const companies = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({
      success: true,
      data: companies,
    })
  } catch (error) {
    console.error("Error fetching companies:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch companies" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    const { tokenUser } = auth
    const role = tokenUser.role as UserRole

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const { name, basePrice, subscriptionStatus, isTrialActive, trialEndsAt, userId } = await request.json()

    if (!name) {
      return NextResponse.json({ success: false, error: "Company name is required" }, { status: 400 })
    }

    // If userId is provided, verify the user exists
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { id: true, companyId: true },
      });

      if (!user) {
        return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
      }

      // If user already has a company, don't override (or you could update if needed)
      if (user.companyId) {
        return NextResponse.json({ success: false, error: "User already belongs to a company" }, { status: 400 });
      }
    }

    // Create company
    const result = await prisma.company.create({
      data: {
        name,
        basePrice: basePrice ? parseFloat(basePrice) : 55.00,
        subscriptionStatus: subscriptionStatus || "active",
        isTrialActive: isTrialActive || false,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
      },
    })

    // Assign user to company if userId provided
    if (userId) {
      await prisma.user.update({
        where: { id: Number(userId) },
        data: { companyId: result.id },
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("Error creating company:", error)
    return NextResponse.json({ success: false, error: "Failed to create company" }, { status: 500 })
  }
}
