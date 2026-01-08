import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Helper function to decrypt encrypted settings
function decrypt(encryptedText: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-that-should-be-changed-in-production-32-char', 'utf8');
  const iv = Buffer.from(encryptedText.substring(0, 32), 'hex');
  const encrypted = encryptedText.substring(32);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// GET /api/stripe/publishable-key - Get Stripe publishable key from SystemSetting with env fallback
export async function GET(request: NextRequest) {
  try {
    // Try to get from SystemSetting first
    let publishableKey: string | null = null;
    
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'stripe_publishable_key' },
      });

      if (setting) {
        publishableKey = setting.isEncrypted 
          ? decrypt(setting.value) 
          : setting.value;
      }
    } catch (error) {
      console.warn('Failed to fetch Stripe publishable key from settings:', error);
    }

    // Fallback to environment variables if not in settings
    if (!publishableKey) {
      publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY 
        || process.env.STRIPE_PUBLISHABLE_KEY 
        || null;
    }
    
    if (!publishableKey) {
      return NextResponse.json({ 
        success: false, 
        message: 'Stripe publishable key not configured. Please configure it in Admin Settings.' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        publishableKey,
      },
    });
  } catch (error: any) {
    console.error('Error fetching Stripe publishable key:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to fetch publishable key' 
    }, { status: 500 });
  }
}

