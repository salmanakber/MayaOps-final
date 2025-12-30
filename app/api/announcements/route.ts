import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const companyId = tokenUser.companyId;
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const announcements = await prisma.announcement.findMany({
      where: {
        companyId,
        OR: [
          { targetRole: null },
          { targetRole: role },
        ],
      },
      include: {
        creator: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ success: true, data: announcements });
  } catch (error) {
    console.error('Announcements GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, message, targetRole } = body;

    const companyId = tokenUser.companyId;
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const announcement = await prisma.announcement.create({
      data: {
        companyId,
        title,
        message,
        targetRole: targetRole || null,
        createdBy: tokenUser.userId,
      },
    });

    return NextResponse.json({ success: true, data: announcement }, { status: 201 });
  } catch (error) {
    console.error('Announcements POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
