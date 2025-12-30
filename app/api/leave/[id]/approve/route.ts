import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { approved } = body;

    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: Number(params.id) },
      data: {
        status: approved ? 'approved' : 'rejected',
        approvedBy: tokenUser.userId,
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: leaveRequest });
  } catch (error) {
    console.error('Leave approval error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
