import { NextRequest, NextResponse } from 'next/server';
import { generateOTP, storeOTP } from '@/lib/otp';
import { sendOTP } from '@/lib/sms';
import { sendEmail } from '@/lib/email';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, email, method } = body;

    if (!phoneNumber && !email) {
      return NextResponse.json(
        { success: false, message: 'Phone number or email required' },
        { status: 400 }
      );
    }

    // Check if user exists (currently only by email, phoneNumber not in User model)
    const user = await prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    const otp = generateOTP();
    const identifier = phoneNumber || email;
    
    // Check rate limiting (max 5 OTPs per hour per identifier)
    const { getOTPStats } = await import('@/lib/otp');
    const stats = await getOTPStats(identifier, 60);
    if (stats.count >= 5) {
      return NextResponse.json(
        { success: false, message: 'Too many OTP requests. Please try again later.' },
        { status: 429 }
      );
    }
    
    await storeOTP(identifier, otp);

    // Send OTP via SMS or Email
    if (method === 'sms' && phoneNumber) {
      await sendOTP(phoneNumber, otp);
    } else if (method === 'email' && email) {
      await sendEmail({
        to: email,
        subject: 'MayaOps - Verification Code',
        html: `
          <h2>Your Verification Code</h2>
          <p>Your MayaOps verification code is:</p>
          <h1 style="color: #3B82F6; font-size: 32px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
        `,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
