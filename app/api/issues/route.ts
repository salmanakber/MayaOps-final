import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// GET /api/issues
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole
  const { searchParams } = new URL(request.url)

  const status = searchParams.get("status")
  const severity = searchParams.get("severity")

  try {
    const companyIdParam = searchParams.get("companyId")
    let companyId: number | null = null
    if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      // Allow companyId from query param for SUPER_ADMIN to view different companies
      companyId = companyIdParam ? parseInt(companyIdParam) : null
    } else {
      companyId = requireCompanyScope(tokenUser)
      if (!companyId) return NextResponse.json({ success: false, message: "No company scope" }, { status: 403 })
    }

    const where: any = {
      noteType: "issue",
      task: companyId ? { companyId } : {},
    }

    if (status) where.status = status
    if (severity) where.severity = severity

    const issues = await prisma.note.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            property: { select: { address: true } },
          },
        },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json({ success: true, data: { issues } })
  } catch (error) {
    console.error("Issues GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
