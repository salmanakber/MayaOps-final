import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { generateTaskPDF } from "@/lib/pdf-generator"
import { enqueueJob } from "@/lib/queue"

// POST /api/pdf/generate
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { taskId, async = false, pdfType = 'combined' } = body

    if (!taskId) {
      return NextResponse.json({ success: false, message: "taskId is required" }, { status: 400 })
    }

    // Validate pdfType
    if (!['before', 'after', 'combined'].includes(pdfType)) {
      return NextResponse.json({ success: false, message: "pdfType must be 'before', 'after', or 'combined'" }, { status: 400 })
    }

    // Fetch task with all related data
    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      include: {
        property: true,
        assignedUser: { select: { firstName: true, lastName: true, email: true } },
        photos: {
          orderBy: { photoType: "asc" },
        },
        notes: true,
        checklists: {
          orderBy: { order: "asc" },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
    }

    // Check photos based on pdfType
    const beforePhotos = task.photos.filter(p => p.photoType === 'before');
    const afterPhotos = task.photos.filter(p => p.photoType === 'after');
    
    if (pdfType === 'before' && beforePhotos.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No before photos available for PDF generation",
        errors: ["At least one before photo is required"],
        beforeCount: 0,
        afterCount: afterPhotos.length,
      }, { status: 400 })
    }
    
    if (pdfType === 'after' && afterPhotos.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No after photos available for PDF generation",
        errors: ["At least one after photo is required"],
        beforeCount: beforePhotos.length,
        afterCount: 0,
      }, { status: 400 })
    }
    
    if (pdfType === 'combined' && (!task.photos || task.photos.length === 0)) {
      return NextResponse.json({
        success: false,
        message: "No photos available for PDF generation",
        errors: ["At least one photo is required to generate a PDF"],
        beforeCount: 0,
        afterCount: 0,
      }, { status: 400 })
    }

    // If async, queue the job
    if (async) {
      await enqueueJob({
        id: `pdf-${taskId}-${Date.now()}`,
        type: 'pdf_generation',
        data: { taskId },
      })

      return NextResponse.json({
        success: true,
        message: "PDF generation queued",
        data: { taskId, status: "queued" },
      })
    }

    // Generate PDF synchronously
    // Note: generateTaskPDF already handles upload to Cloudinary and DB record creation
    // Type assertion needed because assignedUser selection is partial
    const result = await generateTaskPDF(task as any, pdfType as 'before' | 'after' | 'combined')

    if (!result.success) {
      return NextResponse.json({
        success: false,
        message: result.error || "PDF generation failed",
      }, { status: 500 })
    }

    // Return the result - generateTaskPDF already uploaded and saved to DB

    
    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        pdfUrl: result.pdfUrl,
        generatedAt: result.generatedAt,
      },
    })
  } catch (error: any) {
    console.error("PDF generation error:", error)
    return NextResponse.json({ 
      success: false, 
      message: error?.message || "Internal server error",
      error: error?.stack 
    }, { status: 500 })
  }
}
