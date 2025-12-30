import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { comparePassword, generateToken, isValidEmail } from '../../../../lib/auth';
import { generateOTP, storeOTP, verifyOTP, getOTPStats } from '../../../../lib/otp';
import { sendEmail } from '../../../../lib/email';
import { UserRole } from '@prisma/client';

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 * On first-time login, requires OTP verification
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, otp } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json({
        success: false,
        message: 'Email and password are required'
      }, { status: 400 });
    }

    // Validate email format
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

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Invalid email or password'
      }, { status: 401 });
    }

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json({
        success: false,
        message: 'Account is disabled. Please contact support.'
      }, { status: 403 });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json({
        success: false,
        message: 'Invalid email or password'
      }, { status: 401 });
    }

    // Skip OTP verification for SUPER_ADMIN and ADMIN_UNIQUE roles
    const shouldSkipOTP = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN_UNIQUE;

    // Check if this is first-time login (check OTP verification cache)
    // Only check if OTP is not skipped for this role
    let isOTPVerified = shouldSkipOTP;
    const otpCacheKey = `otp_verified_${user.id}`;
    
    if (!shouldSkipOTP) {
      const otpCache = await prisma.systemSetting.findUnique({
        where: { key: otpCacheKey }
      });

      if (otpCache) {
        try {
          const cacheData = JSON.parse(otpCache.value);
          const cacheExpiry = new Date(cacheData.expiry);
          if (new Date() < cacheExpiry) {
            isOTPVerified = true;
          } else {
            // Cache expired, delete it
            await prisma.systemSetting.delete({ where: { key: otpCacheKey } });
          }
        } catch (e) {
          // Invalid cache data, treat as not verified
        }
      }
    }

    // If OTP not verified and not skipped, require OTP
    if (!isOTPVerified && !shouldSkipOTP) {
      if (!otp) {
        // Generate and send OTP for first-time login
        // Check rate limiting
        const stats = await getOTPStats(email.toLowerCase(), 60);
        if (stats.count >= 5) {
          return NextResponse.json({
            success: false,
            message: 'Too many OTP requests. Please try again later.'
          }, { status: 429 });
        }

        const loginOTP = generateOTP();
        await storeOTP(`login_${email.toLowerCase()}`, loginOTP, 10);

        // Send OTP email
        const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email;
        await sendEmail({
          to: user.email,
          subject: 'MayaOps - Login Verification Code',
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
                    <h1>Login Verification</h1>
                  </div>
                  <div class="content">
                    <p>Hi ${userName},</p>
                    <p>Please use the OTP code below to complete your login:</p>
                    <div class="otp-box">
                      <div class="otp-code">${loginOTP}</div>
                    </div>
                    <p><strong>This OTP will expire in 10 minutes.</strong></p>
                    <p>If you didn't attempt to login, please ignore this email and contact support.</p>
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

        console.log(`Login OTP sent to ${user.email}`);

        return NextResponse.json({
          success: false,
          message: 'OTP required for login',
          requiresOTP: true,
          data: {
            email: user.email
          }
        }, { status: 200 });
      }

      // Verify OTP
      const otpIdentifier = `login_${email.toLowerCase()}`;
      const isOTPValid = await verifyOTP(otpIdentifier, otp);

      if (!isOTPValid) {
        return NextResponse.json({
          success: false,
          message: 'Invalid or expired OTP. Please try again.',
          requiresOTP: true
        }, { status: 401 });
      }

      // OTP verified - cache for 15 days
      const cacheExpiry = new Date();
      cacheExpiry.setDate(cacheExpiry.getDate() + 15);

      await prisma.systemSetting.upsert({
        where: { key: otpCacheKey },
        update: {
          value: JSON.stringify({
            verified: true,
            expiry: cacheExpiry.toISOString(),
            email: user.email
          }),
          category: 'otp_cache',
          updatedAt: new Date()
        },
        create: {
          category: 'otp_cache',
          key: otpCacheKey,
          value: JSON.stringify({
            verified: true,
            expiry: cacheExpiry.toISOString(),
            email: user.email
          }),
          isEncrypted: false
        }
      });

      console.log(`OTP verified and cached for 15 days for user ${user.email}`);
    }

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() }
    });

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId || undefined
    });

    return NextResponse.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId
        }
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
