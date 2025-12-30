import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { requireActiveSubscription } from '@/lib/subscription';
import { UserRole } from '@prisma/client';

// GET /api/properties
// List properties. Owner/Developer see all; others see only their company
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  
  if (!(role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN || role === UserRole.CLEANER)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  // Check if user has active subscription/trial (except for super admins and owners)
  const subscriptionCheck = await requireActiveSubscription(tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ 
      success: false, 
      message: subscriptionCheck.message || 'Subscription required' 
    }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const companyIdParam = searchParams.get('companyId');

  const where: any = {};
  if (q) {
    where.OR = [
      { address: { contains: q, mode: 'insensitive' } },
      { postcode: { contains: q, mode: 'insensitive' } },
    ];
  }

  try {
    if (role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN || role === UserRole.CLEANER) {
      // Allow companyId from query param for SUPER_ADMIN to view different companies
      if (companyIdParam) {
        where.companyId = parseInt(companyIdParam);
      }
      else {
        where.companyId = tokenUser.companyId;
      }
      const properties = await prisma.property.findMany({ 
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { id: 'asc' } 
      });
      return NextResponse.json({ success: true, data: { properties } });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const properties = await prisma.property.findMany({
      where: { ...where, companyId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    return NextResponse.json({ success: true, data: { properties } });
  } catch (error) {
    console.error('Properties GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/properties
// Create property. Company Admin/Manager can create within their company. Owner/Developer can create anywhere.
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const body = await request.json();
    const { 
      address, 
      postcode, 
      latitude, 
      longitude, 
      propertyType, 
      notes, 
      companyId: bodyCompanyId,
      unitCount,
      pricePerUnit,
      googleSheetUrl
    } = body;

    if (!address || !propertyType) {
      return NextResponse.json({ success: false, message: 'Address and propertyType are required' }, { status: 400 });
    }

    let companyId: number | null = null;

    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      console.log('bodyCompanyId', body);
      companyId = bodyCompanyId ?? null;
      if (!companyId) return NextResponse.json({ success: false, message: 'companyId is required' }, { status: 400 });
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    // Get default price per unit from admin configuration
    let defaultPricePerUnit = 1.00;
    if (!pricePerUnit) {
      const adminConfig = await prisma.adminConfiguration.findUnique({
        where: { companyId },
      });
      // @ts-ignore - Field exists in schema but types may not be updated
      if (adminConfig && adminConfig.propertyPricePerUnit) {
        // @ts-ignore
        defaultPricePerUnit = Number(adminConfig.propertyPricePerUnit);
      }
    }

    const finalPricePerUnit = pricePerUnit ? Number(pricePerUnit) : defaultPricePerUnit;
    const finalUnitCount = unitCount ? Number(unitCount) : 1;
    const totalPrice = finalPricePerUnit * finalUnitCount;

    const property = await prisma.property.create({
      data: {
        companyId,
        address,
        postcode,
        latitude: latitude !== undefined ? Number(latitude) : undefined,
        longitude: longitude !== undefined ? Number(longitude) : undefined,
        propertyType,
        // @ts-ignore - Fields exist in schema but types may not be updated
        unitCount: finalUnitCount,
        // @ts-ignore
        pricePerUnit: finalPricePerUnit,
        // @ts-ignore
        totalPrice,
        notes,
        // @ts-ignore
        googleSheetUrl: googleSheetUrl || null,
      },
    });

    // Update company property count and sync with Stripe billing
    // Count should be sum of unitCount (each unit counts as a property)
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

      if (billingRecord?.subscriptionId) {
        const { 
          updatePropertyUsageQuantity, 
          addPropertyUsageToSubscription 
        } = await import("@/lib/stripe");
        
        // Get property price ID from environment
        const propertyPriceId = process.env.STRIPE_PRICe_ID_PROPERTY_BASE;
        
        if (propertyPriceId) {
          // @ts-ignore - Field exists in schema but Prisma client needs regeneration
          if (billingRecord.propertyUsageItemId) {
            // Update existing property usage item
            await updatePropertyUsageQuantity(
              billingRecord.subscriptionId,
              // @ts-ignore
              billingRecord.propertyUsageItemId,
              propertyCount
            );
          } else if (propertyCount > 0) {
            // Add property usage item if it doesn't exist
            const updatedSubscription = await addPropertyUsageToSubscription(
              billingRecord.subscriptionId,
              propertyPriceId,
              propertyCount
            );
            
            // Find and store the property usage item ID
            const propertyItem = updatedSubscription.items.data.find(
              (item) => item.price.id === propertyPriceId
            );
            
            if (propertyItem) {
              await prisma.billingRecord.update({
                where: { id: billingRecord.id },
                data: { 
                  propertyCount,
                  // @ts-ignore - Field exists in schema but Prisma client needs regeneration
                  propertyUsageItemId: propertyItem.id,
                },
              });
            } else {
              await prisma.billingRecord.update({
                where: { id: billingRecord.id },
                data: { propertyCount },
              });
            }
          } else {
            // No properties, just update the count
            await prisma.billingRecord.update({
              where: { id: billingRecord.id },
              data: { propertyCount },
            });
          }
        } else {
          // Fallback: just update property count if price ID not configured
          await prisma.billingRecord.update({
            where: { id: billingRecord.id },
            data: { propertyCount },
          });
        }
      } else {
        // No active subscription, just update property count
        await prisma.company.update({
          where: { id: companyId },
          data: { propertyCount },
        });
      }
    } catch (error) {
      console.error("Error syncing Stripe billing:", error);
      // Don't fail the request if Stripe sync fails
    }

    return NextResponse.json({ success: true, data: { property } }, { status: 201 });
  } catch (error) {
    console.error('Properties POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
