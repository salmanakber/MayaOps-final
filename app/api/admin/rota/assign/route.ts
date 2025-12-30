import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"
import { validateAssignment } from "@/lib/rota-conflicts"
import { logAudit } from "@/lib/audit"
import { sendTaskAssignmentNotification, scheduleTaskReminders } from "@/lib/notifications"

// POST /api/admin/rota/assign - Assign task to cleaner (admin-only)
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  // Only allow admin roles
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { taskId, cleanerId, scheduledDate, ignoreWarnings } = body

    if (!taskId || !cleanerId) {
      return NextResponse.json({ success: false, message: "taskId and cleanerId are required" }, { status: 400 })
    }

    // Get full task details including property for validation
    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      include: {
        property: {
          include: {
            requiredSkills: {
              include: { skill: true },
            },
          },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
    }

    // Verify company access
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      if (task.companyId !== tokenUser.companyId) {
        return NextResponse.json({ success: false, message: "Not authorized to access this task" }, { status: 403 })
      }
    }

    // Verify cleaner belongs to same company
    const cleaner = await prisma.user.findFirst({
      where: {
        id: Number(cleanerId),
        role: UserRole.CLEANER,
        companyId: task.companyId,
      },
    })

    if (!cleaner) {
      return NextResponse.json({ success: false, message: "Cleaner not found or not in company" }, { status: 404 })
    }

    // Validate assignment and detect conflicts
    const taskScheduledDate = scheduledDate ? new Date(scheduledDate) : (task.scheduledDate || new Date())
    
    // Calculate week boundaries for max hours validation
    const date = new Date(taskScheduledDate)
    const day = date.getDay()
    const diff = date.getDate() - day
    const weekStart = new Date(date.setDate(diff))
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    const validation = await validateAssignment(
      cleaner.id,
      task.id,
      taskScheduledDate,
      task.propertyId,
      task.estimatedDurationMinutes,
      weekStart,
      weekEnd
    )

    const oldAssignedUserId = task.assignedUserId

    const updateData: any = { assignedUserId: Number(cleanerId), status: "ASSIGNED" }
    if (scheduledDate) updateData.scheduledDate = taskScheduledDate

    const updatedTask = await prisma.task.update({
      where: { id: Number(taskId) },
      data: updateData,
      include: {
        property: true,
        assignedUser: { 
          select: { 
            id: true, 
            firstName: true, 
            lastName: true,
            email: true,
          },
        },
      },
    })

    // Log audit
    await logAudit({
      companyId: task.companyId,
      userId: tokenUser.userId,
      action: 'update',
      entityType: 'task',
      entityId: task.id,
      oldValues: { assignedUserId: oldAssignedUserId },
      newValues: { assignedUserId: cleaner.id },
    })

    // Send notifications
    await sendTaskAssignmentNotification(task.id, cleaner.id)
    await scheduleTaskReminders(task.id)

    return NextResponse.json({ 
      success: true, 
      data: { 
        task: updatedTask,
        warnings: validation.warnings, // Include warnings in response
      },
    })
  } catch (error) {
    console.error("Admin Rota Assign POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

