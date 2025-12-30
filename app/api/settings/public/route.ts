import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/settings/public - Get public settings (for mobile app)
// This endpoint doesn't require authentication but only returns non-sensitive settings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keys = searchParams.get('keys'); // Comma-separated list of keys

    const where: any = {
      isEncrypted: false, // Only return non-encrypted settings
    };

    if (keys) {
      const keyArray = keys.split(',').map(k => k.trim());
      where.key = { in: keyArray };
    }

    

    const settings = await prisma.systemSetting.findMany({
      where,
      select: {
        key: true,
        value: true,
        category: true,
      },
    });

    // Convert to key-value object for easier consumption
    const settingsObject: Record<string, string> = {};
    settings.forEach(setting => {
      settingsObject[setting.key] = setting.value;
    });


    return NextResponse.json({
      success: true,
      data: { settings: settingsObject },
    });
  } catch (error: any) {
    console.error('Public settings GET error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

