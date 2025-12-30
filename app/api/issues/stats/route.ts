import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// GET /api/issues/stats
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole
  const { searchParams } = new URL(request.url)
  const companyIdParam = searchParams.get("companyId")
  try {
    let companyId: number | null = null
    if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      if (companyIdParam) {
        companyId = parseInt(companyIdParam)
      }
      else {
        companyId = requireCompanyScope(tokenUser)
      }
      
      console.log("companyId: sdas" +companyId)
      if (!companyId) return NextResponse.json({ success: false, message: "No company scope" }, { status: 403 })
    }

    const where: any = {
      noteType: "issue",
      task: companyId ? { companyId } : {},
    }

    const totalIssues = await prisma.note.count({ where })
    const openIssues = await prisma.note.count({ where: { ...where, status: "OPEN" } })
    const inProgressIssues = await prisma.note.count({ where: { ...where, status: "IN_PROGRESS" } })

    const bySeverity = await prisma.note.groupBy({
      by: ["severity"],
      where,
      _count: true,
    })

    const byStatus = await prisma.note.groupBy({
      by: ["status"],
      where,
      _count: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        totalIssues,
        openIssues,
        inProgressIssues,
        bySeverity: bySeverity.map((s) => ({ severity: s.severity, count: s._count })),
        byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      },
    })
  } catch (error) {
    console.error("Issues stats error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
