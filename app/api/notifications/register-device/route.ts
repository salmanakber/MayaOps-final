import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

/**
 * POST /api/notifications/register-device
 * Register device push token for push notifications
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { expoPushToken, deviceId, platform } = body;
    const userId = auth.tokenUser.userId;

    if (!expoPushToken) {
      return NextResponse.json({ success: false, message: 'expoPushToken is required' }, { status: 400 });
    }

    console.log('expoPushToken', expoPushToken);
    console.log('deviceId', deviceId);
    console.log('platform', platform);
    console.log('userId', userId);

    // Validate Expo push token format
    const { Expo } = require('expo-server-sdk');
    if (!Expo.isExpoPushToken(expoPushToken)) {
      return NextResponse.json({ success: false, message: 'Invalid Expo push token format' }, { status: 400 });
    }

    // First, deactivate tokens older than 3 days for this user
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    await prisma.deviceToken.updateMany({
      where: {
        userId,
        updatedAt: {
          lt: threeDaysAgo,
        },
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    // Check if this exact token exists for this user
    const existingToken = await prisma.deviceToken.findUnique({
      where: {
        userId_expoPushToken: {
          userId,
          expoPushToken,
        },
      },
    });

    let deviceToken;
    if (existingToken) {
      // Token exists - reactivate it and update metadata
      deviceToken = await prisma.deviceToken.update({
        where: {
          id: existingToken.id,
        },
        data: {
          isActive: true,
          deviceId: deviceId || undefined,
          platform: platform || undefined,
          updatedAt: new Date(),
        },
      });
      console.log(`✅ Existing device token reactivated for user ${userId}`);
    } else {
      // Token doesn't exist - create new one
      deviceToken = await prisma.deviceToken.create({
        data: {
          userId,
          expoPushToken,
          deviceId: deviceId || null,
          platform: platform || null,
          isActive: true,
        },
      });
      console.log(`✅ New device token created for user ${userId}`);
    }

    console.log(`✅ Device token registered/updated for user ${userId}: ${expoPushToken.substring(0, 30)}... (Platform: ${platform || 'unknown'}, Device: ${deviceId || 'unknown'})`);
    console.log(`📊 Device token ID: ${deviceToken.id}, Active: ${deviceToken.isActive}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Device registered successfully',
      data: { tokenId: deviceToken.id }
    });
  } catch (error) {
    console.error('Device registration error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

