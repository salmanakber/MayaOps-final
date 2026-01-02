import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, requireCompanyScope } from '@/lib/rbac';
import { hashPassword, isValidEmail, isValidPassword } from '@/lib/auth';
import { UserRole } from '@prisma/client';

// GET /api/users
// List users - Owner/Developer see all; others see only their company
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const { searchParams } = new URL(request.url);
    const companyIdParam = searchParams.get('companyId');
    
 

    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN || role === UserRole.CLEANER || role === UserRole.MANAGER || role === UserRole.COMPANY_ADMIN) {
      // Allow companyId from query param for SUPER_ADMIN to view different companies
      const where: any = {};
      if (companyIdParam) {
        where.companyId = parseInt(companyIdParam);
      }
      else {
        where.companyId = tokenUser.companyId;
      }



      
      const users = await prisma.user.findMany({
        where,
        select: { 
          id: true, 
          email: true, 
          firstName: true, 
          lastName: true, 
          role: true, 
          companyId: true, 
          isActive: true, 
          createdAt: true,
          profileImage: true,
          company: {
            select: {
              id: true,
              name: true,
            },
              
          },
          leaveRequests: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              reason: true,
              status: true,
              approvedBy: true,
              createdAt: true,
            },
          },
          availability: {
            select: {
              id: true,
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              isAvailable: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      });
      
      const cleanersWithLeaveAvailability = users.map((user: any) => ({
        ...user,
        leaveRequests: user.leaveRequests.map(leave => ({
          ...leave,
          isAvailable: new Date(leave.endDate) < new Date(), // true if leave ended
        })),
      }));
      
      const cleaners = cleanersWithLeaveAvailability.filter((user: any) => user.role === UserRole.CLEANER);
  
      return NextResponse.json({ success: true, data: users, cleaners: cleaners });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const users = await prisma.user.findMany({
      where: { companyId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true, isActive: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json({ success: true, data: { users } });
  } catch (error) {
    console.error('Users GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/users
// Create a user. Company Admin/Manager can create users within their company (Manager cannot create Admins). Owner/Developer can create any.
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const requesterRole = tokenUser.role as UserRole;

  try {
    const body = await request.json();
    const { email, password, firstName, lastName, role = 'CLEANER', companyId: bodyCompanyId } = body;

    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, message: 'Invalid email format' }, { status: 400 });
    }
    const pwdCheck = isValidPassword(password);
    if (!pwdCheck.valid) {
      return NextResponse.json({ success: false, message: pwdCheck.message || 'Weak password' }, { status: 400 });
    }

    const newUserRole = (role as string).toUpperCase() as UserRole;
    if (!Object.values(UserRole).includes(newUserRole)) {
      return NextResponse.json({ success: false, message: 'Invalid role' }, { status: 400 });
    }

    // Determine target company scope
    let targetCompanyId: number | null = null;
    const allowedGlobalRoles: UserRole[] = [UserRole.OWNER, UserRole.DEVELOPER, UserRole.SUPER_ADMIN, UserRole.ADMIN_UNIQUE , UserRole.MANAGER, UserRole.CLEANER];
    if (allowedGlobalRoles.includes(requesterRole)) {
      // Global roles can specify any companyId or create users without one
      targetCompanyId = bodyCompanyId ?? null;
    } else {
      const scopeCompanyId = requireCompanyScope(tokenUser);
      if (!scopeCompanyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      targetCompanyId = scopeCompanyId;

      // Managers cannot create admins/managers
      if (requesterRole === UserRole.MANAGER && (newUserRole === UserRole.COMPANY_ADMIN || newUserRole === UserRole.MANAGER || newUserRole === UserRole.DEVELOPER || newUserRole === UserRole.OWNER || newUserRole === UserRole.CLEANER)) {
        return NextResponse.json({ success: false, message: 'Insufficient permissions to create this role' }, { status: 403 });
      }

      // Company Admin cannot create higher roles or global roles
      if (requesterRole === UserRole.COMPANY_ADMIN && (newUserRole === UserRole.DEVELOPER || newUserRole === UserRole.OWNER || newUserRole === UserRole.SUPER_ADMIN || newUserRole === UserRole.CLEANER)) {
        return NextResponse.json({ success: false, message: 'Insufficient permissions to create this role' }, { status: 403 });
      }
    }

    // If targetCompanyId specified, ensure it exists
    if (targetCompanyId) {
      const company = await prisma.company.findUnique({ where: { id: targetCompanyId } });
      if (!company) return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return NextResponse.json({ success: false, message: 'User already exists' }, { status: 409 });

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role: newUserRole,
        companyId: targetCompanyId ?? undefined,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ success: true, data: { user } }, { status: 201 });
  } catch (error) {
    console.error('Users POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
