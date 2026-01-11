import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/properties/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const property = await prisma.property.findUnique({ where: { id } , include: {
      company: {
        select: {
          id: true,
          name: true,
        },
        
      },
      tasks: true,
    } });
    if (!property) return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });

    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || property.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({ success: true, data: { property } });
  } catch (error) {
    console.error('Property GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/properties/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });

    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || property.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { address, postcode, latitude, longitude, propertyType, notes, isActive, googleSheetUrl } = body;

    const data: any = {};
    if (address !== undefined) data.address = address;
    if (postcode !== undefined) data.postcode = postcode;
    if (latitude !== undefined) data.latitude = latitude !== null ? Number(latitude) : null;
    if (longitude !== undefined) data.longitude = longitude !== null ? Number(longitude) : null;
    if (propertyType !== undefined) data.propertyType = propertyType;
    if (notes !== undefined) data.notes = notes;
    if (isActive !== undefined) data.isActive = !!isActive;
    // @ts-ignore
    if (googleSheetUrl !== undefined) data.googleSheetUrl = googleSheetUrl || null;

    const updated = await prisma.property.update({ where: { id }, data });
    
    // Sync property count with Stripe if subscription is active
    if (updated.companyId) {
      // Count should be sum of unitCount (each unit counts as a property)
      const allProperties = await prisma.property.findMany({
        where: { companyId: updated.companyId },
        select: { unitCount: true },
      });
      
      const propertyCount = allProperties.reduce((sum, prop) => {
        // @ts-ignore - Field exists in schema but types may not be updated
        return sum + (prop.unitCount || 1);
      }, 0);
      
      try {
        const billingRecord = await prisma.billingRecord.findFirst({
          where: { 
            companyId: updated.companyId, 
            status: { in: ["active", "trialing"] } 
          },
          orderBy: { createdAt: "desc" },
        });

        if (billingRecord?.subscriptionId && billingRecord.propertyUsageItemId) {
          const { updatePropertyUsageQuantity, createStripeInstance, decrypt } = await import("@/lib/stripe");
          
          // Get Stripe secret key from SystemSetting
          let stripeSecretKey = '';
          try {
            const secretKeySetting = await prisma.systemSetting.findUnique({
              where: { key: 'stripe_secret_key' },
            });
            if (secretKeySetting) {
              stripeSecretKey = secretKeySetting.isEncrypted 
                ? decrypt(secretKeySetting.value) 
                : secretKeySetting.value;
            }
          } catch (error) {
            console.warn('Failed to fetch Stripe secret key from settings:', error);
            stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
          }
          
          if (stripeSecretKey) {
            // Create Stripe instance with credentials from SystemSetting
            const stripeInstance = createStripeInstance(stripeSecretKey);
            
            await updatePropertyUsageQuantity(
              billingRecord.subscriptionId,
              billingRecord.propertyUsageItemId,
              propertyCount,
              stripeInstance
            );
          }

          await prisma.billingRecord.update({
            where: { id: billingRecord.id },
            data: { propertyCount },
          });
        }
      } catch (error) {
        console.error("Error syncing Stripe billing on property update:", error);
      }
    }
    
    return NextResponse.json({ success: true, data: { property: updated } });
  } catch (error) {
    console.error('Property PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/properties/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });

    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || property.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    const companyId = property.companyId;

    // Archive the property (set isActive to false instead of deleting)
    await prisma.property.update({ 
      where: { id }, 
      data: { isActive: false } 
    });

    // Update company property count (sum of unitCount)
    const allProperties = await prisma.property.findMany({
      where: { companyId },
      select: { unitCount: true },
    });
    
    const propertyCount = allProperties.reduce((sum, prop) => {
      // @ts-ignore - Field exists in schema but types may not be updated
      return sum + (prop.unitCount || 1);
    }, 0);
    
    await prisma.company.update({
      where: { id: companyId },
      data: { propertyCount },
    });

    // Sync with Stripe billing (prorated update)
    try {
      const billingRecord = await prisma.billingRecord.findFirst({
        where: { 
          companyId, 
          status: { in: ["active", "trialing"] } 
        },
        orderBy: { createdAt: "desc" },
      });

      // @ts-ignore - Field exists in schema but Prisma client needs regeneration
      if (billingRecord?.subscriptionId && billingRecord.propertyUsageItemId) {
        const { updatePropertyUsageQuantity, createStripeInstance, decrypt } = await import("@/lib/stripe");
        
        // Get Stripe secret key from SystemSetting
        let stripeSecretKey = '';
        try {
          const secretKeySetting = await prisma.systemSetting.findUnique({
            where: { key: 'stripe_secret_key' },
          });
          if (secretKeySetting) {
            stripeSecretKey = secretKeySetting.isEncrypted 
              ? decrypt(secretKeySetting.value) 
              : secretKeySetting.value;
          }
        } catch (error) {
          console.warn('Failed to fetch Stripe secret key from settings:', error);
          stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
        }
        
        if (stripeSecretKey) {
          // Create Stripe instance with credentials from SystemSetting
          const stripeInstance = createStripeInstance(stripeSecretKey);
          
          await updatePropertyUsageQuantity(
            billingRecord.subscriptionId,
            // @ts-ignore
            billingRecord.propertyUsageItemId,
            propertyCount,
            stripeInstance
          );
        }

        await prisma.billingRecord.update({
          where: { id: billingRecord.id },
          data: { propertyCount },
        });
      }
    } catch (error) {
      console.error("Error syncing Stripe billing on property deletion:", error);
      // Don't fail the request if Stripe sync fails
    }

    return NextResponse.json({ success: true, message: 'Property archived' });
  } catch (error) {
    console.error('Property DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/properties/[id]/archive - Archive a property (set isActive to false)
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });

    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || property.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { isActive } = body;

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ success: false, message: 'isActive must be a boolean' }, { status: 400 });
    }

    const updated = await prisma.property.update({
      where: { id },
      data: { isActive },
    });

    return NextResponse.json({ success: true, data: { property: updated } });
  } catch (error) {
    console.error('Property archive error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
