import { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';
import { getUserFromRequest, JWTPayload } from '@/lib/auth';

// Define role hierarchy from lowest to highest privileges
const ROLE_ORDER: UserRole[] = [
  UserRole.CLEANER,
  UserRole.MANAGER,
  UserRole.COMPANY_ADMIN,
  UserRole.DEVELOPER,
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
];

export function hasAtLeastRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(minRole);
}

export interface AuthContext {
  tokenUser: JWTPayload;
}

// Extract and verify JWT from request
export function requireAuth(request: NextRequest): AuthContext | null {
  const tokenUser = getUserFromRequest(request);
  if (!tokenUser) return null;
  return { tokenUser };
}

export function requireRole(tokenUser: JWTPayload, minRole: UserRole): boolean {
  try {
    const role = (tokenUser.role as UserRole) || UserRole.CLEANER;
    return hasAtLeastRole(role, minRole);
  } catch {
    return false;
  }
}

// Ensure the token user is scoped to a company (for company-specific resources)
export function requireCompanyScope(tokenUser: JWTPayload): number | null {
  return tokenUser.companyId ?? null;
}

// Utility to check if the token user can act on a given company resource
export function canAccessCompany(tokenUser: JWTPayload, companyId: number): boolean {
  const role = tokenUser.role as UserRole;
  // Global roles can access all companies
  if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) return true;
  // Otherwise must match their own company
  return tokenUser.companyId === companyId;
}
