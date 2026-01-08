import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/subscription/pricing - Get pricing information and current property count
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    let companyId: number | null = null;

    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      companyId = tokenUser.companyId || null;
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: 'Company ID required' }, { status: 400 });
    }

    // Get company info
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        basePrice: true,
      },
    });

    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    // Get admin configuration for pricing
    const adminConfig = await prisma.adminConfiguration.findUnique({
      where: { companyId },
    });

    // Get actual property count from database
    // Count should be sum of unitCount (each unit counts as a property)
    const properties = await prisma.property.findMany({
      where: { companyId },
      select: { unitCount: true },
    });
    
    // Sum up all unitCount values (each unit = 1 property for billing)
    const propertyCount = properties.reduce((sum, prop) => {
      // @ts-ignore - Field exists in schema but types may not be updated
      return sum + (prop.unitCount || 1);
    }, 0);

    // Get default pricing from SystemSetting if not in AdminConfiguration
    let defaultBasePrice = 55.00;
    let defaultPricePerUnit = 1.00;
    
    try {
      const basePriceSetting = await prisma.systemSetting.findUnique({
        where: { key: 'base_monthly_price' },
      });
      const pricePerPropertySetting = await prisma.systemSetting.findUnique({
        where: { key: 'price_per_property' },
      });
      
      if (basePriceSetting) {
        defaultBasePrice = parseFloat(basePriceSetting.value) || 55.00;
      } else {
        // Fallback to env var
        defaultBasePrice = parseFloat(process.env.BASE_MONTHLY_PRICE || '55');
      }
      
      if (pricePerPropertySetting) {
        defaultPricePerUnit = parseFloat(pricePerPropertySetting.value) || 1.00;
      } else {
        // Fallback to env var
        defaultPricePerUnit = parseFloat(process.env.PRICE_PER_PROPERTY || '1');
      }
    } catch (error) {
      console.warn('Failed to fetch default pricing from SystemSetting, using defaults:', error);
    }

    // Calculate pricing - use AdminConfiguration first, then SystemSetting, then company default, then hardcoded
    const basePrice = adminConfig 
      ? Number(adminConfig.subscriptionBasePrice) 
      : Number(company.basePrice) || defaultBasePrice;
    
    const pricePerUnit = adminConfig 
      ? Number(adminConfig.propertyPricePerUnit) 
      : defaultPricePerUnit;
    
    const currency = adminConfig?.currency || 'GBP';
    
    const propertyFee = propertyCount * pricePerUnit;
    const totalAmount = basePrice + propertyFee;

    return NextResponse.json({
      success: true,
      data: {
        company: {
          id: company.id,
          name: company.name,
        },
        pricing: {
          basePrice,
          pricePerUnit,
          currency,
          propertyCount,
          propertyFee,
          totalAmount,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching pricing:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to fetch pricing' 
    }, { status: 500 });
  }
}

