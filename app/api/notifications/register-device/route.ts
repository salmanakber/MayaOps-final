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

  let body: any = {};
  try {
    body = await request.json();
    const { expoPushToken, fcmToken, deviceId, platform } = body;
    const userId = auth.tokenUser.userId;

    // At least one token type must be provided
    if (!expoPushToken && !fcmToken) {
      return NextResponse.json({ success: false, message: 'expoPushToken or fcmToken is required' }, { status: 400 });
    }

    console.log('📱 Device registration request received');
    console.log('   - User ID:', userId);
    console.log('   - Expo Token:', expoPushToken ? expoPushToken.substring(0, 30) + '...' : 'none');
    console.log('   - FCM Token:', fcmToken ? fcmToken.substring(0, 30) + '...' : 'none');
    console.log('   - Device ID:', deviceId || 'none');
    console.log('   - Platform:', platform || 'unknown');

    // Validate Expo push token format if provided
    if (expoPushToken) {
      const { Expo } = require('expo-server-sdk');
      if (!Expo.isExpoPushToken(expoPushToken)) {
        return NextResponse.json({ success: false, message: 'Invalid Expo push token format' }, { status: 400 });
      }
    }

    // Validate FCM token format if provided (basic check - FCM tokens are typically long strings)
    if (fcmToken && (typeof fcmToken !== 'string' || fcmToken.length < 10)) {
      return NextResponse.json({ success: false, message: 'Invalid FCM token format' }, { status: 400 });
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

    // Check if this exact token exists for this user (check both Expo and FCM)
    let existingToken = null;
    
    if (expoPushToken) {
      try {
        existingToken = await prisma.deviceToken.findFirst({
          where: {
            userId,
            expoPushToken,
          },
        });
      } catch (error) {
        console.log('Error finding existing Expo token:', error);
      }
    }
    
    if (!existingToken && fcmToken) {
      try {
        existingToken = await prisma.deviceToken.findFirst({
          where: {
            userId,
            fcmToken: fcmToken as any, // Type assertion needed until Prisma client is regenerated
          },
        });
      } catch (error) {
        console.log('Error finding existing FCM token:', error);
      }
    }

    // If no exact match, try to find by deviceId and platform
    if (!existingToken && deviceId) {
      existingToken = await prisma.deviceToken.findFirst({
        where: {
          userId,
          deviceId,
          platform,
        },
      });
    }

    let deviceToken;
    if (existingToken) {
      // Token exists - reactivate it and update metadata
      deviceToken = await prisma.deviceToken.update({
        where: {
          id: existingToken.id,
        },
        data: {
          isActive: true,
          expoPushToken: expoPushToken || existingToken.expoPushToken,
          fcmToken: (fcmToken || existingToken.fcmToken) as any, // Type assertion needed until Prisma client is regenerated
          deviceId: deviceId || existingToken.deviceId || undefined,
          platform: platform || existingToken.platform || undefined,
          updatedAt: new Date(),
        },
      });
      console.log(`✅ Existing device token reactivated for user ${userId}`);
    } else {
      // Token doesn't exist - create new one
      deviceToken = await prisma.deviceToken.create({
        data: {
          userId,
          expoPushToken: expoPushToken || null,
          fcmToken: (fcmToken || null) as any, // Type assertion needed until Prisma client is regenerated
          deviceId: deviceId || null,
          platform: platform || null,
          isActive: true,
        },
      });
      console.log(`✅ New device token created for user ${userId}`);
    }

    const tokenDisplay = body.expoPushToken 
      ? `Expo: ${body.expoPushToken.substring(0, 30)}...` 
      : body.fcmToken 
        ? `FCM: ${body.fcmToken.substring(0, 30)}...` 
        : 'No token';
    console.log(`✅ Device token registered/updated for user ${userId}: ${tokenDisplay} (Platform: ${platform || 'unknown'}, Device: ${deviceId || 'unknown'})`);
    console.log(`📊 Device token ID: ${deviceToken.id}, Active: ${deviceToken.isActive}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Device registered successfully',
      data: { tokenId: deviceToken.id }
    });
  } catch (error: any) {
    console.error('❌ Device registration error:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    console.error('   User ID:', auth?.tokenUser?.userId);
    console.error('   Request body:', { expoPushToken: body.expoPushToken ? 'provided' : 'missing', fcmToken: body.fcmToken ? 'provided' : 'missing' });
    
    // Provide more specific error messages
    if (error.message?.includes('Unique constraint')) {
      return NextResponse.json({ 
        success: false, 
        message: 'Device token already exists for this user' 
      }, { status: 409 });
    }
    
    if (error.message?.includes('Foreign key constraint')) {
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid user ID' 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

