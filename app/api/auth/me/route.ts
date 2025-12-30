import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getUserFromRequest, hashPassword, comparePassword } from '../../../../lib/auth';

/**
 * GET /api/auth/me
 * Get current user profile
 */
export async function GET(request: NextRequest) {
  try {
    // Get user from token
    const tokenUser = getUserFromRequest(request);
    if (!tokenUser) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized - Invalid or missing token'
      }, { status: 401 });
    }

    // Fetch user details from database
    const user = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profileImage: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true
      }
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'User not found'
      }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({
        success: false,
        message: 'Account is disabled'
      }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          profileImage: user.profileImage,
          role: user.role,
          companyId: user.companyId,
          createdAt: user.createdAt
        }
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * PATCH /api/auth/me
 * Update current user profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const tokenUser = getUserFromRequest(request);
    if (!tokenUser) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized - Invalid or missing token'
      }, { status: 401 });
    }

    const body = await request.json();
    const { firstName, lastName, phone, currentPassword, newPassword, profileImage } = body;

    const updateData: any = {};

    if (firstName !== undefined && firstName !== null) updateData.firstName = firstName.trim();
    if (lastName !== undefined && lastName !== null) updateData.lastName = lastName.trim();
    if (phone !== undefined) {
      // Allow empty string to clear phone number
      updateData.phone = phone === '' ? null : (phone ? phone.trim() : null);
    }
    if (profileImage !== undefined) updateData.profileImage = profileImage || null;

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({
          success: false,
          message: 'Current password is required to change password'
        }, { status: 400 });
      }

      // Get current user to verify password
      const user = await prisma.user.findUnique({
        where: { id: tokenUser.userId },
        select: { passwordHash: true },
      });

      if (!user) {
        return NextResponse.json({
          success: false,
          message: 'User not found'
        }, { status: 404 });
      }

      // Verify current password
      const isPasswordValid = await comparePassword(currentPassword, user.passwordHash);
      if (!isPasswordValid) {
        return NextResponse.json({
          success: false,
          message: 'Current password is incorrect'
        }, { status: 401 });
      }

      // Hash new password
      updateData.passwordHash = await hashPassword(newPassword);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: tokenUser.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        companyId: true,
        profileImage: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { user: updatedUser }
    }, { status: 200 });

  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
