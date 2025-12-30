import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"

// DELETE /api/photos/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params

    const photo = await prisma.photo.findUnique({
      where: { id: Number(id) },
    })

    if (!photo) {
      return NextResponse.json({ success: false, message: "Photo not found" }, { status: 404 })
    }

    await prisma.photo.delete({
      where: { id: Number(id) },
    })

    return NextResponse.json({ success: true, message: "Photo deleted successfully" })
  } catch (error) {
    console.error("Photo DELETE error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/photos/[id] - Update photo caption
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    const { caption } = body

    const photo = await prisma.photo.update({
      where: { id: Number(id) },
      data: { caption },
    })

    return NextResponse.json({ success: true, data: { photo } })
  } catch (error) {
    console.error("Photo PATCH error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
