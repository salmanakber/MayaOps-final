/**
 * EXIF data extraction utilities
 * Production-ready implementation using the exifr library
 */

import exifr from 'exifr';

/**
 * Type definitions for EXIF timestamp fields
 */
interface ExifTimestampFields {
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
  ModifyDate?: Date | string;
  DateTime?: Date | string;
}

/**
 * Type definitions for full EXIF data
 */
export interface ExifData {
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
  ModifyDate?: Date | string;
  DateTime?: Date | string;
  GPSLatitude?: number;
  GPSLongitude?: number;
  GPSAltitude?: number;
  Make?: string;
  Model?: string;
  Orientation?: number;
  Width?: number;
  Height?: number;
  XResolution?: number;
  YResolution?: number;
  ISO?: number;
  ExposureTime?: number | string;
  FNumber?: number;
  FocalLength?: number;
  Flash?: number;
  Software?: string;
  Artist?: string;
  Copyright?: string;
  [key: string]: any;
}

/**
 * Validates if a buffer contains image data
 */
function isValidImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  // Check for common image format signatures
  const signatures = [
    [0xFF, 0xD8, 0xFF], // JPEG
    [0x89, 0x50, 0x4E, 0x47], // PNG
    [0x47, 0x49, 0x46, 0x38], // GIF
    [0x42, 0x4D], // BMP
    [0x52, 0x49, 0x46, 0x46], // WebP (RIFF)
  ];

  return signatures.some(sig => 
    sig.every((byte, index) => buffer[index] === byte)
  );
}

/**
 * Normalizes a date value to a Date object
 * Handles both Date objects and string formats
 */
function normalizeDate(dateValue: Date | string | undefined): Date | null {
  if (!dateValue) {
    return null;
  }

  try {
    if (dateValue instanceof Date) {
      // Validate the date
      if (isNaN(dateValue.getTime())) {
        return null;
      }
      return dateValue;
    }

    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    }

    return null;
  } catch (error) {
    console.error('Error normalizing date:', error);
    return null;
  }
}

/**
 * Extracts the best available timestamp from EXIF data
 * Priority: DateTimeOriginal > CreateDate > ModifyDate > DateTime
 */
function extractBestTimestamp(exifData: ExifTimestampFields | null): Date | null {
  if (!exifData) {
    return null;
  }

  // Try dates in order of preference
  const dateFields = [
    exifData.DateTimeOriginal,
    exifData.CreateDate,
    exifData.ModifyDate,
    exifData.DateTime,
  ];

  for (const dateField of dateFields) {
    const normalized = normalizeDate(dateField);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/**
 * Extracts EXIF timestamp from image buffer
 * Returns the best available timestamp or null if not found
 * 
 * @param imageBuffer - Buffer containing image data
 * @returns Date object representing the image timestamp, or null if not available
 */
export async function extractExifTimestamp(imageBuffer: Buffer): Promise<Date | null> {
  // Input validation
  if (!Buffer.isBuffer(imageBuffer)) {
    console.error('extractExifTimestamp: Invalid input - expected Buffer');
    return null;
  }

  if (!isValidImageBuffer(imageBuffer)) {
    console.warn('extractExifTimestamp: Buffer does not appear to be a valid image');
    return null;
  }

  try {
    // Parse only timestamp-related fields for better performance
    const exifData = await exifr.parse(imageBuffer, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'DateTime'],
      translateKeys: false,
      translateValues: false,
      reviveValues: true,
      sanitize: true,
    }) as ExifTimestampFields | null;

    return extractBestTimestamp(exifData);
  } catch (error) {
    // Log error for debugging but don't throw - return null gracefully
    console.error('Error extracting EXIF timestamp:', error);
    return null;
  }
}

/**
 * Extracts full EXIF data from image buffer
 * Returns all available EXIF metadata
 * 
 * @param imageBuffer - Buffer containing image data
 * @param options - Optional parsing options
 * @returns Object containing EXIF data, or null if not available
 */
export async function extractExifData(
  imageBuffer: Buffer,
  options?: {
    pick?: string[];
    translateKeys?: boolean;
    translateValues?: boolean;
  }
): Promise<ExifData | null> {
  // Input validation
  if (!Buffer.isBuffer(imageBuffer)) {
    console.error('extractExifData: Invalid input - expected Buffer');
    return null;
  }

  if (!isValidImageBuffer(imageBuffer)) {
    console.warn('extractExifData: Buffer does not appear to be a valid image');
    return null;
  }

  try {
    const parseOptions = {
      translateKeys: options?.translateKeys ?? false,
      translateValues: options?.translateValues ?? false,
      reviveValues: true,
      sanitize: true,
      ...(options?.pick && { pick: options.pick }),
    };

    const exifData = await exifr.parse(imageBuffer, parseOptions) as ExifData | null;
    
    return exifData || null;
  } catch (error) {
    // Log error for debugging but don't throw - return null gracefully
    console.error('Error extracting EXIF data:', error);
    return null;
  }
}

/**
 * Extracts GPS coordinates from EXIF data
 * 
 * @param imageBuffer - Buffer containing image data
 * @returns Object with latitude and longitude, or null if not available
 */
export async function extractGPSCoordinates(
  imageBuffer: Buffer
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const exifData = await extractExifData(imageBuffer, {
      pick: ['GPSLatitude', 'GPSLongitude'],
    });

    if (!exifData) {
      return null;
    }

    const { GPSLatitude, GPSLongitude } = exifData;

    if (
      typeof GPSLatitude === 'number' &&
      typeof GPSLongitude === 'number' &&
      !isNaN(GPSLatitude) &&
      !isNaN(GPSLongitude)
    ) {
      // Validate GPS coordinates are in valid ranges
      if (GPSLatitude >= -90 && GPSLatitude <= 90 && GPSLongitude >= -180 && GPSLongitude <= 180) {
        return {
          latitude: GPSLatitude,
          longitude: GPSLongitude,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting GPS coordinates:', error);
    return null;
  }
}

/**
 * Extracts camera information from EXIF data
 * 
 * @param imageBuffer - Buffer containing image data
 * @returns Object with camera make, model, and other camera settings, or null if not available
 */
export async function extractCameraInfo(imageBuffer: Buffer): Promise<{
  make?: string;
  model?: string;
  iso?: number;
  exposureTime?: number | string;
  fNumber?: number;
  focalLength?: number;
  flash?: number;
} | null> {
  try {
    const exifData = await extractExifData(imageBuffer, {
      pick: ['Make', 'Model', 'ISO', 'ExposureTime', 'FNumber', 'FocalLength', 'Flash'],
    });

    if (!exifData) {
      return null;
    }

    return {
      make: exifData.Make,
      model: exifData.Model,
      iso: exifData.ISO,
      exposureTime: exifData.ExposureTime,
      fNumber: exifData.FNumber,
      focalLength: exifData.FocalLength,
      flash: exifData.Flash,
    };
  } catch (error) {
    console.error('Error extracting camera info:', error);
    return null;
  }
}
