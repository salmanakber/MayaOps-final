import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { uploadPhotoToCloudinary } from '@/lib/cloudinary';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const formData = await request.formData();
    const taskId = Number(formData.get('taskId'));
    const photoType = formData.get('photoType') as 'before' | 'after';
    const caption = formData.get('caption') as string | null;
    const file = formData.get('file') as File;

    if (!taskId || !photoType || !file) {
      return NextResponse.json(
        { success: false, message: 'taskId, photoType, and file are required' },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, companyId: true, assignedUserId: true },
    });

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = new Date();
    
    // Extract EXIF timestamp if available
    let exifTimestamp: Date | null = null;
    try {
      // In production, use a library like 'exifr' or 'piexifjs' to extract EXIF data
      // For now, we'll attempt basic extraction
      const { extractExifTimestamp } = await import("@/lib/exif");
      exifTimestamp = await extractExifTimestamp(buffer);
    } catch (error) {
      console.warn("Could not extract EXIF timestamp:", error);
      // Fall back to current timestamp
    }

    const uploadResult = await uploadPhotoToCloudinary(buffer, taskId, tokenUser.userId, photoType, timestamp);

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { success: false, message: uploadResult.error || 'Upload failed' },
        { status: 500 }
      );
    }

    const photo = await prisma.photo.create({
      data: {
        taskId,
        userId: tokenUser.userId,
        url: uploadResult.url,
        caption,
        photoType,
        takenAt: exifTimestamp || timestamp,
        exifTimestamp: exifTimestamp,
      },
    });

    return NextResponse.json({ success: true, data: { photo } }, { status: 201 });
  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
