import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// GET /api/dashboard/overview
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole
  

  try {
    let companyId: number | null = null
    if (role === UserRole.OWNER || role === UserRole.MANAGER) {
      companyId = requireCompanyScope(tokenUser)

      if (!companyId) return NextResponse.json({ success: false, message: "No company scope" }, { status: 403 })
    }

    const where = companyId ? { companyId } : {}
    

    // Count statistics
    const totalTasks = await prisma.task.count({ where })
    const completedTasks = await prisma.task.count({
      where: { ...where, status: { in: ["APPROVED", "ARCHIVED"] } },
    })
    const inProgressTasks = await prisma.task.count({
      where: { ...where, status: "IN_PROGRESS" },
    })
    const pendingTasks = await prisma.task.count({
      where: { ...where, status: { in: ["DRAFT", "PLANNED", "ASSIGNED", "SUBMITTED"] } },
    })

    const totalProperties = await prisma.property.count({ where })
    const totalCleaners = await prisma.user.count({
      where: { ...where, role: UserRole.CLEANER, isActive: true },
    })

    const totalCompanies = companyId ? 1 : await prisma.company.count()

    // Task completion rate
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    // Recent tasks
    const recentTasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        property: { select: { address: true } },
      },
    })

    // Task status distribution
    const tasksByStatus = await prisma.task.groupBy({
      by: ["status"],
      where,
      _count: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalTasks,
          completedTasks,
          inProgressTasks,
          pendingTasks,
          totalProperties,
          totalCleaners,
          totalCompanies,
          completionRate: completionRate.toFixed(1),
        },
        recentTasks,
        tasksByStatus: tasksByStatus.map((t) => ({
          status: t.status,
          count: t._count,
        })),
      },
    })
  } catch (error) {
    console.error("Dashboard overview error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
