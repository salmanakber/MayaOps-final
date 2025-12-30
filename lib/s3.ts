import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'mayaops-storage';

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export async function uploadFile(
  file: Buffer,
  key: string,
  contentType: string = 'application/octet-stream',
  metadata?: Record<string, string>
): Promise<UploadResult> {
  try {
    const params: AWS.S3.PutObjectRequest = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
      Metadata: metadata,
    };

    const result = await s3.upload(params).promise();

    return {
      success: true,
      url: result.Location,
      key: result.Key,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

export async function uploadPhoto(
  photoBuffer: Buffer,
  taskId: number,
  userId: number,
  photoType: 'before' | 'after',
  timestamp: Date
): Promise<UploadResult> {
  const extension = 'jpg';
  const key = `photos/${taskId}/${photoType}/${userId}_${timestamp.getTime()}.${extension}`;

  return uploadFile(photoBuffer, key, 'image/jpeg', {
    taskId: taskId.toString(),
    userId: userId.toString(),
    photoType,
    uploadedAt: timestamp.toISOString(),
  });
}

export async function uploadPDF(
  pdfBuffer: Buffer,
  filename: string
): Promise<UploadResult> {
  const key = `pdfs/${filename}`;

  return uploadFile(pdfBuffer, key, 'application/pdf', {
    generatedAt: new Date().toISOString(),
  });
}

export async function deleteFile(key: string): Promise<boolean> {
  try {
    await s3.deleteObject({
      Bucket: BUCKET_NAME,
      Key: key,
    }).promise();

    return true;
  } catch (error) {
    console.error('S3 delete error:', error);
    return false;
  }
}

export async function getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const url = await s3.getSignedUrlPromise('getObject', {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: expiresIn,
    });

    return url;
  } catch (error) {
    console.error('S3 signed URL error:', error);
    throw error;
  }
}

export async function listFiles(prefix: string, maxKeys: number = 1000): Promise<AWS.S3.ObjectList> {
  try {
    const result = await s3.listObjectsV2({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxKeys,
    }).promise();

    return result.Contents || [];
  } catch (error) {
    console.error('S3 list error:', error);
    return [];
  }
}

export default s3;
