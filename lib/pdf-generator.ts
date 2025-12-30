import { Task, Photo, Note, ChecklistItem, Property, User } from '@prisma/client';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface PDFTaskData extends Task {
  property: Property | null;
  assignedUser: (User & { firstName: string | null; lastName: string | null; email: string }) | null;
  photos: Photo[];
  notes: Note[];
  checklists: ChecklistItem[];
}

export interface PDFGenerationResult {
  success: boolean;
  pdfUrl?: string;
  pdfBuffer?: Buffer;
  checksum?: string;
  error?: string;
  generatedAt: Date;
}

export async function generateTaskPDF(task: PDFTaskData): Promise<PDFGenerationResult> {
  const startTime = Date.now();

  try {
    // Get photos (allow any number - no minimum requirement)
    const beforePhotos = task.photos.filter(p => p.photoType === 'before');
    const afterPhotos = task.photos.filter(p => p.photoType === 'after');
    
    // Only check if there are any photos at all
    if (task.photos.length === 0) {
      return {
        success: false,
        error: `No photos available for PDF generation`,
        generatedAt: new Date(),
      };
    }

    // Configure PDFKit font path for Next.js serverless compatibility
    // PDFKit needs access to font files, so we patch fs.readFileSync to redirect font file reads
    try {
      // Find the actual location of PDFKit font files
      const possiblePaths = [
        path.resolve(process.cwd(), 'node_modules/pdfkit/js/data'),
        path.resolve(__dirname, '../../node_modules/pdfkit/js/data'),
        path.resolve(__dirname, '../../../node_modules/pdfkit/js/data'),
      ];
      
      let actualFontPath: string | undefined;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          actualFontPath = testPath;
          break;
        }
      }
      
      if (actualFontPath) {
        // Monkey-patch fs.readFileSync to redirect font file reads
        const originalReadFileSync = fs.readFileSync;
        fs.readFileSync = function(filePath: string | Buffer | URL, ...args: any[]) {
          const filePathStr = filePath.toString();
          // If PDFKit is trying to read a font file from a non-existent path, redirect it
          if (filePathStr.includes('Helvetica.afm') || filePathStr.includes('data/') && filePathStr.endsWith('.afm')) {
            const fileName = path.basename(filePathStr);
            const actualPath = path.join(actualFontPath, fileName);
            if (fs.existsSync(actualPath)) {
              return originalReadFileSync.call(this, actualPath, ...args);
            }
          }
          return originalReadFileSync.call(this, filePath, ...args);
        };
        
        // Restore original after PDF generation
        setTimeout(() => {
          fs.readFileSync = originalReadFileSync;
        }, 1000);
      } else {
        console.warn('PDFKit font path not found. Tried:', possiblePaths);
      }
    } catch (error) {
      console.warn('Could not configure PDFKit font path:', error);
    }

    // Helper function to normalize Cloudinary URL for PDF embedding
    const normalizeCloudinaryUrl = (url: string): string => {
      if (!url) return url;
      
      // Ensure HTTPS
      let normalizedUrl = url.replace(/^http:\/\//, 'https://');
      
      // If it's a Cloudinary URL, ensure it uses the proper format for image fetching
      // Cloudinary URLs should work as-is, but we can add transformations if needed
      if (normalizedUrl.includes('res.cloudinary.com')) {
        // Ensure we're using the image/upload endpoint (not video or raw)
        if (!normalizedUrl.includes('/image/upload/')) {
          // Try to fix the URL structure
          const cloudNameMatch = normalizedUrl.match(/res\.cloudinary\.com\/([^\/]+)\//);
          if (cloudNameMatch) {
            const cloudName = cloudNameMatch[1];
            const pathAfterCloudName = normalizedUrl.split(`res.cloudinary.com/${cloudName}/`)[1];
            if (pathAfterCloudName && !pathAfterCloudName.startsWith('image/upload/')) {
              normalizedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${pathAfterCloudName}`;
            }
          }
        }
        
        // Add format transformation to ensure JPEG format for better PDF compatibility
        // Only if no format is already specified
        if (!normalizedUrl.includes('/f_') && !normalizedUrl.includes('/fl_')) {
          // Insert format transformation before the public ID
          const parts = normalizedUrl.split('/image/upload/');
          if (parts.length === 2) {
            const publicIdPart = parts[1];
            // Check if there are already transformations
            if (publicIdPart.includes(',')) {
              // Has transformations, add format
              normalizedUrl = `${parts[0]}/image/upload/f_jpg,${publicIdPart}`;
            } else {
              // No transformations, add format
              normalizedUrl = `${parts[0]}/image/upload/f_jpg/${publicIdPart}`;
            }
          }
        }
      }
      
      return normalizedUrl;
    };

    // Helper function to fetch image buffer from URL
    const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
      try {
        // Normalize the URL first
        const normalizedUrl = normalizeCloudinaryUrl(url);
        console.log(`Fetching image from: ${normalizedUrl}`);
        
        const response = await fetch(normalizedUrl, {
          headers: {
            'User-Agent': 'MayaOps-PDF-Generator/1.0',
          },
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch image from ${normalizedUrl}: ${response.status} ${response.statusText}`);
          // Try original URL if normalized fails
          if (normalizedUrl !== url) {
            console.log(`Retrying with original URL: ${url}`);
            const retryResponse = await fetch(url, {
              headers: {
                'User-Agent': 'MayaOps-PDF-Generator/1.0',
              },
            });
            if (retryResponse.ok) {
              const arrayBuffer = await retryResponse.arrayBuffer();
              return Buffer.from(arrayBuffer);
            }
          }
          return null;
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
          console.warn(`Unexpected content type for ${normalizedUrl}: ${contentType}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error) {
        console.error(`Error fetching image from ${url}:`, error);
        return null;
      }
    };

    // Fetch all images upfront with better error handling
    const beforePhotoBuffers = await Promise.all(
      beforePhotos.map(async (photo, index) => {
        const buffer = await fetchImageBuffer(photo.url);
        if (!buffer) {
          console.error(`Failed to fetch before photo ${index + 1} from URL: ${photo.url}`);
        }
        return buffer;
      })
    );
    const afterPhotoBuffers = await Promise.all(
      afterPhotos.map(async (photo, index) => {
        const buffer = await fetchImageBuffer(photo.url);
        if (!buffer) {
          console.error(`Failed to fetch after photo ${index + 1} from URL: ${photo.url}`);
        }
        return buffer;
      })
    );
    
    // Log summary of fetched images
    const beforeSuccessCount = beforePhotoBuffers.filter(b => b !== null).length;
    const afterSuccessCount = afterPhotoBuffers.filter(b => b !== null).length;
    console.log(`Fetched ${beforeSuccessCount}/${beforePhotos.length} before photos and ${afterSuccessCount}/${afterPhotos.length} after photos`);

    // Generate actual PDF using PDFKit
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Cover Page
      doc.fontSize(24).font('Helvetica-Bold').text('MayaOps Cleaning Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).font('Helvetica').text(`Task ID: ${task.id}`, { align: 'center' });
      doc.text(`Property: ${task.property?.address || 'N/A'}`, { align: 'center' });
      doc.text(`Cleaner: ${task.assignedUser ? `${task.assignedUser.firstName || ''} ${task.assignedUser.lastName || ''}`.trim() : 'Unassigned'}`, { align: 'center' });
      doc.text(`Date: ${task.scheduledDate ? new Date(task.scheduledDate).toLocaleString() : 'N/A'}`, { align: 'center' });
      doc.text(`Status: ${task.status}`, { align: 'center' });
      doc.moveDown(2);

      // Task Title
      doc.fontSize(18).font('Helvetica-Bold').text(task.title);
      doc.moveDown();

      // Description
      if (task.description) {
        doc.fontSize(12).font('Helvetica-Bold').text('Description');
        doc.fontSize(10).font('Helvetica').text(task.description);
        doc.moveDown();
      }

      // Checklist Section
      if (task.checklists && task.checklists.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Checklist Acknowledgment');
        doc.fontSize(10).font('Helvetica');
        const completedCount = task.checklists.filter(c => c.isCompleted).length;
        doc.text(`Completion: ${completedCount}/${task.checklists.length} (${Math.round((completedCount / task.checklists.length) * 100)}%)`);
        doc.moveDown(0.5);
        task.checklists.forEach((item) => {
          doc.text(`${item.isCompleted ? '✓' : '☐'} ${item.title}`);
        });
        doc.moveDown();
      }

      // Issues Section
      const issues = task.notes.filter(n => n.noteType === 'issue');
      if (issues.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Reported Issues');
        doc.fontSize(10).font('Helvetica');
        issues.forEach((issue) => {
          doc.text(`[${issue.severity || 'N/A'}] ${issue.content}`);
        });
        doc.moveDown();
      }

      // Notes Section
      const notes = task.notes.filter(n => n.noteType !== 'issue');
      if (notes.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Notes');
        doc.fontSize(10).font('Helvetica');
        notes.forEach((note) => {
          doc.text(`• ${note.content}`);
        });
        doc.moveDown();
      }

      // Photo Evidence Section - Before Photos
      if (beforePhotos.length > 0) {
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text('Before Photos');
        doc.moveDown();

        for (let i = 0; i < beforePhotos.length; i++) {
          const photo = beforePhotos[i];
          const imageBuffer = beforePhotoBuffers[i];
          
          // Add photo caption
          if (photo.caption) {
            doc.fontSize(10).font('Helvetica-Bold').text(`Photo ${i + 1}: ${photo.caption}`);
            doc.moveDown(0.3);
          } else {
            doc.fontSize(10).font('Helvetica-Bold').text(`Photo ${i + 1}`);
            doc.moveDown(0.3);
          }
          
          if (photo.takenAt) {
            doc.fontSize(8).font('Helvetica').text(`Taken: ${new Date(photo.takenAt).toLocaleString()}`);
            doc.moveDown(0.3);
          }
          
          // Embed image if we successfully fetched it
          if (imageBuffer) {
            try {
              // Embed image - fit to page width (A4 width minus margins = ~495 points)
              const maxWidth = 495;
              const maxHeight = 400;
              
              doc.image(imageBuffer, {
                fit: [maxWidth, maxHeight],
                align: 'center',
              });
              doc.moveDown();
            } catch (error) {
              console.error(`Error embedding before photo ${i + 1}:`, error);
              doc.fontSize(10).font('Helvetica').text('[Error embedding image]');
              doc.moveDown();
            }
          } else {
            doc.fontSize(10).font('Helvetica').text('[Error loading image]');
            doc.moveDown();
          }
          
          // Add new page if not the last photo and we're close to bottom
          if (i < beforePhotos.length - 1) {
            const currentY = doc.y;
            if (currentY > 700) { // If close to bottom of page
              doc.addPage();
            } else {
              doc.moveDown(0.5);
            }
          }
        }
      }

      // Photo Evidence Section - After Photos
      if (afterPhotos.length > 0) {
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text('After Photos');
        doc.moveDown();

        for (let i = 0; i < afterPhotos.length; i++) {
          const photo = afterPhotos[i];
          const imageBuffer = afterPhotoBuffers[i];
          
          // Add photo caption
          if (photo.caption) {
            doc.fontSize(10).font('Helvetica-Bold').text(`Photo ${i + 1}: ${photo.caption}`);
            doc.moveDown(0.3);
          } else {
            doc.fontSize(10).font('Helvetica-Bold').text(`Photo ${i + 1}`);
            doc.moveDown(0.3);
          }
          
          if (photo.takenAt) {
            doc.fontSize(8).font('Helvetica').text(`Taken: ${new Date(photo.takenAt).toLocaleString()}`);
            doc.moveDown(0.3);
          }
          
          // Embed image if we successfully fetched it
          if (imageBuffer) {
            try {
              // Embed image - fit to page width (A4 width minus margins = ~495 points)
              const maxWidth = 495;
              const maxHeight = 400;
              
              doc.image(imageBuffer, {
                fit: [maxWidth, maxHeight],
                align: 'center',
              });
              doc.moveDown();
            } catch (error) {
              console.error(`Error embedding after photo ${i + 1}:`, error);
              doc.fontSize(10).font('Helvetica').text('[Error embedding image]');
              doc.moveDown();
            }
          } else {
            doc.fontSize(10).font('Helvetica').text('[Error loading image]');
            doc.moveDown();
          }
          
          // Add new page if not the last photo and we're close to bottom
          if (i < afterPhotos.length - 1) {
            const currentY = doc.y;
            if (currentY > 700) { // If close to bottom of page
              doc.addPage();
            } else {
              doc.moveDown(0.5);
            }
          }
        }
      }

      // Summary
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Summary');
      doc.moveDown();
      doc.fontSize(10).font('Helvetica');
      doc.text(`Total Photos: ${task.photos.length}`);
      doc.text(`Before Photos: ${beforePhotos.length}`);
      doc.text(`After Photos: ${afterPhotos.length}`);
      doc.text(`Issues Reported: ${issues.length}`);
      doc.text(`Checklist Items: ${task.checklists?.length || 0}`);
      doc.moveDown();

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica').text('Generated by MayaOps', { align: 'center' });
      doc.text(`Report Date: ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();
    });
    
    // Generate checksum for immutable storage
    const checksum = await generateImmutableChecksum(pdfBuffer);
    
    // Upload to Cloudinary and get URL
    const { uploadPDFToCloudinary } = await import("@/lib/cloudinary");
    const uploadResult = await uploadPDFToCloudinary(pdfBuffer, task.id, checksum);
    
    if (!uploadResult.success || !uploadResult.url) {
      throw new Error("Failed to upload PDF to Cloudinary: " + (uploadResult.error || "Unknown error"));
    }
    
    const pdfUrl = uploadResult.url;
    const fileSize = pdfBuffer.length;

    // Store PDF record with checksum in database
    const prisma = (await import("@/lib/prisma")).default;
    await prisma.pDFRecord.create({
      data: {
        taskId: task.id,
        url: pdfUrl,
        checksum,
        fileSize,
        generatedAt: new Date(),
      },
    });

    const duration = Date.now() - startTime;
    console.log(`✅ PDF generated for task ${task.id} in ${duration}ms (checksum: ${checksum})`);

    // Ensure generation is under 60 seconds requirement
    if (duration > 60000) {
      console.warn(`⚠️ PDF generation took ${duration}ms (exceeds 60s requirement)`);
    }

    return {
      success: true,
      pdfUrl,
      pdfBuffer,
      checksum,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('PDF generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('PDF generation error stack:', errorStack);
    return {
      success: false,
      error: errorMessage,
      generatedAt: new Date(),
    };
  }
}

export function validatePhotoRequirements(photos: Photo[], minCount: number = 20): {
  valid: boolean;
  beforeCount: number;
  afterCount: number;
  errors: string[];
} {
  const beforePhotos = photos.filter(p => p.photoType === 'before');
  const afterPhotos = photos.filter(p => p.photoType === 'after');
  const errors: string[] = [];

  if (beforePhotos.length < minCount) {
    errors.push(`Insufficient before photos: ${beforePhotos.length}/${minCount}`);
  }

  if (afterPhotos.length < minCount) {
    errors.push(`Insufficient after photos: ${afterPhotos.length}/${minCount}`);
  }

  return {
    valid: errors.length === 0,
    beforeCount: beforePhotos.length,
    afterCount: afterPhotos.length,
    errors,
  };
}

export async function generateImmutableChecksum(pdfBuffer: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
}
