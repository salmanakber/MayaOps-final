import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// GET /api/admin/rota/conflicts - Get conflicts for admin panel (admin-only)
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  // Only allow admin roles
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cleanerId = searchParams.get("cleanerId")
  const date = searchParams.get("date")
  const weekStart = searchParams.get("weekStart")
  const weekEnd = searchParams.get("weekEnd")
  const companyIdParam = searchParams.get("companyId")

  try {
    let companyId: number | null = null
    
    // SUPER_ADMIN, OWNER, DEVELOPER can view any company
    if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      companyId = companyIdParam ? Number(companyIdParam) : (tokenUser.companyId || null)
    } else {
      // COMPANY_ADMIN and MANAGER can only view their own company
      companyId = tokenUser.companyId || null
    }

    // If weekStart and weekEnd are provided, get all conflicts for the week
    if (weekStart && weekEnd) {
      const weekStartDate = new Date(weekStart)
      const weekEndDate = new Date(weekEnd)
      weekEndDate.setHours(23, 59, 59, 999)

      // Get all tasks in the week that might have conflicts
      const tasks = await prisma.task.findMany({
        where: {
          companyId: companyId || undefined,
          scheduledDate: {
            gte: weekStartDate,
            lte: weekEndDate,
          },
          status: {
            in: ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "PLANNED"],
          },
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          property: {
            select: {
              id: true,
              address: true,
            },
          },
        },
      })

      // Detect conflicts: multiple tasks assigned to same cleaner on same day
      const conflicts: Array<{ taskId: number; cleanerId: number; reason: string }> = []
      const cleanerDayMap = new Map<string, number[]>()

      tasks.forEach((task) => {
        if (task.assignedUserId) {
          const taskDate = new Date(task.scheduledDate || new Date())
          const dayKey = `${task.assignedUserId}-${taskDate.toISOString().split("T")[0]}`
          
          if (!cleanerDayMap.has(dayKey)) {
            cleanerDayMap.set(dayKey, [])
          }
          cleanerDayMap.get(dayKey)!.push(task.id)
        }
      })

      // Find days with multiple tasks (conflicts)
      cleanerDayMap.forEach((taskIds, key) => {
        if (taskIds.length > 1) {
          const [cleanerId, dateStr] = key.split("-")
          taskIds.forEach((taskId) => {
            conflicts.push({
              taskId,
              cleanerId: Number(cleanerId),
              reason: `Multiple tasks assigned on ${dateStr}`,
            })
          })
        }
      })

      return NextResponse.json({
        success: true,
        data: {
          conflicts,
        },
      })
    }

    // Single date/cleaner conflict check (for backward compatibility)
    if (!cleanerId || !date) {
      return NextResponse.json({ success: false, message: "cleanerId and date are required, or weekStart and weekEnd" }, { status: 400 })
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
        ...(companyId ? { companyId } : {}),
      },
      select: { 
        id: true, 
        title: true, 
        property: { 
          select: { 
            address: true 
          } 
        } 
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        hasConflict: existingTasks.length > 0,
        conflicts: existingTasks,
      },
    })
  } catch (error) {
    console.error("Admin Conflicts GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

