import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"

// PATCH /api/tasks/checklists/[id] - Mark checklist as complete
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    const { isCompleted } = body

    const checklist = await prisma.checklistItem.update({
      where: { id: Number(id) },
      data: { isCompleted: Boolean(isCompleted) },
    })

    return NextResponse.json({ success: true, data: { checklist } })
  } catch (error) {
    console.error("Checklist PATCH error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/tasks/checklists/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params

    await prisma.checklistItem.delete({
      where: { id: Number(id) },
    })

    return NextResponse.json({ success: true, message: "Checklist item deleted" })
  } catch (error) {
    console.error("Checklist DELETE error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
