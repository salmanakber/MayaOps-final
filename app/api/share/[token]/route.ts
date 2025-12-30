import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const shareLink = await prisma.shareLink.findUnique({
      where: { token: params.token },
      include: {
        task: {
          include: {
            property: true,
            photos: { orderBy: { photoType: 'asc' } },
            checklists: { orderBy: { order: 'asc' } },
            notes: { where: { noteType: 'issue' } },
          },
        },
      },
    });

    if (!shareLink) {
      return NextResponse.json({ success: false, message: 'Share link not found' }, { status: 404 });
    }

    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      return NextResponse.json({ success: false, message: 'Share link expired' }, { status: 410 });
    }

    await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json({ success: true, data: shareLink.task });
  } catch (error) {
    console.error('Share link GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
