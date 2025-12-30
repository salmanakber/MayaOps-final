import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// GET /api/rota/conflicts
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole
  const { searchParams } = new URL(request.url)

  const cleanerId = searchParams.get("cleanerId")
  const date = searchParams.get("date")

  try {
    let companyId: number | null = null
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      companyId = requireCompanyScope(tokenUser)
      if (!companyId) return NextResponse.json({ success: false, message: "No company scope" }, { status: 403 })
    }
  

    if (!cleanerId || !date) {
      return NextResponse.json({ success: false, message: "cleanerId and date are required" }, { status: 400 })
    }

    const targetDate = new Date(date)
    const dayStart = new Date(targetDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(targetDate)
    dayEnd.setHours(23, 59, 59, 999)

    const existingTasks = await prisma.task.findMany({
      where: {
        assignedUserId: Number(cleanerId),
        scheduledDate: {
          gte: dayStart,
          lte: dayEnd,
        },
        status: {
          in: ["ASSIGNED", "IN_PROGRESS", "SUBMITTED"],
        },
      },
      select: { id: true, title: true, property: { select: { address: true } } },
    })

    return NextResponse.json({
      success: true,
      data: {
        hasConflict: existingTasks.length > 0,
        conflicts: existingTasks,
      },
    })
  } catch (error) {
    console.error("Conflicts GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
