import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, canAccessCompany } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/companies
// List companies (Owner/Developer see all; others see only their own company)
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    if (role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      const companies = await prisma.company.findMany({
        orderBy: { id: 'asc' },
      });
      return NextResponse.json({ success: true, data: { companies } });
    }

    if (!tokenUser.companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({ where: { id: tokenUser.companyId } });
    return NextResponse.json({ success: true, data: { companies: company ? [company] : [] } });
  } catch (error) {
    console.error('Companies GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/companies
// Create a company (Owner/Developer only)
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { tokenUser } = auth;

  if (!requireRole(tokenUser, UserRole.DEVELOPER)) {
    // Developer and Owner are above or equal to DEVELOPER in our hierarchy
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, basePrice = 55.0 } = body;

    if (!name) {
      return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
    }

    const company = await prisma.company.create({
      data: {
        name,
        basePrice,
      },
    });

    return NextResponse.json({ success: true, data: { company } }, { status: 201 });
  } catch (error) {
    console.error('Companies POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
