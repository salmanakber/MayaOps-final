import { PERMISSIONS } from './permissions';

/**
 * Mapping of admin pages to their required permissions
 * This ensures users can only access pages they have permission for
 */
export const PAGE_PERMISSIONS: Record<string, string | string[] | null> = {
  // Dashboard - always accessible
  '/admin/dashboard': null,
  
  // Properties
  '/admin/properties': PERMISSIONS.PROPERTIES_VIEW,
  
  // Tasks
  '/admin/tasks': PERMISSIONS.TASKS_VIEW,
  '/admin/rota': PERMISSIONS.TASKS_VIEW,
  '/admin/recurring-jobs': PERMISSIONS.TASKS_VIEW,
  '/admin/issues': PERMISSIONS.TASKS_VIEW,
  
  // Users
  '/admin/users': PERMISSIONS.USERS_VIEW,
  '/admin/users-management': PERMISSIONS.USERS_VIEW,
  '/admin/admin-management': PERMISSIONS.USERS_MANAGE_ADMINS,
  '/admin/account-deletion': PERMISSIONS.USERS_DELETE,
  
  // Billing
  '/admin/billing': PERMISSIONS.BILLING_VIEW,
  
  // Settings
  '/admin/settings': PERMISSIONS.SETTINGS_VIEW,
  
  // Reports
  '/admin/reporting': PERMISSIONS.REPORTS_VIEW,
  
  // System
  '/admin/sheets-sync': PERMISSIONS.SYSTEM_ADMIN,
  '/admin/developer': PERMISSIONS.SYSTEM_DEVELOPER,
  '/admin/control-center': [PERMISSIONS.SYSTEM_ADMIN, PERMISSIONS.SYSTEM_DEVELOPER],
  '/admin/control-center/configurations': [PERMISSIONS.SYSTEM_ADMIN, PERMISSIONS.SYSTEM_DEVELOPER],
  '/admin/control-center/add-company': [PERMISSIONS.SYSTEM_ADMIN, PERMISSIONS.SYSTEM_DEVELOPER],
  '/admin/control-center/billing': [PERMISSIONS.SYSTEM_ADMIN, PERMISSIONS.SYSTEM_DEVELOPER],
  '/admin/control-center/audit-logs': [PERMISSIONS.SYSTEM_ADMIN, PERMISSIONS.SYSTEM_DEVELOPER],
  '/admin/control-center/company/[id]': [PERMISSIONS.SYSTEM_ADMIN, PERMISSIONS.SYSTEM_DEVELOPER],
  '/admin/super-admin': PERMISSIONS.SYSTEM_ADMIN,
  
  // Profile - always accessible (user's own profile)
  '/admin/profile': null,
  
  // Support Tickets - role-based (handled separately)
  '/admin/support-tickets': null,
  
  // Notifications - role-based (handled separately)
  '/admin/notifications': null,
  
  // Checklist Templates - tasks related
  '/admin/checklist-templates': PERMISSIONS.TASKS_VIEW,
};

/**
 * Get required permission(s) for a page path
 */
export function getPagePermission(pathname: string): string | string[] | null {
  // Exact match first
  if (PAGE_PERMISSIONS[pathname]) {
    return PAGE_PERMISSIONS[pathname];
  }
  
  // Check for dynamic routes (e.g., /admin/control-center/company/[id])
  for (const [pattern, permission] of Object.entries(PAGE_PERMISSIONS)) {
    if (pattern.includes('[') && pattern.includes(']')) {
      // Convert pattern to regex
      const regexPattern = pattern.replace(/\[.*?\]/g, '[^/]+');
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(pathname)) {
        return permission;
      }
    }
  }
  
  // Default: no permission required (but should be explicitly set)
  return null;
}
