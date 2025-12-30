import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"

// GET /api/photos - Get photos for a task
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("taskId")
  const photoType = searchParams.get("photoType")

  try {
    if (!taskId) {
      return NextResponse.json({ success: false, message: "taskId is required" }, { status: 400 })
    }

    const where: any = { taskId: Number(taskId) }
    if (photoType) where.photoType = photoType

    const photos = await prisma.photo.findMany({
      where,
      orderBy: { takenAt: "asc" },
      select: {
        id: true,
        url: true,
        photoType: true,
        caption: true,
        takenAt: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    })

    return NextResponse.json({ success: true, data: { photos } })
  } catch (error) {
    console.error("Photos GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

// POST /api/photos - Upload photo (uses same logic as /api/photos/upload)
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth

  try {
    const formData = await request.formData()
    const taskId = formData.get("taskId")
    const photoType = formData.get("photoType") as string
    const caption = formData.get("caption") as string
    const file = formData.get("file") as File

    if (!taskId || !photoType || !file) {
      return NextResponse.json({ success: false, message: "taskId, photoType, and file are required" }, { status: 400 })
    }

    // Verify task exists
    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      select: { id: true, companyId: true, assignedUserId: true },
    })

    if (!task) {
      return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const timestamp = new Date()
    
    // Extract EXIF timestamp if available
    let exifTimestamp: Date | null = null
    try {
      const { extractExifTimestamp } = await import("@/lib/exif")
      exifTimestamp = await extractExifTimestamp(buffer)
    } catch (error) {
      console.warn("Could not extract EXIF timestamp:", error)
    }

    // Upload to Cloudinary
    const { uploadPhotoToCloudinary } = await import("@/lib/cloudinary")
    const uploadResult = await uploadPhotoToCloudinary(buffer, Number(taskId), tokenUser.userId, photoType as "before" | "after", timestamp)

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { success: false, message: uploadResult.error || "Upload failed" },
        { status: 500 }
      )
    }

    const photo = await prisma.photo.create({
      data: {
        taskId: Number(taskId),
        userId: tokenUser.userId,
        url: uploadResult.url,
        photoType,
        caption: caption || undefined,
        takenAt: exifTimestamp || timestamp,
        exifTimestamp: exifTimestamp,
      },
    })

    return NextResponse.json({ success: true, data: { photo } }, { status: 201 })
  } catch (error) {
    console.error("Photo POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
