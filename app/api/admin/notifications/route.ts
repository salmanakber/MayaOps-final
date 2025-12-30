import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { type NextRequest, NextResponse } from "next/server"
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
      const auth = requireAuth(request);
    if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get("userId")
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    const result = await prisma.notification.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("Error fetching notifications:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch notifications" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request);
    if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const { userId, title, message, type } = await request.json()

    const result = await prisma.notification.create({
      data: {
        userId: Number(userId),
        title: title,
        message: message,
        type: type,
        status: "unread",
      },
    })

    // TODO: Send email notification based on user preferences
    // TODO: Trigger webhook for external notification services

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("Error creating notification:", error)
    return NextResponse.json({ success: false, error: "Failed to create notification" }, { status: 500 })
  }
}
