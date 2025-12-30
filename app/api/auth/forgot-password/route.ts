import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isValidEmail } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { generateOTP, storeOTP, getOTPStats } from '@/lib/otp';

/**
 * POST /api/auth/forgot-password
 * Request password reset - sends OTP to user's email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({
        success: false,
        message: 'Email is required'
      }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid email format'
      }, { status: 400 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Always return success message to prevent email enumeration
    // But only send email if user exists
    if (user) {
      // Check rate limiting (max 5 OTPs per hour per email)
      const stats = await getOTPStats(email.toLowerCase(), 60);
      if (stats.count >= 5) {
        return NextResponse.json({
          success: false,
          message: 'Too many password reset requests. Please try again later.'
        }, { status: 429 });
      }

      // Generate OTP
      const otp = generateOTP();
      
      // Store OTP for password reset (10 minutes expiry)
      await storeOTP(`password_reset_${email.toLowerCase()}`, otp, 10);

      // Send OTP email
      const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email;
      await sendEmail({
        to: user.email,
        subject: 'MayaOps - Password Reset OTP',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #031a3d; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .otp-box { background-color: #e5e7eb; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
                .otp-code { font-size: 32px; font-weight: bold; color: #031a3d; letter-spacing: 8px; font-family: monospace; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Password Reset OTP</h1>
                </div>
                <div class="content">
                  <p>Hi ${userName},</p>
                  <p>We received a request to reset your password for your MayaOps account.</p>
                  <p>Use the OTP code below to reset your password:</p>
                  <div class="otp-box">
                    <div class="otp-code">${otp}</div>
                  </div>
                  <p><strong>This OTP will expire in 10 minutes.</strong></p>
                  <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
                </div>
                <div class="footer">
                  <p>© 2025 MayaOps. All rights reserved.</p>
                  <p>This is an automated email, please do not reply.</p>
                </div>
              </div>
            </body>
          </html>
        `
      });

      console.log(`Password reset OTP sent to ${user.email}`);
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: 'If an account exists with that email, a password reset OTP has been sent.',
      data: {
        requiresOTP: true,
        email: email.toLowerCase()
      }
    });

  } catch (error: any) {
    console.error('Forgot password error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}

