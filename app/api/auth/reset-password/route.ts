import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, isValidPassword } from '@/lib/auth';
import { verifyOTP } from '@/lib/otp';

/**
 * POST /api/auth/reset-password
 * Reset password using OTP from email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { otp, email, password } = body;

    if (!otp || !email || !password) {
      return NextResponse.json({
        success: false,
        message: 'OTP, email, and new password are required'
      }, { status: 400 });
    }

    // Validate password strength
    const pwdCheck = isValidPassword(password);
    if (!pwdCheck.valid) {
      return NextResponse.json({
        success: false,
        message: pwdCheck.message || 'Weak password'
      }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Invalid OTP or email'
      }, { status: 400 });
    }

    // Verify OTP for password reset
    const otpIdentifier = `password_reset_${email.toLowerCase()}`;
    const isOTPValid = await verifyOTP(otpIdentifier, otp);

    if (!isOTPValid) {
      return NextResponse.json({
        success: false,
        message: 'Invalid or expired OTP. Please request a new one.'
      }, { status: 400 });
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        updatedAt: new Date()
      }
    });

    console.log(`Password reset successful for user ${user.email}`);

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error: any) {
    console.error('Reset password error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}

