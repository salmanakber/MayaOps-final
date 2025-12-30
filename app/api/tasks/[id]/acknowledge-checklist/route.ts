import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole, TaskStatus } from "@prisma/client"
import { logAudit } from "@/lib/audit"

// POST /api/tasks/[id]/acknowledge-checklist
// Cleaner must acknowledge checklist before starting task
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const taskId = Number(params.id)

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        checklists: true,
        assignedUser: true,
        taskAssignments: {
          include: {
            user: true,
          },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
    }

    // Verify user is assigned to this task (check both assignedUserId and taskAssignments)
    const isAssigned = task.assignedUserId === tokenUser.userId || 
      (task.taskAssignments && task.taskAssignments.some(ta => ta.user.id === tokenUser.userId));
    const isAdminOrManager = tokenUser.role.includes("ADMIN") || tokenUser.role.includes("MANAGER");
    
    if (!isAssigned && !isAdminOrManager) {
      return NextResponse.json({ success: false, message: "Not authorized to acknowledge this task" }, { status: 403 })
    }

    // Check if all checklist items are completed
    const allCompleted = task.checklists.length > 0 && task.checklists.every(item => item.isCompleted)
    if (!allCompleted) {
      return NextResponse.json({ 
        success: false, 
        message: "All checklist items must be completed before acknowledgment" 
      }, { status: 400 })
    }

    // Check if already acknowledged
    if (task.checklistAcknowledgedAt) {
      return NextResponse.json({ 
        success: false, 
        message: "Checklist already acknowledged",
        data: { acknowledgedAt: task.checklistAcknowledgedAt }
      }, { status: 400 })
    }

    // Acknowledge checklist and allow task to start
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        checklistAcknowledgedAt: new Date(),
        status: task.status === TaskStatus.ASSIGNED ? TaskStatus.IN_PROGRESS : task.status,
      },
      include: {
        checklists: true,
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Log audit
    await logAudit({
      companyId: task.companyId,
      userId: tokenUser.userId,
      action: "acknowledge_checklist",
      entityType: "task",
      entityId: taskId.toString(),
      oldValues: { checklistAcknowledgedAt: null },
      newValues: { checklistAcknowledgedAt: updatedTask.checklistAcknowledgedAt },
    })

    return NextResponse.json({ 
      success: true, 
      data: { 
        task: updatedTask,
        message: "Checklist acknowledged successfully. Task can now be started."
      } 
    })
  } catch (error) {
    console.error("Checklist acknowledgment error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}



