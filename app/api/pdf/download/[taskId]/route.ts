import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"

// GET /api/pdf/download/[taskId]
export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { taskId } = await params

    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      include: {
        property: true,
        assignedUser: { select: { firstName: true, lastName: true } },
        photos: {
          select: { url: true, photoType: true, caption: true },
        },
        checklists: {
          orderBy: { order: "asc" },
          select: { title: true, isCompleted: true },
        },
        notes: {
          select: { content: true, severity: true },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
    }

    // In production, generate actual PDF using jsPDF/PDFKit
    // For now, return JSON that could be rendered on client
    const pdfContent = {
      type: "application/pdf",
      taskId: task.id,
      taskTitle: task.title,
      property: task.property?.address,
      date: task.scheduledDate?.toLocaleDateString(),
      cleaner: task.assignedUser,
      photos: task.photos,
      checklists: task.checklists,
      notes: task.notes,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json({ success: true, data: pdfContent })
  } catch (error) {
    console.error("PDF download error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
