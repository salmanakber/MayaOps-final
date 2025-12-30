import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// POST /api/tasks/recurring
// Generate instances for recurring tasks (called on schedule or manually)
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  // Only managers and admins can generate recurring tasks
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.SUPER_ADMIN) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { taskId, daysAhead = 7 } = body

    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      select: {
        id: true,
        companyId: true,
        propertyId: true,
        title: true,
        description: true,
        assignedUserId: true,
        recurringPattern: true,
        isRecurring: true,
        checklists: true,
      },
    })

    if (!task || !task.isRecurring) {
      return NextResponse.json({ success: false, message: "Task not recurring or not found" }, { status: 404 })
    }

    // Authorization
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      const companyId = requireCompanyScope(tokenUser)
      if (task.companyId !== companyId) {
        return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
      }
    }

    const instances = []
    const now = new Date()
    const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    // Generate dates based on pattern
    const dates: Date[] = []
    const currentDate = new Date(now)

    while (currentDate <= endDate) {
      dates.push(new Date(currentDate))

      switch (task.recurringPattern) {
        case "daily":
          currentDate.setDate(currentDate.getDate() + 1)
          break
        case "weekly":
          currentDate.setDate(currentDate.getDate() + 7)
          break
        case "biweekly":
          currentDate.setDate(currentDate.getDate() + 14)
          break
        case "monthly":
          currentDate.setMonth(currentDate.getMonth() + 1)
          break
        default:
          break
      }
    }

    // Create task instances linked to parent
    for (const date of dates) {
      // Check if instance already exists for this date
      const existingInstance = await prisma.task.findFirst({
        where: {
          parentTaskId: task.id,
          scheduledDate: date,
        },
      })

      if (existingInstance) {
        instances.push(existingInstance)
        continue
      }

      // Get task assignments to copy them to instances
      const taskAssignments = await prisma.taskAssignment.findMany({
        where: { taskId: task.id },
        select: { userId: true },
      });

      const instance = await prisma.task.create({
        data: {
          title: task.title, // Keep original title, date is in scheduledDate
          description: task.description,
          companyId: task.companyId,
          propertyId: task.propertyId,
          assignedUserId: task.assignedUserId,
          scheduledDate: date,
          status: "DRAFT",
          isRecurring: false,
          parentTaskId: task.id, // Link to parent recurring task
          // Copy task assignments to the new instance
          taskAssignments: taskAssignments.length > 0 ? {
            create: taskAssignments.map(ta => ({
              userId: ta.userId,
            })),
          } : undefined,
        },
      })

      // Copy checklists from parent
      for (const checklist of task.checklists) {
        await prisma.checklistItem.create({
          data: {
            taskId: instance.id,
            title: checklist.title,
            order: checklist.order,
          },
        })
      }

      instances.push(instance)
    }

    return NextResponse.json({ success: true, data: { instances, count: instances.length } }, { status: 201 })
  } catch (error) {
    console.error("Recurring tasks POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
