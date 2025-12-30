import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"

// POST /api/tasks/checklists - Add checklist item
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { taskId, title, order = 0 } = body

    if (!taskId || !title) {
      return NextResponse.json({ success: false, message: "taskId and title are required" }, { status: 400 })
    }

    const checklist = await prisma.checklistItem.create({
      data: {
        taskId: Number(taskId),
        title,
        order: Number(order),
      },
    })

    return NextResponse.json({ success: true, data: { checklist } }, { status: 201 })
  } catch (error) {
    console.error("Checklist POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
