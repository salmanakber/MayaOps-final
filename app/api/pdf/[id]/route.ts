import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// DELETE /api/pdf/[id] - Delete a PDF record
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid PDF ID' }, { status: 400 });
    }

    // Fetch PDF record with task info for authorization
    const pdfRecord = await prisma.pDFRecord.findUnique({
      where: { id },
      include: {
        task: {
          select: {
            id: true,
            companyId: true,
            assignedUserId: true,
            taskAssignments: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!pdfRecord) {
      return NextResponse.json({ success: false, message: 'PDF record not found' }, { status: 404 });
    }

    // Authorization: Check if user has access to this task's PDF
    const isOwnTask = pdfRecord.task.assignedUserId === tokenUser.userId;
    const isCompanyTask = pdfRecord.task.companyId === tokenUser.companyId;
    const isAssignedCleaner = pdfRecord.task.taskAssignments?.some(
      (ta: any) => ta.userId === tokenUser.userId
    );
    const isAuthorized =
      isOwnTask ||
      isCompanyTask ||
      isAssignedCleaner ||
      ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(role);

    if (!isAuthorized) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    // Delete the PDF record
    await prisma.pDFRecord.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'PDF deleted successfully' });
  } catch (error: any) {
    console.error('PDF DELETE error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete PDF' },
      { status: 500 }
    );
  }
}
