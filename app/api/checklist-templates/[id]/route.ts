import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const { id } = await params;

  try {
    const template = await prisma.checklistTemplate.findUnique({
      where: { id: Number(id) },
    });

    if (!template) {
      return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
    }

    // Check access
    const userRole = tokenUser.role as UserRole;
    if (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.OWNER && userRole !== UserRole.DEVELOPER) {
      if (template.companyId !== tokenUser.companyId) {
        return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
      }
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Checklist template GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const { id } = await params;

  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const template = await prisma.checklistTemplate.findUnique({
      where: { id: Number(id) },
    });

    if (!template) {
      return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
    }

    // Check access
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      if (template.companyId !== tokenUser.companyId) {
        return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { name, description, items, isDefault } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (items !== undefined) updateData.items = typeof items === 'string' ? items : JSON.stringify(items);
    if (isDefault !== undefined) {
      updateData.isDefault = isDefault;
      // If setting as default, unset other defaults for the company
      if (isDefault) {
        await prisma.checklistTemplate.updateMany({
          where: {
            companyId: template.companyId,
            id: { not: Number(id) },
          },
          data: { isDefault: false },
        });
      }
    }

    const updated = await prisma.checklistTemplate.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Checklist template PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const { id } = await params;

  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const template = await prisma.checklistTemplate.findUnique({
      where: { id: Number(id) },
    });

    if (!template) {
      return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
    }

    // Check access
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
      if (template.companyId !== tokenUser.companyId) {
        return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
      }
    }

    await prisma.checklistTemplate.delete({
      where: { id: Number(id) },
    });

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Checklist template DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}


