import { hasPermission, requireRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

describe('RBAC System', () => {
  describe('hasPermission', () => {
    it('should allow SUPER_ADMIN access to all resources', () => {
      expect(hasPermission(UserRole.SUPER_ADMIN, 'any_resource')).toBe(true);
    });

    it('should allow OWNER access to company resources', () => {
      expect(hasPermission(UserRole.OWNER, 'companies')).toBe(true);
      expect(hasPermission(UserRole.OWNER, 'users')).toBe(true);
    });

    it('should restrict CLEANER access', () => {
      expect(hasPermission(UserRole.CLEANER, 'companies')).toBe(false);
      expect(hasPermission(UserRole.CLEANER, 'tasks')).toBe(true);
    });

    it('should allow MANAGER to manage tasks', () => {
      expect(hasPermission(UserRole.MANAGER, 'tasks')).toBe(true);
      expect(hasPermission(UserRole.MANAGER, 'rota')).toBe(true);
    });
  });

  describe('requireRole', () => {
    it('should return true for exact role match', () => {
      expect(requireRole(UserRole.MANAGER, [UserRole.MANAGER])).toBe(true);
    });

    it('should return true if role is in allowed list', () => {
      expect(requireRole(UserRole.COMPANY_ADMIN, [UserRole.OWNER, UserRole.COMPANY_ADMIN])).toBe(true);
    });

    it('should return false if role not in allowed list', () => {
      expect(requireRole(UserRole.CLEANER, [UserRole.MANAGER, UserRole.OWNER])).toBe(false);
    });

    it('should always allow SUPER_ADMIN', () => {
      expect(requireRole(UserRole.SUPER_ADMIN, [UserRole.CLEANER])).toBe(true);
    });
  });
});
