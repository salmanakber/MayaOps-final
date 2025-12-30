import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { uploadAvatarToCloudinary } from '@/lib/cloudinary';

/**
 * POST /api/users/upload-avatar
 * Upload user profile image to Cloudinary
 */
export async function POST(request: NextRequest) {
  try {
    const tokenUser = getUserFromRequest(request);
    if (!tokenUser) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized - Invalid or missing token'
      }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({
        success: false,
        message: 'Image file is required'
      }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({
        success: false,
        message: 'File must be an image'
      }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = new Date();

    // Upload to Cloudinary using avatar-specific function
    const uploadResult = await uploadAvatarToCloudinary(
      buffer,
      tokenUser.userId,
      timestamp
    );

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json({
        success: false,
        message: uploadResult.error || 'Failed to upload image'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        url: uploadResult.url,
        secureUrl: uploadResult.secureUrl,
        publicId: uploadResult.publicId
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}

