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
    })

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
