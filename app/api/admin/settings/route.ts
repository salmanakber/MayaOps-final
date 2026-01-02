import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import crypto from 'crypto';

// Encryption key from environment (should be set in production)
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

// GET /api/admin/settings - Get all settings or filter by category
export async function GET(request: NextRequest) {

    

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
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const where: any = {};
    if (category) {
      where.category = category;
    }

    const settings = await prisma.systemSetting.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { key: 'asc' },
      ],
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

    // Decrypt sensitive values
    const decryptedSettings = settings.map(setting => ({
      ...setting,
      value: setting.isEncrypted ? decrypt(setting.value) : setting.value,
    }));

    return NextResponse.json({
      success: true,
      data: { settings: decryptedSettings },
    });
  } catch (error: any) {
    console.error('Settings GET error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// POST /api/admin/settings - Create or update a setting
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;

  // Only SUPER_ADMIN and DEVELOPER can modify settings
  if (tokenUser.role !== 'SUPER_ADMIN' && tokenUser.role !== 'ADMIN_UNIQUE' && tokenUser.role !== 'DEVELOPER') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { key, value, category, description, isEncrypted } = body;

    if (!key || value === undefined || !category) {
      return NextResponse.json(
        { success: false, message: 'key, value, and category are required' },
        { status: 400 }
      );
    }

    // Encrypt value if needed
    const finalValue = isEncrypted ? encrypt(value) : value;

    // Upsert setting
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: finalValue,
        category,
        description,
        isEncrypted: isEncrypted || false,
        updatedBy: tokenUser.userId,
        updatedAt: new Date(),
      },
      create: {
        key,
        value: finalValue,
        category,
        description,
        isEncrypted: isEncrypted || false,
        updatedBy: tokenUser.userId,
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
    console.error('Settings POST error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save setting' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/settings - Delete a setting
export async function DELETE(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;

  // Only SUPER_ADMIN and DEVELOPER can delete settings
  if (tokenUser.role !== 'SUPER_ADMIN' && tokenUser.role !== 'ADMIN_UNIQUE' && tokenUser.role !== 'DEVELOPER') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { success: false, message: 'key parameter is required' },
        { status: 400 }
      );
    }

    await prisma.systemSetting.delete({
      where: { key },
    });

    return NextResponse.json({
      success: true,
      message: 'Setting deleted successfully',
    });
  } catch (error: any) {
    console.error('Settings DELETE error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete setting' },
      { status: 500 }
    );
  }
}

