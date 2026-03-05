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

export async function generateTaskPDF(
  task: PDFTaskData,
  pdfType: 'before' | 'after' | 'combined' = 'combined'
): Promise<PDFGenerationResult> {
  const startTime = Date.now();

  try {
    // Get photos (allow any number - no minimum requirement)
    const beforePhotos = task.photos.filter(p => p.photoType === 'before');
    const afterPhotos = task.photos.filter(p => p.photoType === 'after');
    
    // Filter photos based on pdfType
    let photosToInclude: Photo[] = [];
    let sectionTitle = '';
    
    if (pdfType === 'before') {
      photosToInclude = beforePhotos;
      sectionTitle = 'Before Photos';
      if (beforePhotos.length === 0) {
        return {
          success: false,
          error: `No before photos available for PDF generation`,
          generatedAt: new Date(),
        };
      }
    } else if (pdfType === 'after') {
      photosToInclude = afterPhotos;
      sectionTitle = 'After Photos';
      if (afterPhotos.length === 0) {
        return {
          success: false,
          error: `No after photos available for PDF generation`,
          generatedAt: new Date(),
        };
      }
    } else {
      // Combined - use all photos
      photosToInclude = task.photos;
      if (task.photos.length === 0) {
        return {
          success: false,
          error: `No photos available for PDF generation`,
          generatedAt: new Date(),
        };
      }
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

    // Fetch images based on pdfType
    let photoBuffers: (Buffer | null)[] = [];
    if (pdfType === 'before') {
      photoBuffers = await Promise.all(
        photosToInclude.map(async (photo, index) => {
          const buffer = await fetchImageBuffer(photo.url);
          if (!buffer) {
            console.error(`Failed to fetch before photo ${index + 1} from URL: ${photo.url}`);
          }
          return buffer;
        })
      );
      console.log(`Fetched ${photoBuffers.filter(b => b !== null).length}/${photosToInclude.length} before photos`);
    } else if (pdfType === 'after') {
      photoBuffers = await Promise.all(
        photosToInclude.map(async (photo, index) => {
          const buffer = await fetchImageBuffer(photo.url);
          if (!buffer) {
            console.error(`Failed to fetch after photo ${index + 1} from URL: ${photo.url}`);
          }
          return buffer;
        })
      );
      console.log(`Fetched ${photoBuffers.filter(b => b !== null).length}/${photosToInclude.length} after photos`);
    } else {
      // Combined - fetch both separately
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
      const beforeSuccessCount = beforePhotoBuffers.filter(b => b !== null).length;
      const afterSuccessCount = afterPhotoBuffers.filter(b => b !== null).length;
      console.log(`Fetched ${beforeSuccessCount}/${beforePhotos.length} before photos and ${afterSuccessCount}/${afterPhotos.length} after photos`);
      
      // Store for combined PDF generation
      (photoBuffers as any).before = beforePhotoBuffers;
      (photoBuffers as any).after = afterPhotoBuffers;
    }

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

      // Photo Evidence Section
      const renderPhotoSection = (
        title: string,
        photos: Photo[],
        buffers: (Buffer | null)[]
      ) => {
        if (!photos.length) return;

        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text(title);
        doc.moveDown();

        // Layout constants for 2 images per row
        const maxWidth = 230;  // ~ half page width minus margins
        const maxHeight = 260;
        const leftX = 50;
        const rightX = 300;
        const rowSpacing = 24;

        let currentY = doc.y;

        for (let i = 0; i < photos.length; i += 2) {
          // If we're too close to the bottom, start a new page
          if (currentY > 700 - maxHeight) {
            doc.addPage();
            currentY = doc.y;
          }

          const leftPhoto = photos[i];
          const rightPhoto = photos[i + 1];
          const leftBuffer = buffers[i];
          const rightBuffer = buffers[i + 1];

          // Caption for the row
          const captionIndex =
            rightPhoto && rightPhoto !== undefined
              ? `Photos ${i + 1} & ${i + 2}`
              : `Photo ${i + 1}`;

          doc.fontSize(10).font('Helvetica-Bold').text(captionIndex, leftX, currentY);
          currentY = doc.y + 4;

          // Helper to draw a single image at a given x
          const drawImage = (photo: Photo | undefined, buffer: Buffer | null | undefined, x: number) => {
            if (!photo) return;

            let imageDrawn = false;

            if (buffer) {
              try {
                doc.image(buffer, x, currentY, {
                  fit: [maxWidth, maxHeight],
                });
                imageDrawn = true;
              } catch (error) {
                console.error(`Error embedding photo ${photo.id}:`, error);
              }
            }

            if (!imageDrawn) {
              // If we couldn't draw the image, at least mark the spot
              doc
                .fontSize(10)
                .font('Helvetica')
                .text('[Error loading image]', x, currentY + maxHeight / 2);
            }
          };

          drawImage(leftPhoto, leftBuffer, leftX);
          drawImage(rightPhoto, rightBuffer, rightX);

          // Row metadata (takenAt) under the images
          const metaY = currentY + maxHeight + 4;
          if (leftPhoto?.takenAt) {
            doc
              .fontSize(8)
              .font('Helvetica')
              .text(`Taken: ${new Date(leftPhoto.takenAt).toLocaleString()}`, leftX, metaY);
          }
          if (rightPhoto?.takenAt) {
            doc
              .fontSize(8)
              .font('Helvetica')
              .text(`Taken: ${new Date(rightPhoto.takenAt).toLocaleString()}`, rightX, metaY);
          }

          // Advance Y for next row
          currentY = metaY + rowSpacing;
        }
      };

      if (pdfType === 'before') {
        renderPhotoSection('Before Photos', photosToInclude, photoBuffers);
      } else if (pdfType === 'after') {
        renderPhotoSection('After Photos', photosToInclude, photoBuffers);
      } else {
        const beforePhotoBuffers = (photoBuffers as any).before || [];
        const afterPhotoBuffers = (photoBuffers as any).after || [];

        renderPhotoSection('Before Photos', beforePhotos, beforePhotoBuffers);
        renderPhotoSection('After Photos', afterPhotos, afterPhotoBuffers);
      }

      // Summary
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Summary');
      doc.moveDown();
      doc.fontSize(10).font('Helvetica');
      if (pdfType === 'before') {
        doc.text(`Before Photos: ${photosToInclude.length}`);
      } else if (pdfType === 'after') {
        doc.text(`After Photos: ${photosToInclude.length}`);
      } else {
        doc.text(`Total Photos: ${task.photos.length}`);
        doc.text(`Before Photos: ${beforePhotos.length}`);
        doc.text(`After Photos: ${afterPhotos.length}`);
      }
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
        pdfType,
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

/**
 * Generate invoice PDF for billing record
 */
export async function generateBillingInvoicePDF(
  billingRecord: {
    id: number;
    company: { name: string };
    amountPaid: number;
    amountDue: number;
    billingDate: Date | null;
    propertyCount: number;
    status: string;
    subscriptionId?: string | null;
  }
): Promise<PDFGenerationResult> {
  const startTime = Date.now();

  try {
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).font('Helvetica').text('MayaOps', { align: 'center' });
      doc.moveDown(2);

      // Invoice details
      doc.fontSize(10).font('Helvetica');
      doc.text(`Invoice Number: INV-${billingRecord.id.toString().padStart(6, '0')}`);
      doc.text(`Invoice Date: ${billingRecord.billingDate ? new Date(billingRecord.billingDate).toLocaleDateString('en-GB') : 'N/A'}`);
      doc.text(`Status: ${billingRecord.status.toUpperCase()}`);
      if (billingRecord.subscriptionId) {
        doc.text(`Subscription ID: ${billingRecord.subscriptionId}`);
      }
      doc.moveDown();

      // Bill to
      doc.fontSize(12).font('Helvetica-Bold').text('Bill To:');
      doc.fontSize(10).font('Helvetica');
      doc.text(billingRecord.company.name);
      doc.moveDown();

      // Items table
      doc.fontSize(12).font('Helvetica-Bold').text('Invoice Details');
      doc.moveDown(0.5);
      
      const tableTop = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Description', 50, tableTop);
      doc.text('Quantity', 350, tableTop);
      doc.text('Amount', 450, tableTop);
      
      doc.moveDown(0.5);
      doc.lineWidth(1).strokeColor('#000000');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      
      doc.fontSize(10).font('Helvetica');
      doc.text('Base Subscription', 50, doc.y + 5);
      doc.text('1', 350, doc.y);
      doc.text(`£${billingRecord.amountPaid.toFixed(2)}`, 450, doc.y);
      
      doc.moveDown();
      doc.text(`Properties (${billingRecord.propertyCount} properties)`, 50, doc.y);
      doc.text(`${billingRecord.propertyCount}`, 350, doc.y);
      doc.text(`£${(billingRecord.propertyCount * 1).toFixed(2)}`, 450, doc.y);
      
      doc.moveDown(2);
      doc.lineWidth(1).strokeColor('#000000');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Total Amount:', 350, doc.y);
      doc.text(`£${billingRecord.amountPaid.toFixed(2)}`, 450, doc.y);
      
      if (billingRecord.amountDue > 0) {
        doc.moveDown();
        doc.fontSize(10).font('Helvetica');
        doc.text(`Amount Due: £${billingRecord.amountDue.toFixed(2)}`, 350, doc.y);
      }

      // Footer
      doc.moveDown(4);
      doc.fontSize(8).font('Helvetica').text('Thank you for your business!', { align: 'center' });
      doc.text('Generated by MayaOps', { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();
    });

    const checksum = await generateImmutableChecksum(pdfBuffer);
    
    // Upload with invoice-specific public ID
    const publicId = `mayaops/invoices/billing-${billingRecord.id}_${checksum.substring(0, 16)}.pdf`;
    const base64PDF = pdfBuffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${base64PDF}`;
    
    const { v2: cloudinary } = await import("cloudinary");
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      folder: 'mayaops/invoices',
      resource_type: 'raw',
      overwrite: false,
    });

    if (!uploadResult.secure_url) {
      throw new Error('Failed to upload invoice PDF to Cloudinary');
    }

    return {
      success: true,
      pdfUrl: uploadResult.secure_url,
      pdfBuffer,
      checksum,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('Invoice PDF generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      generatedAt: new Date(),
    };
  }
}

/**
 * Generate invoice PDF for payroll record
 */
export async function generatePayrollInvoicePDF(
  payrollRecord: {
    id: number;
    user: { firstName: string | null; lastName: string | null; email: string };
    company: { name: string };
    periodStart: Date;
    periodEnd: Date;
    payrollType: string;
    hoursWorked: number | null;
    hourlyRate: number | null;
    fixedSalary: number | null;
    totalAmount: number;
    status: string;
    paidAt: Date | null;
  }
): Promise<PDFGenerationResult> {
  const startTime = Date.now();

  try {
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('PAYROLL INVOICE', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).font('Helvetica').text('MayaOps', { align: 'center' });
      doc.moveDown(2);

      // Invoice details
      doc.fontSize(10).font('Helvetica');
      doc.text(`Invoice Number: PAY-${payrollRecord.id.toString().padStart(6, '0')}`);
      doc.text(`Period: ${new Date(payrollRecord.periodStart).toLocaleDateString('en-GB')} - ${new Date(payrollRecord.periodEnd).toLocaleDateString('en-GB')}`);
      doc.text(`Status: ${payrollRecord.status.toUpperCase()}`);
      if (payrollRecord.paidAt) {
        doc.text(`Paid Date: ${new Date(payrollRecord.paidAt).toLocaleDateString('en-GB')}`);
      }
      doc.moveDown();

      // Employee details
      doc.fontSize(12).font('Helvetica-Bold').text('Employee Details:');
      doc.fontSize(10).font('Helvetica');
      doc.text(`${payrollRecord.user.firstName || ''} ${payrollRecord.user.lastName || ''}`.trim() || 'N/A');
      doc.text(payrollRecord.user.email);
      doc.text(`Company: ${payrollRecord.company.name}`);
      doc.moveDown();

      // Payment details
      doc.fontSize(12).font('Helvetica-Bold').text('Payment Details');
      doc.moveDown(0.5);
      
      doc.fontSize(10).font('Helvetica');
      doc.text(`Payment Type: ${payrollRecord.payrollType.toUpperCase()}`);
      
      if (payrollRecord.payrollType === 'fixed') {
        doc.text(`Fixed Salary: £${payrollRecord.fixedSalary?.toFixed(2) || '0.00'}`);
      } else {
        doc.text(`Hours Worked: ${payrollRecord.hoursWorked?.toFixed(2) || '0.00'} hours`);
        doc.text(`Hourly Rate: £${payrollRecord.hourlyRate?.toFixed(2) || '0.00'}/hour`);
      }
      
      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Total Amount:', 350);
      doc.text(`£${payrollRecord.totalAmount.toFixed(2)}`, 450);

      // Footer
      doc.moveDown(4);
      doc.fontSize(8).font('Helvetica').text('Thank you for your service!', { align: 'center' });
      doc.text('Generated by MayaOps', { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();
    });

    const checksum = await generateImmutableChecksum(pdfBuffer);
    
    // Upload with invoice-specific public ID
    const publicId = `mayaops/invoices/payroll-${payrollRecord.id}_${checksum.substring(0, 16)}`;
    const base64PDF = pdfBuffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${base64PDF}`;
    
    
    const { v2: cloudinary } = await import("cloudinary");
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      folder: 'mayaops/invoices',
      resource_type: 'raw',
      overwrite: false,
    });

    if (!uploadResult.secure_url) {
      throw new Error('Failed to upload invoice PDF to Cloudinary');
    }

    const filename = `payroll-${payrollRecord.id}.pdf`;
const disposition = `attachment; filename="${filename}"`;
const pdfUrl =
  uploadResult.secure_url +
  `?response-content-disposition=${encodeURIComponent(disposition)}`;

    return {
      success: true,
      pdfUrl:pdfUrl,
      pdfBuffer,
      checksum,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('Payroll invoice PDF generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      generatedAt: new Date(),
    };
  }
}

export async function generateImmutableChecksum(pdfBuffer: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
}
