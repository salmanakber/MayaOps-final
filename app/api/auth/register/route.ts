import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, generateToken, isValidEmail, isValidPassword } from '@/lib/auth';
import { UserRole } from '@prisma/client';

/**
 * POST /api/auth/register
 * Register a new user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, firstName, lastName, companyName, role = 'OWNER' } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json({
        success: false,
        message: 'Email and password are required'
      }, { status: 400 });
    }

    // Company name is required for registration (no standalone users)
    if (!companyName || companyName.trim() === '') {
      return NextResponse.json({
        success: false,
        message: 'Company name is required for registration'
      }, { status: 400 });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid email format'
      }, { status: 400 });
    }

    // Validate password strength
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({
        success: false,
        message: passwordValidation.message
      }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return NextResponse.json({
        success: false,
        message: 'User with this email already exists'
      }, { status: 409 });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Validate role - new registrations should be OWNER (default) to manage their company
    const userRole = (role.toUpperCase() as UserRole) || UserRole.OWNER;
    if (!Object.values(UserRole).includes(userRole)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid role'
      }, { status: 400 });
    }

    // Create company first
    const company = await prisma.company.create({
      data: {
        name: companyName.trim(),
        subscriptionStatus: 'unpaid', // Start with trial status
        isTrialActive: false,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
      }
    });

    // Create new user with company
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role: userRole,
        companyId: company.id
      }
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
      message: 'User registered successfully',
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
    }, { status: 201 });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
