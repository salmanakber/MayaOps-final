import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

// GET /api/user/preferences - Get user preferences
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const userId = auth.tokenUser.userId;
    
    // Get preferences from database
    let preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    // If no preferences exist, create defaults
    if (!preferences) {
      preferences = await prisma.userPreferences.create({
        data: {
          userId,
          pushNotifications: true,
          emailNotifications: true,
          soundEnabled: true,
          vibrationEnabled: true,
          darkMode: false,
          autoSync: true,
          locationTracking: true,
          biometricAuth: false,
        },
      });
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        preferences: {
          pushNotifications: preferences.pushNotifications,
          emailNotifications: preferences.emailNotifications,
          soundEnabled: preferences.soundEnabled,
          vibrationEnabled: preferences.vibrationEnabled,
          darkMode: preferences.darkMode,
          autoSync: preferences.autoSync,
          locationTracking: preferences.locationTracking,
          biometricAuth: preferences.biometricAuth,
        }
      } 
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/user/preferences - Update user preferences
export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const userId = auth.tokenUser.userId;
    const body = await request.json();
    const { preferences } = body;

    // Validate preferences object
    if (!preferences || typeof preferences !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid preferences data' }, { status: 400 });
    }

    // Upsert preferences (create if doesn't exist, update if exists)
    const updated = await prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        pushNotifications: preferences.pushNotifications ?? true,
        emailNotifications: preferences.emailNotifications ?? true,
        soundEnabled: preferences.soundEnabled ?? true,
        vibrationEnabled: preferences.vibrationEnabled ?? true,
        darkMode: preferences.darkMode ?? false,
        autoSync: preferences.autoSync ?? true,
        locationTracking: preferences.locationTracking ?? true,
        biometricAuth: preferences.biometricAuth ?? false,
      },
      update: {
        pushNotifications: preferences.pushNotifications,
        emailNotifications: preferences.emailNotifications,
        soundEnabled: preferences.soundEnabled,
        vibrationEnabled: preferences.vibrationEnabled,
        darkMode: preferences.darkMode,
        autoSync: preferences.autoSync,
        locationTracking: preferences.locationTracking,
        biometricAuth: preferences.biometricAuth,
      },
    });

    return NextResponse.json({ 
      success: true, 
      data: { 
        preferences: {
          pushNotifications: updated.pushNotifications,
          emailNotifications: updated.emailNotifications,
          soundEnabled: updated.soundEnabled,
          vibrationEnabled: updated.vibrationEnabled,
          darkMode: updated.darkMode,
          autoSync: updated.autoSync,
          locationTracking: updated.locationTracking,
          biometricAuth: updated.biometricAuth,
        }
      } 
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

