import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyOTP } from '@/lib/otp';

// POST /api/account-deletion/request
// Public endpoint: verify OTP for the given email and create / refresh a 15‑day account deletion request.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body || {};

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, message: 'Email and verification code are required.' },
        { status: 400 }
      );
    }

    const trimmedEmail = String(email).trim().toLowerCase();

    // 1) Verify OTP for this email (identifier = email)
    const isValid = await verifyOTP(trimmedEmail, String(otp).trim());
    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired verification code.' },
        { status: 401 }
      );
    }

    // 2) Find user by email
    const user = await prisma.user.findFirst({
      where: { email: trimmedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'We could not find an account with this email address.' },
        { status: 404 }
      );
    }

    // 3) Compute scheduled deletion date (15 days from now)
    const requestedAt = new Date();
    const scheduledDeletionAt = new Date(requestedAt.getTime() + 15 * 24 * 60 * 60 * 1000);

    // 4) Create or refresh existing pending request
    const existing = await prisma.accountDeletionRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
    });

    let deletionRequest;
    if (existing) {
      deletionRequest = await prisma.accountDeletionRequest.update({
        where: { id: existing.id },
        data: {
          email: trimmedEmail,
          requestedAt,
          scheduledDeletionAt,
        },
      });
    } else {
      deletionRequest = await prisma.accountDeletionRequest.create({
        data: {
          userId: user.id,
          email: trimmedEmail,
          requestedAt,
          scheduledDeletionAt,
          status: 'pending',
        },
      });
    }

    return NextResponse.json({
      success: true,
      message:
        'Your account deletion request has been received. Your account is scheduled for deletion in 15 days.',
      data: {
        scheduledDeletionAt: deletionRequest.scheduledDeletionAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Account deletion request error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

