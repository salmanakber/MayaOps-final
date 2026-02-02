import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import crypto from 'crypto';

// Encryption key from environment
const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'default-key-change-in-production';
const ALGORITHM = 'aes-256-cbc';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// GET /api/admin/settings/[key] - Get a specific setting
export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only SUPER_ADMIN and DEVELOPER can access settings
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.ADMIN_UNIQUE && role !== UserRole.DEVELOPER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: params.key },
      include: {
        updatedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!setting) {
      return NextResponse.json(
        { success: false, message: 'Setting not found' },
        { status: 404 }
      );
    }

    // Decrypt if needed
    const decryptedSetting = {
      ...setting,
      value: setting.isEncrypted ? decrypt(setting.value) : setting.value,
    };

    return NextResponse.json({
      success: true,
      data: { setting: decryptedSetting },
    });
  } catch (error: any) {
    console.error('Setting GET error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch setting' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/settings/[key] - Update a specific setting
export async function PATCH(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  console.log('tokenUser', tokenUser);

  // Only SUPER_ADMIN and DEVELOPER can modify settings
  if (tokenUser.role !== 'SUPER_ADMIN' && tokenUser.role !== 'ADMIN_UNIQUE' && tokenUser.role !== 'DEVELOPER') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { value, description, isEncrypted } = body;

    if (value === undefined) {
      return NextResponse.json(
        { success: false, message: 'value is required' },
        { status: 400 }
      );
    }

    // Get existing setting to check if encryption status changed
    const existing = await prisma.systemSetting.findUnique({
      where: { key: params.key as string },
    });

    // Encrypt value if needed
    const finalValue = isEncrypted !== undefined && isEncrypted ? encrypt(value) : 
                      existing?.isEncrypted ? encrypt(value) : value;

    const setting = await prisma.systemSetting.update({
      where: { key: params.key },
      data: {
        value: finalValue,
        description,
        isEncrypted: isEncrypted !== undefined ? isEncrypted : existing?.isEncrypted || false,
        updatedBy: tokenUser.userId,
        updatedAt: new Date(),
      },
      include: {
        updatedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Decrypt for response if needed
    const decryptedSetting = {
      ...setting,
      value: setting.isEncrypted ? decrypt(setting.value) : setting.value,
    };

    return NextResponse.json({
      success: true,
      data: { setting: decryptedSetting },
    });
  } catch (error: any) {
    console.error('Setting PATCH error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update setting' },
      { status: 500 }
    );
  }
}

