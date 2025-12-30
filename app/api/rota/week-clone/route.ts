import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// POST /api/rota/week-clone
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole
  console.log(role)

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.SUPER_ADMIN && role !== UserRole.CLEANER) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const body = await request.json()
    // Support both naming conventions: fromDate/toDate and weekStart/weekEnd
    const fromDate = body.fromDate || body.weekStart
    const toDate = body.toDate || body.weekEnd
    const bodyCompanyId = body.companyId

    if (!fromDate || !toDate) {
      return NextResponse.json({ success: false, message: "fromDate/weekStart and toDate/weekEnd are required" }, { status: 400 })
    }

    let companyId: number | null = null
    // SUPER_ADMIN, OWNER, DEVELOPER can specify companyId
    if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      companyId = bodyCompanyId || tokenUser.companyId || null
    } else {
      // Other roles must use their own company
      companyId = requireCompanyScope(tokenUser)
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: "Company ID is required" }, { status: 400 })
    }

    // Get tasks from previous week
    const previousWeekStart = new Date(fromDate)
    previousWeekStart.setDate(previousWeekStart.getDate() - 7)
    const previousWeekEnd = new Date(toDate)
    previousWeekEnd.setDate(previousWeekEnd.getDate() - 7)

    const tasksToClone = await prisma.task.findMany({
      where: {
        companyId,
        scheduledDate: {
          gte: previousWeekStart,
          lte: previousWeekEnd,
        },
      },
      include: { checklists: true },
    })

    // Clone tasks to current week
    const clonedTasks = []
    const daysOffset = Math.round((new Date(fromDate).getTime() - previousWeekStart.getTime()) / (1000 * 60 * 60 * 24))

    for (const task of tasksToClone) {
      const newScheduledDate = new Date(task.scheduledDate!)
      newScheduledDate.setDate(newScheduledDate.getDate() + daysOffset)

      const clonedTask = await prisma.task.create({
        data: {
          title: task.title,
          description: task.description,
          companyId: task.companyId,
          propertyId: task.propertyId,
          assignedUserId: task.assignedUserId,
          scheduledDate: newScheduledDate,
          status: "PLANNED",
        },
      })

      // Clone checklists
      for (const checklist of task.checklists) {
        await prisma.checklistItem.create({
          data: {
            taskId: clonedTask.id,
            title: checklist.title,
            order: checklist.order,
          },
        })
      }

      clonedTasks.push(clonedTask)
    }

    return NextResponse.json({
      success: true,
      data: { clonedTasksCount: clonedTasks.length, tasks: clonedTasks },
    })
  } catch (error) {
    console.error("Week clone error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
