import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // 1️⃣ Authenticate user
  const auth = requireAuth(request);
  if (!auth) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { taskId } = await params;
    const taskIdNum = parseInt(taskId);
    const { tokenUser } = auth;

    if (isNaN(taskIdNum)) {
      return new NextResponse('Invalid task ID', { status: 400 });
    }

    // 2️⃣ Fetch task and most recent PDF record
    const task = await prisma.task.findUnique({
      where: { id: taskIdNum },
      include: {
        pdfRecords: {
          orderBy: { generatedAt: 'desc' },
          take: 1, // Get most recent PDF
        },
      },
    });

    if (!task) {
      return new NextResponse('Task not found', { status: 404 });
    }

    // Check if PDF exists
    if (!task.pdfRecords || task.pdfRecords.length === 0 || !task.pdfRecords[0]?.url) {
      return new NextResponse('PDF not found for this task', { status: 404 });
    }

    const pdfUrl = task.pdfRecords[0].url.replace('.pdf', '');

    // 3️⃣ Authorization: check if user has access to this task
    const isOwnTask = task.assignedUserId === tokenUser.userId;
    const isCompanyTask = task.companyId === tokenUser.companyId;
    const isAuthorized =
      isOwnTask || 
      isCompanyTask || 
      ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(tokenUser.role);

    if (!isAuthorized) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // 4️⃣ Fetch PDF from Cloudinary
    const cloudinaryRes = await fetch(pdfUrl);
    if (!cloudinaryRes.ok) {
      console.error('Failed to fetch PDF from Cloudinary:', pdfUrl);
      return new NextResponse('Failed to fetch PDF from storage', { status: 500 });
    }
    const pdfBuffer = await cloudinaryRes.arrayBuffer();

    // 5️⃣ Return PDF with proper filename
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="task-${taskIdNum}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Error downloading task PDF:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
