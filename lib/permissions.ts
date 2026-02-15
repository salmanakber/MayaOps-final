import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// Permission categories
export const PERMISSION_CATEGORIES = {
  USERS: 'users',
  BILLING: 'billing',
  SETTINGS: 'settings',
  COMPANIES: 'companies',
  PROPERTIES: 'properties',
  TASKS: 'tasks',
  REPORTS: 'reports',
  SYSTEM: 'system',
  CONTROL_CENTER: 'control_center',
  SUPPORT_TICKETS: 'support_tickets',
} as const;

// Common permission keys
export const PERMISSIONS = {
  // Users
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE_ADMINS: 'users.manage_admins',
  
  // Billing
  BILLING_VIEW: 'billing.view',
  BILLING_EDIT: 'billing.edit',
  BILLING_MANAGE_SUBSCRIPTIONS: 'billing.manage_subscriptions',
  
  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',
  SETTINGS_SYSTEM: 'settings.system',
  
  // Companies
  COMPANIES_VIEW: 'companies.view',
  COMPANIES_CREATE: 'companies.create',
  COMPANIES_EDIT: 'companies.edit',
  COMPANIES_DELETE: 'companies.delete',
  
  // Properties
  PROPERTIES_VIEW: 'properties.view',
  PROPERTIES_CREATE: 'properties.create',
  PROPERTIES_EDIT: 'properties.edit',
  PROPERTIES_DELETE: 'properties.delete',
  
  // Tasks
  TASKS_VIEW: 'tasks.view',
  TASKS_CREATE: 'tasks.create',
  TASKS_EDIT: 'tasks.edit',
  TASKS_DELETE: 'tasks.delete',
  
  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  
  // System
  SYSTEM_ADMIN: 'system.admin',
  SYSTEM_DEVELOPER: 'system.developer',

  // Control Center
  CONTROL_CENTER_VIEW: 'control_center.view',
  CONTROL_CENTER_EDIT: 'control_center.edit',
  CONTROL_CENTER_DELETE: 'control_center.delete',

  // Support Tickets
  SUPPORT_TICKETS_VIEW: 'support_tickets.view',
  SUPPORT_TICKETS_CREATE: 'support_tickets.create',
  SUPPORT_TICKETS_EDIT: 'support_tickets.edit',
  SUPPORT_TICKETS_DELETE: 'support_tickets.delete',

  // Account Deletion
  DELETE_ACCOUNT_REQUEST: 'users.delete_account_request',
} as const;

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(userId: number, permissionKey: string): Promise<boolean> {
  try {
    // First check if user is head super admin, DEVELOPER, or OWNER (they have all permissions)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true, isHeadSuperAdmin: true } as any,
    });

    // Check if user exists and is active
    if (!user || !user.isActive) {
      return false;
    }

    // Head super admin, DEVELOPER, and OWNER have all permissions
    const isHeadSuperAdmin = (user as any).isHeadSuperAdmin || false;
    const userRole = (user.role as unknown) as UserRole;
    if (isHeadSuperAdmin || userRole === UserRole.DEVELOPER || userRole === UserRole.OWNER) {
      return true;
    }

    // Regular SUPER_ADMIN users need explicit permissions

    if (userRole === UserRole.SUPER_ADMIN) {
      // Check if they have the specific permission
      const permission = await (prisma as any).permission.findUnique({
        where: { key: permissionKey },
      });

      if (!permission) {
        return false;
      }

      const adminPermission = await (prisma as any).adminPermission.findFirst({
        where: {
          userId,
          permissionId: permission.id,
          isActive: true,
          revokedAt: null,
        },
      });

      return !!adminPermission;
    }

    // For other roles (COMPANY_ADMIN, MANAGER, CLEANER), check explicit permissions
    // These roles may have permissions assigned via AdminPermission
    const permission = await (prisma as any).permission.findUnique({
      where: { key: permissionKey },
    });

    if (!permission) {
      return false;
    }

    const adminPermission = await (prisma as any).adminPermission.findFirst({
      where: {
        userId,
        permissionId: permission.id,
        isActive: true,
        revokedAt: null,
      },
    });

    return !!adminPermission;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(userId: number, permissionKeys: string[]): Promise<boolean> {
  for (const key of permissionKeys) {
    if (await hasPermission(userId, key)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(userId: number, permissionKeys: string[]): Promise<boolean> {
  for (const key of permissionKeys) {
    if (!(await hasPermission(userId, key))) {
      return false;
    }
  }
  return true;
}

/**
 * Get all active permissions for a user
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true, isHeadSuperAdmin: true } as any,
    });

    // Check if user exists and is active
    if (!user || !user.isActive) {
      return [];
    }

    // Head super admin, DEVELOPER, and OWNER have all permissions
    const isHeadSuperAdmin = (user as any).isHeadSuperAdmin || false;
    const userRole = (user.role as unknown) as UserRole;
    if (isHeadSuperAdmin || userRole === UserRole.DEVELOPER || userRole === UserRole.OWNER) {
      const allPermissions = await (prisma as any).permission.findMany({
        select: { key: true },
      });
      return allPermissions.map((p: any) => p.key);
    }

    // Regular SUPER_ADMIN and other roles only have explicitly granted permissions
    const adminPermissions = await (prisma as any).adminPermission.findMany({
      where: {
        userId,
        isActive: true,
        revokedAt: null,
      },
      include: {
        permission: {
          select: { key: true },
        },
      },
    });

    return adminPermissions.map((ap: any) => ap.permission.key);
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return [];
  }
}

/**
 * Middleware to require a specific permission
 */
export async function requirePermission(
  request: NextRequest,
  permissionKey: string
): Promise<{ allowed: boolean; message?: string; userId?: number }> {
  const auth = requireAuth(request);
  if (!auth) {
    return { allowed: false, message: 'Unauthorized' };
  }

  const { tokenUser } = auth;
  const userId = tokenUser.userId;

  const hasAccess = await hasPermission(userId, permissionKey);
  
  if (!hasAccess) {
    return {
      allowed: false,
      message: `You do not have permission to perform this action. Required: ${permissionKey}`,
      userId,
    };
  }
  

  return { allowed: true, userId };
}

/**
 * Middleware to require any of the specified permissions
 */
export async function requireAnyPermission(
  request: NextRequest,
  permissionKeys: string[]
): Promise<{ allowed: boolean; message?: string; userId?: number }> {
  const auth = requireAuth(request);
  if (!auth) {
    return { allowed: false, message: 'Unauthorized' };
  }

  const { tokenUser } = auth;
  const userId = tokenUser.userId;

  const hasAccess = await hasAnyPermission(userId, permissionKeys);
  
  if (!hasAccess) {
    return {
      allowed: false,
      message: `You do not have permission to perform this action. Required: ${permissionKeys.join(' or ')}`,
      userId,
    };
  }

  return { allowed: true, userId };
}

/**
 * Initialize default permissions in the database
 */
export async function initializePermissions(): Promise<void> {
  const defaultPermissions = [
    // Users
    { key: PERMISSIONS.USERS_VIEW, name: 'View Users', description: 'View user list and details', category: PERMISSION_CATEGORIES.USERS },
    { key: PERMISSIONS.USERS_CREATE, name: 'Create Users', description: 'Create new users', category: PERMISSION_CATEGORIES.USERS },
    { key: PERMISSIONS.USERS_EDIT, name: 'Edit Users', description: 'Edit existing users', category: PERMISSION_CATEGORIES.USERS },
    { key: PERMISSIONS.USERS_DELETE, name: 'Delete Users', description: 'Delete users', category: PERMISSION_CATEGORIES.USERS },
    { key: PERMISSIONS.USERS_MANAGE_ADMINS, name: 'Manage Admins', description: 'Manage admin users and permissions', category: PERMISSION_CATEGORIES.USERS },
    
    // Billing
    { key: PERMISSIONS.BILLING_VIEW, name: 'View Billing', description: 'View billing information', category: PERMISSION_CATEGORIES.BILLING },
    { key: PERMISSIONS.BILLING_EDIT, name: 'Edit Billing', description: 'Edit billing information', category: PERMISSION_CATEGORIES.BILLING },
    { key: PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS, name: 'Manage Subscriptions', description: 'Manage company subscriptions', category: PERMISSION_CATEGORIES.BILLING },
    
    // Settings
    { key: PERMISSIONS.SETTINGS_VIEW, name: 'View Settings', description: 'View system settings', category: PERMISSION_CATEGORIES.SETTINGS },
    { key: PERMISSIONS.SETTINGS_EDIT, name: 'Edit Settings', description: 'Edit system settings', category: PERMISSION_CATEGORIES.SETTINGS },
    { key: PERMISSIONS.SETTINGS_SYSTEM, name: 'System Settings', description: 'Access system-level settings', category: PERMISSION_CATEGORIES.SETTINGS },
    
    // Companies
    { key: PERMISSIONS.COMPANIES_VIEW, name: 'View Companies', description: 'View company list and details', category: PERMISSION_CATEGORIES.COMPANIES },
    { key: PERMISSIONS.COMPANIES_CREATE, name: 'Create Companies', description: 'Create new companies', category: PERMISSION_CATEGORIES.COMPANIES },
    { key: PERMISSIONS.COMPANIES_EDIT, name: 'Edit Companies', description: 'Edit existing companies', category: PERMISSION_CATEGORIES.COMPANIES },
    { key: PERMISSIONS.COMPANIES_DELETE, name: 'Delete Companies', description: 'Delete companies', category: PERMISSION_CATEGORIES.COMPANIES },
    
    // Properties
    { key: PERMISSIONS.PROPERTIES_VIEW, name: 'View Properties', description: 'View property list and details', category: PERMISSION_CATEGORIES.PROPERTIES },
    { key: PERMISSIONS.PROPERTIES_CREATE, name: 'Create Properties', description: 'Create new properties', category: PERMISSION_CATEGORIES.PROPERTIES },
    { key: PERMISSIONS.PROPERTIES_EDIT, name: 'Edit Properties', description: 'Edit existing properties', category: PERMISSION_CATEGORIES.PROPERTIES },
    { key: PERMISSIONS.PROPERTIES_DELETE, name: 'Delete Properties', description: 'Delete properties', category: PERMISSION_CATEGORIES.PROPERTIES },
    
    // Tasks
    { key: PERMISSIONS.TASKS_VIEW, name: 'View Tasks', description: 'View task list and details', category: PERMISSION_CATEGORIES.TASKS },
    { key: PERMISSIONS.TASKS_CREATE, name: 'Create Tasks', description: 'Create new tasks', category: PERMISSION_CATEGORIES.TASKS },
    { key: PERMISSIONS.TASKS_EDIT, name: 'Edit Tasks', description: 'Edit existing tasks', category: PERMISSION_CATEGORIES.TASKS },
    { key: PERMISSIONS.TASKS_DELETE, name: 'Delete Tasks', description: 'Delete tasks', category: PERMISSION_CATEGORIES.TASKS },
    
    // Reports
    { key: PERMISSIONS.REPORTS_VIEW, name: 'View Reports', description: 'View reports and analytics', category: PERMISSION_CATEGORIES.REPORTS },
    { key: PERMISSIONS.REPORTS_EXPORT, name: 'Export Reports', description: 'Export reports to files', category: PERMISSION_CATEGORIES.REPORTS },
    
    // System
    { key: PERMISSIONS.SYSTEM_ADMIN, name: 'System Admin', description: 'Full system administration access', category: PERMISSION_CATEGORIES.SYSTEM },
    { key: PERMISSIONS.SYSTEM_DEVELOPER, name: 'Developer Access', description: 'Developer-level system access', category: PERMISSION_CATEGORIES.SYSTEM },

    // Control Center
    { key: PERMISSIONS.CONTROL_CENTER_VIEW, name: 'View Control Center', description: 'View control center', category: PERMISSION_CATEGORIES.CONTROL_CENTER },
    { key: PERMISSIONS.CONTROL_CENTER_EDIT, name: 'Edit Control Center', description: 'Edit control center', category: PERMISSION_CATEGORIES.CONTROL_CENTER },
    { key: PERMISSIONS.CONTROL_CENTER_DELETE, name: 'Delete Control Center', description: 'Delete control center', category: PERMISSION_CATEGORIES.CONTROL_CENTER },

    //Support Tickets
    { key: PERMISSIONS.SUPPORT_TICKETS_VIEW, name: 'View Support Tickets', description: 'View support ticket list and details', category: PERMISSION_CATEGORIES.SUPPORT_TICKETS },
    { key: PERMISSIONS.SUPPORT_TICKETS_CREATE, name: 'Create Support Tickets', description: 'Create new support tickets', category: PERMISSION_CATEGORIES.SUPPORT_TICKETS },
    { key: PERMISSIONS.SUPPORT_TICKETS_EDIT, name: 'Edit Support Tickets', description: 'Edit existing support tickets', category: PERMISSION_CATEGORIES.SUPPORT_TICKETS },
    { key: PERMISSIONS.SUPPORT_TICKETS_DELETE, name: 'Delete Support Tickets', description: 'Delete support tickets', category: PERMISSION_CATEGORIES.SUPPORT_TICKETS },

    // account deletion 
    { key: PERMISSIONS.DELETE_ACCOUNT_REQUEST, name: 'Delete Account Requests', description: 'Delete account deletion requests from the system', category: PERMISSION_CATEGORIES.USERS },
  ];

  for (const perm of defaultPermissions) {
    await (prisma as any).permission.upsert({
      where: { key: perm.key },
      update: {
        name: perm.name,
        description: perm.description,
        category: perm.category,
      },
      create: perm,
    });
  }
}
