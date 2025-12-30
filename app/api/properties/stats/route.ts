import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// GET /api/properties/stats
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  try {
    let companyId: number | null = null

    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      companyId = requireCompanyScope(tokenUser)
      if (!companyId) return NextResponse.json({ success: false, message: "No company scope" }, { status: 403 })
    }

    const where = companyId ? { companyId } : {}

    const totalProperties = await prisma.property.count({ where })
    const activeProperties = await prisma.property.count({ where: { ...where, isActive: true } })

    const propertyTypes = await prisma.property.groupBy({
      by: ["propertyType"],
      where,
      _count: true,
    })

    const taskStats = await prisma.task.groupBy({
      by: ["companyId"],
      where: companyId ? { companyId } : {},
      _count: { id: true },
      _max: { scheduledDate: true },
    })

    return NextResponse.json({
      success: true,
      data: {
        totalProperties,
        activeProperties,
        propertyTypes: propertyTypes.map((p) => ({
          type: p.propertyType,
          count: p._count,
        })),
        stats: taskStats,
      },
    })
  } catch (error) {
    console.error("Property stats error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
