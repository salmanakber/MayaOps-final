import crypto from 'crypto';
import prisma from './prisma';

export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Store OTP in database
 */
export async function storeOTP(
  identifier: string,
  otp: string,
  expiryMinutes: number = 10
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

  // Invalidate any existing unused OTPs for this identifier
  await prisma.oTP.updateMany({
    where: {
      identifier,
      isUsed: false,
    },
    data: {
      isUsed: true,
    },
  });

  // Store new OTP
  await prisma.oTP.create({
    data: {
      identifier,
      otp,
      expiresAt,
      isUsed: false,
      attempts: 0,
    },
  });
}

/**
 * Verify OTP from database
 */
export async function verifyOTP(identifier: string, otp: string): Promise<boolean> {
  try {
    // Find the most recent unused OTP for this identifier
    const storedOTP = await prisma.oTP.findFirst({
      where: {
        identifier,
        isUsed: false,
        expiresAt: {
          gt: new Date(), // Not expired
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!storedOTP) {
      return false;
    }

    // Increment attempts
    await prisma.oTP.update({
      where: { id: storedOTP.id },
      data: { attempts: storedOTP.attempts + 1 },
    });

    // Check if OTP matches
    if (storedOTP.otp !== otp) {
      // Mark as used after max attempts (security measure)
      if (storedOTP.attempts + 1 >= 5) {
        await prisma.oTP.update({
          where: { id: storedOTP.id },
          data: { isUsed: true },
        });
      }
      return false;
    }

    // Mark OTP as used
    await prisma.oTP.update({
      where: { id: storedOTP.id },
      data: {
        isUsed: true,
        usedAt: new Date(),
      },
    });

    return true;
  } catch (error) {
    console.error('OTP verification error:', error);
    return false;
  }
}

/**
 * Clean expired OTPs from database
 */
export async function cleanExpiredOTPs(): Promise<void> {
  try {
    await prisma.oTP.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  } catch (error) {
    console.error('Error cleaning expired OTPs:', error);
  }
}

/**
 * Get OTP statistics for an identifier (for rate limiting)
 */
export async function getOTPStats(identifier: string, minutes: number = 60): Promise<{
  count: number;
  recentAttempts: number;
}> {
  const since = new Date();
  since.setMinutes(since.getMinutes() - minutes);

  const [count, recentAttempts] = await Promise.all([
    prisma.oTP.count({
      where: {
        identifier,
        createdAt: {
          gte: since,
        },
      },
    }),
    prisma.oTP.aggregate({
      where: {
        identifier,
        createdAt: {
          gte: since,
        },
      },
      _sum: {
        attempts: true,
      },
    }),
  ]);

  return {
    count,
    recentAttempts: recentAttempts._sum.attempts || 0,
  };
}
