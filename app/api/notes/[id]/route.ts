import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import type { NoteSeverity, NoteStatus } from "@prisma/client"

// GET /api/notes/[id] - Get a specific note/issue
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const note = await prisma.note.findUnique({
      where: { id: Number(params.id) },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        task: { select: { id: true, title: true } },
        property: { select: { id: true, address: true } },
      },
    })

    if (!note) {
      return NextResponse.json({ success: false, message: "Note not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: { note } })
  } catch (error) {
    console.error("Note GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/notes/[id] - Update a note/issue
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth

  try {
    const body = await request.json()
    const { content, severity, status, category } = body

    // Check if note exists and user has permission
    const existingNote = await prisma.note.findUnique({
      where: { id: Number(params.id) },
      select: { userId: true, noteType: true },
    })

    if (!existingNote) {
      return NextResponse.json({ success: false, message: "Note not found" }, { status: 404 })
    }

    // Only the creator or admin/manager can update
    const isOwner = existingNote.userId === tokenUser.userId
    const isAdmin = ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(tokenUser.role)

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
    }

    // Get full note details before update for notification purposes
    const noteBeforeUpdate = await prisma.note.findUnique({
      where: { id: Number(params.id) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        task: { 
          select: { 
            id: true, 
            title: true, 
            companyId: true,
            assignedUserId: true,
            taskAssignments: {
              select: { userId: true },
            },
          } 
        },
        property: { select: { id: true, address: true } },
      },
    });

    if (!noteBeforeUpdate) {
      return NextResponse.json({ success: false, message: "Note not found" }, { status: 404 });
    }

    const updateData: any = {}
    if (content !== undefined) updateData.content = content
    if (severity !== undefined) updateData.severity = severity as NoteSeverity
    if (status !== undefined) updateData.status = status as NoteStatus
    if (category !== undefined && existingNote.noteType === "issue") updateData.category = category

    const note = await prisma.note.update({
      where: { id: Number(params.id) },
      data: updateData,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        task: { select: { id: true, title: true } },
        property: { select: { id: true, address: true } },
      },
    });

    // Send notifications when status changes (only for issues)
    if (status !== undefined && existingNote.noteType === "issue" && status !== noteBeforeUpdate.status) {
      try {
        const { createNotification } = await import("@/lib/notifications");
        const statusLabels: Record<string, string> = {
          'OPEN': 'opened',
          'IN_PROGRESS': 'marked as in progress',
          'RESOLVED': 'resolved',
        };
        const statusLabel = statusLabels[status] || status.toLowerCase();

        // Notify the issue creator (if status changed by someone else)
        if (noteBeforeUpdate.user.id !== tokenUser.userId) {
          await createNotification({
            userId: noteBeforeUpdate.user.id,
            title: 'Issue Status Updated',
            message: `Your issue${noteBeforeUpdate.task ? ` for task "${noteBeforeUpdate.task.title}"` : ''} has been ${statusLabel}.`,
            type: 'task_updated',
            metadata: { 
              noteId: Number(params.id),
              taskId: noteBeforeUpdate.task?.id,
              oldStatus: noteBeforeUpdate.status,
              newStatus: status,
            },
            screenRoute: noteBeforeUpdate.task ? 'TaskDetail' : 'IssueDetail',
            screenParams: noteBeforeUpdate.task 
              ? { taskId: noteBeforeUpdate.task.id }
              : { issueId: Number(params.id) },
          });
        }

        // Notify task assignees if this is a task-related issue
        if (noteBeforeUpdate.task) {
          const assigneeIds: number[] = [];
          
          // Get assigned user
          if (noteBeforeUpdate.task.assignedUserId) {
            assigneeIds.push(noteBeforeUpdate.task.assignedUserId);
          }
          
          // Get task assignment users
          if (noteBeforeUpdate.task.taskAssignments) {
            noteBeforeUpdate.task.taskAssignments.forEach((ta: any) => {
              if (!assigneeIds.includes(ta.userId)) {
                assigneeIds.push(ta.userId);
              }
            });
          }

          // Remove the current user and issue creator from notification list
          const uniqueAssigneeIds = assigneeIds.filter(
            id => id !== tokenUser.userId && id !== noteBeforeUpdate.user.id
          );

          // Notify all assignees
          await Promise.all(
            uniqueAssigneeIds.map(userId =>
              createNotification({
                userId,
                title: 'Issue Status Updated',
                message: `An issue${noteBeforeUpdate.task ? ` for task "${noteBeforeUpdate.task.title}"` : ''} has been ${statusLabel}.`,
                type: 'task_updated',
                metadata: { 
                  noteId: Number(params.id),
                  taskId: noteBeforeUpdate.task.id,
                  oldStatus: noteBeforeUpdate.status,
                  newStatus: status,
                },
                screenRoute: 'TaskDetail',
                screenParams: { taskId: noteBeforeUpdate.task.id },
              }).catch((err) => {
                console.error(`Error sending notification to user ${userId}:`, err);
              })
            )
          );

          // Notify managers and owners if status is RESOLVED
          if (status === 'RESOLVED' && noteBeforeUpdate.task.companyId) {
            const managersAndOwners = await prisma.user.findMany({
              where: {
                companyId: noteBeforeUpdate.task.companyId,
                role: { in: ['OWNER', 'MANAGER', 'COMPANY_ADMIN'] as any },
                isActive: true,
              },
              select: { id: true },
            });

            await Promise.all(
              managersAndOwners
                .filter(admin => admin.id !== tokenUser.userId && admin.id !== noteBeforeUpdate.user.id)
                .map(admin =>
                  createNotification({
                    userId: admin.id,
                    title: 'Issue Resolved',
                    message: `An issue${noteBeforeUpdate.task ? ` for task "${noteBeforeUpdate.task.title}"` : ''} has been resolved.`,
                    type: 'task_updated',
                    metadata: { 
                      noteId: Number(params.id),
                      taskId: noteBeforeUpdate.task.id,
                    },
                    screenRoute: 'TaskDetail',
                    screenParams: { taskId: noteBeforeUpdate.task.id },
                  }).catch((err) => {
                    console.error(`Error sending notification to admin ${admin.id}:`, err);
                  })
                )
            );
          }
        }
      } catch (notifError) {
        console.error('Error sending status change notifications:', notifError);
        // Don't fail the update if notification fails
      }
    }

    return NextResponse.json({ success: true, data: { note } })
  } catch (error) {
    console.error("Note PATCH error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/notes/[id] - Delete a note/issue
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth

  try {
    // Check if note exists and user has permission
    const existingNote = await prisma.note.findUnique({
      where: { id: Number(params.id) },
      select: { userId: true },
    })

    if (!existingNote) {
      return NextResponse.json({ success: false, message: "Note not found" }, { status: 404 })
    }

    // Only the creator or admin/manager can delete
    const isOwner = existingNote.userId === tokenUser.userId
    const isAdmin = ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(tokenUser.role)

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
    }

    await prisma.note.delete({
      where: { id: Number(params.id) },
    })

    return NextResponse.json({ success: true, message: "Note deleted successfully" })
  } catch (error) {
    console.error("Note DELETE error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
