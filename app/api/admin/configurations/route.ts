import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/admin/configurations - Get admin configuration
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const { searchParams } = new URL(request.url);
  const companyIdParam = searchParams.get('companyId');

  try {
    let companyId: number | null = null;

    // Super admins and owners can view any company's config
    if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      if (companyIdParam) {
        companyId = parseInt(companyIdParam);
      } else {
        companyId = tokenUser.companyId || null;
      }
    } else {
      // Others can only view their own company's config
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: 'Company ID required' }, { status: 400 });
    }

    const config = await prisma.adminConfiguration.findUnique({
      where: { companyId },
    });

    if (!config) {
      // Return default config if none exists
      return NextResponse.json({
        success: true,
        data: {
          id: null,
          companyId,
          photoCountRequirement: 20,
          watermarkEnabled: false,
          geofenceRadius: 150,
          timezone: 'UTC',
          notificationTemplate: null,
          dataRetentionDays: 365,
          currency: 'GBP',
          subscriptionBasePrice: 55.00,
          propertyPricePerUnit: 1.00,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        companyId: config.companyId,
        photoCountRequirement: config.photoCountRequirement,
        watermarkEnabled: config.watermarkEnabled,
        geofenceRadius: config.geofenceRadius,
        timezone: config.timezone,
        notificationTemplate: config.notificationTemplate,
        dataRetentionDays: config.dataRetentionDays,
        currency: config.currency,
        subscriptionBasePrice: Number(config.subscriptionBasePrice),
        propertyPricePerUnit: Number(config.propertyPricePerUnit),
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error fetching configurations:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to fetch configurations' 
    }, { status: 500 });
  }
}

// PATCH /api/admin/configurations - Update admin configuration
export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const body = await request.json();
    const {
      companyId: bodyCompanyId,
      photoCountRequirement,
      watermarkEnabled,
      geofenceRadius,
      timezone,
      notificationTemplate,
      dataRetentionDays,
      currency,
      subscriptionBasePrice,
      propertyPricePerUnit,
    } = body;

    let companyId: number | null = null;

    // Super admins and owners can update any company's config
    if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      companyId = bodyCompanyId || tokenUser.companyId || null;
    } else {
      // Others can only update their own company's config
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: 'Company ID required' }, { status: 400 });
    }

    // Check if config exists
    const existing = await prisma.adminConfiguration.findUnique({
      where: { companyId },
    });

    const updateData: any = {};
    if (photoCountRequirement !== undefined) updateData.photoCountRequirement = photoCountRequirement;
    if (watermarkEnabled !== undefined) updateData.watermarkEnabled = watermarkEnabled;
    if (geofenceRadius !== undefined) updateData.geofenceRadius = geofenceRadius;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (notificationTemplate !== undefined) updateData.notificationTemplate = notificationTemplate;
    if (dataRetentionDays !== undefined) updateData.dataRetentionDays = dataRetentionDays;
    if (currency !== undefined) updateData.currency = currency;
    if (subscriptionBasePrice !== undefined) updateData.subscriptionBasePrice = subscriptionBasePrice;
    if (propertyPricePerUnit !== undefined) updateData.propertyPricePerUnit = propertyPricePerUnit;

    let config;
    if (!existing) {
      // Create new config with defaults
      config = await prisma.adminConfiguration.create({
        data: {
          companyId,
          photoCountRequirement: photoCountRequirement || 20,
          watermarkEnabled: watermarkEnabled !== undefined ? watermarkEnabled : false,
          geofenceRadius: geofenceRadius || 150,
          timezone: timezone || 'UTC',
          notificationTemplate: notificationTemplate || null,
          dataRetentionDays: dataRetentionDays || 365,
          currency: currency || 'GBP',
          subscriptionBasePrice: subscriptionBasePrice || 55.00,
          propertyPricePerUnit: propertyPricePerUnit || 1.00,
        },
      });
    } else {
      // Update existing config
      config = await prisma.adminConfiguration.update({
        where: { companyId },
        data: updateData,
      });
    }

    // Update company base price if subscription base price changed
    if (subscriptionBasePrice !== undefined) {
      await prisma.company.update({
        where: { id: companyId },
        data: { basePrice: subscriptionBasePrice },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        companyId: config.companyId,
        photoCountRequirement: config.photoCountRequirement,
        watermarkEnabled: config.watermarkEnabled,
        geofenceRadius: config.geofenceRadius,
        timezone: config.timezone,
        notificationTemplate: config.notificationTemplate,
        dataRetentionDays: config.dataRetentionDays,
        currency: config.currency,
        subscriptionBasePrice: Number(config.subscriptionBasePrice),
        propertyPricePerUnit: Number(config.propertyPricePerUnit),
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error updating configurations:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to update configurations' 
    }, { status: 500 });
  }
}
