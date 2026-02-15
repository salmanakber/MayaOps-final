import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { requirePermission, PERMISSIONS } from '@/lib/permissions';

// GET - List all available permissions
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission(request, PERMISSIONS.USERS_MANAGE_ADMINS);
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const where: any = {};
    if (category) {
      where.category = category;
    }

    const permissions = await prisma.permission.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    // Group by category
    const grouped = permissions.reduce((acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    }, {} as Record<string, typeof permissions>);

    return NextResponse.json({
      success: true,
      data: {
        permissions,
        grouped,
      },
    });
  } catch (error: any) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch permissions' },
      { status: 500 }
    );
  }
}
