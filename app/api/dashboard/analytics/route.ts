import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// GET /api/dashboard/analytics
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole
  const { searchParams } = new URL(request.url)

  const days = Number.parseInt(searchParams.get("days") || "30")

  try {
    let companyId: number | null = null
    if ( role === UserRole.DEVELOPER || role === UserRole.OWNER) {
      companyId = requireCompanyScope(tokenUser)
      if (!companyId) return NextResponse.json({ success: false, message: "No company scope" }, { status: 403 })
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const where = {
      ...(companyId ? { companyId } : {}),
      createdAt: { gte: startDate },
    }

    // Task trends
    const dailyTasks = await prisma.task.groupBy({
      by: ["status"],
      where,
      _count: true,
    })

    // Cleaner performance
    const cleanerStats = await prisma.task.groupBy({
      by: ["assignedUserId"],
      where: { ...where, assignedUserId: { not: null } },
      _count: { id: true },
      orderBy: [{ _count: { id: "desc" } }],
    })

    // Get cleaner names
    const cleanerIds = cleanerStats.map((c) => c.assignedUserId).filter(Boolean)
    const cleaners = await prisma.user.findMany({
      where: { id: { in: cleanerIds as number[] } },
      select: { id: true, firstName: true, lastName: true },
    })

    const cleanerPerformance = cleanerStats.map((stat) => {
      const cleaner = cleaners.find((c) => c.id === stat.assignedUserId)
      return {
        cleanerId: stat.assignedUserId,
        name: `${cleaner?.firstName} ${cleaner?.lastName}`,
        tasksCompleted: stat._count.id,
      }
    })

    // Issue trends
    const issueStats = await prisma.note.groupBy({
      by: ["severity"],
      where: {
        ...(companyId ? { task: { companyId } } : {}),
        noteType: "issue",
        createdAt: { gte: startDate },
      },
      _count: true,
    })

    // Property statistics
    const propertyStats = await prisma.property.groupBy({
      by: ["propertyType"],
      where: companyId ? { companyId } : {},
      _count: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        taskStats: dailyTasks.map((t) => ({ status: t.status, count: t._count })),
        cleanerPerformance: cleanerPerformance.slice(0, 10),
        issueStats: issueStats.map((i) => ({ severity: i.severity, count: i._count })),
        propertyStats: propertyStats.map((p) => ({ type: p.propertyType, count: p._count })),
      },
    })
  } catch (error) {
    console.error("Dashboard analytics error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
