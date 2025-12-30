import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import type { NoteSeverity } from "@prisma/client"

// GET /api/notes - Get notes/issues for a task or property
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("taskId")
  const propertyId = searchParams.get("propertyId")
  const noteType = searchParams.get("noteType")

  try {
    if (!taskId && !propertyId) {
      return NextResponse.json({ success: false, message: "taskId or propertyId is required" }, { status: 400 })
    }

    const where: any = {}
    if (taskId) where.taskId = Number(taskId)
    if (propertyId) where.propertyId = Number(propertyId)
    if (noteType) where.noteType = noteType

    const notes = await prisma.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        task: taskId ? { select: { id: true, title: true } } : false,
        property: propertyId ? { select: { id: true, address: true } } : false,
      },
    })

    return NextResponse.json({ success: true, data: { notes } })
  } catch (error) {
    console.error("Notes GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

// POST /api/notes - Create a note or issue
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth

  try {
    const body = await request.json()
    const { taskId, propertyId, content, noteType = "note", severity = "LOW", category } = body

    if ((!taskId && !propertyId) || !content) {
      return NextResponse.json({ success: false, message: "taskId or propertyId, and content are required" }, { status: 400 })
    }

    let companyId: number | null = null

    // Verify task or property exists and get companyId
    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: Number(taskId) },
        select: { id: true, companyId: true },
      })

      if (!task) {
        return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
      }
      companyId = task.companyId
    } else if (propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: Number(propertyId) },
        select: { id: true, companyId: true },
      })

      if (!property) {
        return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 })
      }
      companyId = property.companyId
    }

    // Validate category for issues
    const validCategories = ["DAMAGE", "ACCESS", "MISSING_ITEM", "CLEANING_SUPPLY", "OTHER"]
    if (noteType === "issue" && category && !validCategories.includes(category)) {
      return NextResponse.json({ 
        success: false, 
        message: `Invalid category. Must be one of: ${validCategories.join(", ")}` 
      }, { status: 400 })
    }

    const note = await prisma.note.create({
      data: {
        taskId: taskId ? Number(taskId) : null,
        propertyId: propertyId ? Number(propertyId) : null,
        userId: tokenUser.userId,
        content,
        noteType: noteType as "note" | "issue",
        category: noteType === "issue" ? category : null,
        severity: severity as NoteSeverity,
        status: "OPEN",
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    })

    // If high severity issue, trigger notification to admin
    if (noteType === "issue" && severity === "HIGH" && companyId) {
      const { sendHighSeverityIssueNotification } = await import("@/lib/notifications")
      const entityId = taskId || propertyId
      await sendHighSeverityIssueNotification(companyId, entityId!, note.id)
    }

    return NextResponse.json({ success: true, data: { note } }, { status: 201 })
  } catch (error) {
    console.error("Notes POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
