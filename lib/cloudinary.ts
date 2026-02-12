import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function getCloudinarySignature(paramsToSign: Record<string, any>) {
  return cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);
}

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
  secureUrl?: string;
}

/**
 * Upload photo buffer to Cloudinary
 */
export async function uploadPhotoToCloudinary(
  photoBuffer: Buffer,
  taskId: number,
  userId: number,
  photoType: 'before' | 'after',
  timestamp: Date
): Promise<CloudinaryUploadResult> {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return {
        success: false,
        error: 'Cloudinary credentials are not configured',
      };
    }

    // Create a unique public ID for the image
    const publicId = `mayaops/photos/task-${taskId}/${photoType}/${userId}_${timestamp.getTime()}`;

    // Use upload_stream for better memory efficiency with large files
    const result = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder: `mayaops/photos/task-${taskId}/${photoType}`,
          resource_type: 'image',
          overwrite: false,
          // Optional: Add transformations
          transformation: [
            { quality: 'auto' },
            { fetch_format: 'auto' },
          ],
          // Add context/metadata
          context: {
            taskId: taskId.toString(),
            userId: userId.toString(),
            photoType: photoType,
            uploadedAt: timestamp.toISOString(),
          },
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      // Write buffer to stream and end
      uploadStream.end(photoBuffer);
    });

    return {
      success: true,
      url: result.secure_url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cloudinary upload failed',
    };
  }
}

/**
 * Upload user avatar/profile image to Cloudinary
 */
export async function uploadAvatarToCloudinary(
  photoBuffer: Buffer,
  userId: number,
  timestamp: Date
): Promise<CloudinaryUploadResult> {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return {
        success: false,
        error: 'Cloudinary credentials are not configured',
      };
    }

    // Create a unique public ID for the avatar
    const publicId = `mayaops/avatars/user-${userId}_${timestamp.getTime()}`;

    // Use upload_stream for better memory efficiency with large files
    const result = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder: `mayaops/avatars`,
          resource_type: 'image',
          overwrite: true, // Allow overwriting old avatars
          // Transformations for profile images (square, optimized)
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto' },
            { fetch_format: 'auto' },
          ],
          // Add context/metadata
          context: {
            userId: userId.toString(),
            uploadedAt: timestamp.toISOString(),
            type: 'avatar',
          },
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      // Write buffer to stream and end
      uploadStream.end(photoBuffer);
    });

    return {
      success: true,
      url: result.secure_url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary avatar upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cloudinary avatar upload failed',
    };
  }
}

/**
 * Upload PDF buffer to Cloudinary
 */
export async function uploadPDFToCloudinary(
  pdfBuffer: Buffer,
  taskId: number,
  checksum: string
): Promise<CloudinaryUploadResult> {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return {
        success: false,
        error: 'Cloudinary credentials are not configured',
      };
    }

    // Validate PDF buffer - PDF files start with %PDF
    if (!pdfBuffer || pdfBuffer.length === 0) {
      return {
        success: false,
        error: 'PDF buffer is empty',
      };
    }

    // Check if buffer starts with PDF magic bytes
    const pdfHeader = pdfBuffer.slice(0, 4).toString();
    if (pdfHeader !== '%PDF') {
      console.warn('PDF buffer does not start with PDF magic bytes. Header:', pdfHeader);
      // Continue anyway as PDFKit might generate valid PDFs that don't start with %PDF in some cases
    }

    // Create a unique public ID for the PDF (just filename, folder is set separately to avoid duplication)
    const publicId = `task-${taskId}_${checksum.substring(0, 16)}.pdf`;

    // Use upload_stream for better compatibility with Cloudinary (same approach as photos/avatars)
    // Add explicit authentication and access settings to avoid "untrusted" error
    const result = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder: `mayaops/pdfs`, // Folder path is set here, not in public_id (avoids duplication)
          resource_type: 'raw', // PDFs are uploaded as raw files
          overwrite: false,
          use_filename: false,
          // Explicit authentication and access settings
          type: 'upload', // Explicit upload type
          access_mode: 'public', // Ensure public access
          // Add context/metadata
          context: {
            taskId: taskId.toString(),
            checksum: checksum,
            generatedAt: new Date().toISOString(),
            contentType: 'application/pdf',
          },
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload_stream error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      
      // Write buffer to stream and end
      uploadStream.end(pdfBuffer);
    });

    // Use the secure_url as-is - Cloudinary already handles the correct URL format
    // The .pdf extension in public_id ensures proper content-type
    return {
      success: true,
      url: result.secure_url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary PDF upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cloudinary PDF upload failed',
    };
  }
}

/**
 * Upload CSV buffer to Cloudinary
 */
export async function uploadCSVToCloudinary(
  csvBuffer: Buffer,
  companyId: number,
  fileName: string
): Promise<CloudinaryUploadResult> {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return {
        success: false,
        error: 'Cloudinary credentials are not configured',
      };
    }

    // Create a unique public ID for the CSV
    const timestamp = Date.now();
    const publicId = `mayaops/exports/company-${companyId}/properties-export-${timestamp}.csv`;

    // Convert buffer to base64 data URI for Cloudinary
    const base64CSV = csvBuffer.toString('base64');
    const dataUri = `data:text/csv;base64,${base64CSV}`;

    // Upload to Cloudinary as raw file
    const result = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      folder: `mayaops/exports/company-${companyId}`,
      resource_type: 'raw', // CSV files are uploaded as raw files
      overwrite: false,
      context: {
        companyId: companyId.toString(),
        fileName: fileName,
        exportedAt: new Date().toISOString(),
        type: 'property_export',
      },
    });

    return {
      success: true,
      url: result.secure_url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary CSV upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cloudinary CSV upload failed',
    };
  }
}

/**
 * Delete a file from Cloudinary by public ID
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary credentials are not configured');
      return false;
    }

    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === 'ok';
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return false;
  }
}

/**
 * Get a Cloudinary URL with transformations
 */
export function getCloudinaryUrl(
  publicId: string,
  transformations?: {
    width?: number;
    height?: number;
    quality?: string | number;
    format?: string;
    crop?: string;
  }
): string {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('Cloudinary cloud name is not configured');
    return '';
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  let transformationString = '';

  if (transformations) {
    const transforms: string[] = [];
    if (transformations.width) transforms.push(`w_${transformations.width}`);
    if (transformations.height) transforms.push(`h_${transformations.height}`);
    if (transformations.quality) transforms.push(`q_${transformations.quality}`);
    if (transformations.format) transforms.push(`f_${transformations.format}`);
    if (transformations.crop) transforms.push(`c_${transformations.crop}`);
    
    if (transforms.length > 0) {
      transformationString = transforms.join(',') + '/';
    }
  }

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformationString}${publicId}`;
}

