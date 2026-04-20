/**
 * Unit Tests for RBAC Roles Module
 * 
 * Tests role definitions, permission checking, and MFA requirements.
 */

import {
  Role,
  ROLES,
  hasPermission,
  requiresMFA,
  getRolePermissions,
  isValidRole,
  getMaxSessionDuration,
} from '../../../src/auth/roles';

describe('RBAC Roles Module', () => {
  describe('Role Definitions', () => {
    it('should define all required roles', () => {
      expect(ROLES.admin).toBeDefined();
      expect(ROLES.preparer).toBeDefined();
      expect(ROLES.reviewer).toBeDefined();
      expect(ROLES['read-only']).toBeDefined();
    });

    it('should have correct display names', () => {
      expect(ROLES.admin.displayName).toBe('Administrator');
      expect(ROLES.preparer.displayName).toBe('Report Preparer');
      expect(ROLES.reviewer.displayName).toBe('Report Reviewer');
      expect(ROLES['read-only'].displayName).toBe('Read-Only Viewer');
    });

    it('should require MFA for admin and preparer roles', () => {
      expect(ROLES.admin.requiresMFA).toBe(true);
      expect(ROLES.preparer.requiresMFA).toBe(true);
      expect(ROLES.reviewer.requiresMFA).toBe(false);
      expect(ROLES['read-only'].requiresMFA).toBe(false);
    });

    it('should have 1-hour max session duration for all roles', () => {
      expect(ROLES.admin.maxSessionDuration).toBe(3600);
      expect(ROLES.preparer.maxSessionDuration).toBe(3600);
      expect(ROLES.reviewer.maxSessionDuration).toBe(3600);
      expect(ROLES['read-only'].maxSessionDuration).toBe(3600);
    });
  });

  describe('hasPermission', () => {
    it('should return true for admin with any valid permission', () => {
      expect(hasPermission('admin', 'reports', 'create')).toBe(true);
      expect(hasPermission('admin', 'reports', 'read')).toBe(true);
      expect(hasPermission('admin', 'reports', 'update')).toBe(true);
      expect(hasPermission('admin', 'reports', 'delete')).toBe(true);
      expect(hasPermission('admin', 'reports', 'approve')).toBe(true);
      expect(hasPermission('admin', 'reports', 'submit')).toBe(true);
    });

    it('should return true for preparer with create/read/update on reports', () => {
      expect(hasPermission('preparer', 'reports', 'create')).toBe(true);
      expect(hasPermission('preparer', 'reports', 'read')).toBe(true);
      expect(hasPermission('preparer', 'reports', 'update')).toBe(true);
    });

    it('should return false for preparer with delete/approve/submit on reports', () => {
      expect(hasPermission('preparer', 'reports', 'delete')).toBe(false);
      expect(hasPermission('preparer', 'reports', 'approve')).toBe(false);
      expect(hasPermission('preparer', 'reports', 'submit')).toBe(false);
    });

    it('should return true for reviewer with read/approve on reports', () => {
      expect(hasPermission('reviewer', 'reports', 'read')).toBe(true);
      expect(hasPermission('reviewer', 'reports', 'approve')).toBe(true);
    });

    it('should return false for reviewer with create/update/delete on reports', () => {
      expect(hasPermission('reviewer', 'reports', 'create')).toBe(false);
      expect(hasPermission('reviewer', 'reports', 'update')).toBe(false);
      expect(hasPermission('reviewer', 'reports', 'delete')).toBe(false);
    });

    it('should return true for read-only with read on reports', () => {
      expect(hasPermission('read-only', 'reports', 'read')).toBe(true);
    });

    it('should return false for read-only with any write permission', () => {
      expect(hasPermission('read-only', 'reports', 'create')).toBe(false);
      expect(hasPermission('read-only', 'reports', 'update')).toBe(false);
      expect(hasPermission('read-only', 'reports', 'delete')).toBe(false);
      expect(hasPermission('read-only', 'reports', 'approve')).toBe(false);
    });

    it('should return false for invalid role', () => {
      expect(hasPermission('invalid' as Role, 'reports', 'read')).toBe(false);
    });

    it('should return false for invalid resource', () => {
      expect(hasPermission('admin', 'invalid-resource', 'read')).toBe(false);
    });

    it('should handle user management permissions correctly', () => {
      expect(hasPermission('admin', 'users', 'create')).toBe(true);
      expect(hasPermission('admin', 'users', 'delete')).toBe(true);
      expect(hasPermission('preparer', 'users', 'create')).toBe(false);
      expect(hasPermission('reviewer', 'users', 'read')).toBe(false);
      expect(hasPermission('read-only', 'users', 'read')).toBe(false);
    });

    it('should handle audit_logs permissions correctly', () => {
      expect(hasPermission('admin', 'audit_logs', 'read')).toBe(true);
      expect(hasPermission('reviewer', 'audit_logs', 'read')).toBe(true);
      expect(hasPermission('preparer', 'audit_logs', 'read')).toBe(false);
      expect(hasPermission('read-only', 'audit_logs', 'read')).toBe(false);
    });
  });

  describe('requiresMFA', () => {
    it('should return true for admin', () => {
      expect(requiresMFA('admin')).toBe(true);
    });

    it('should return true for preparer', () => {
      expect(requiresMFA('preparer')).toBe(true);
    });

    it('should return false for reviewer', () => {
      expect(requiresMFA('reviewer')).toBe(false);
    });

    it('should return false for read-only', () => {
      expect(requiresMFA('read-only')).toBe(false);
    });

    it('should return false for invalid role', () => {
      expect(requiresMFA('invalid' as Role)).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('should return all permissions for a role', () => {
      const adminPermissions = getRolePermissions('admin');
      expect(adminPermissions.length).toBeGreaterThan(0);
      expect(adminPermissions.some(p => p.resource === 'users')).toBe(true);
    });

    it('should return empty array for invalid role', () => {
      const permissions = getRolePermissions('invalid' as Role);
      expect(permissions).toEqual([]);
    });
  });

  describe('isValidRole', () => {
    it('should return true for valid roles', () => {
      expect(isValidRole('admin')).toBe(true);
      expect(isValidRole('preparer')).toBe(true);
      expect(isValidRole('reviewer')).toBe(true);
      expect(isValidRole('read-only')).toBe(true);
    });

    it('should return false for invalid roles', () => {
      expect(isValidRole('invalid')).toBe(false);
      expect(isValidRole('Admin')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole('super-admin')).toBe(false);
    });
  });

  describe('getMaxSessionDuration', () => {
    it('should return 1 hour (3600 seconds) for all roles', () => {
      expect(getMaxSessionDuration('admin')).toBe(3600);
      expect(getMaxSessionDuration('preparer')).toBe(3600);
      expect(getMaxSessionDuration('reviewer')).toBe(3600);
      expect(getMaxSessionDuration('read-only')).toBe(3600);
    });

    it('should return default 3600 for invalid role', () => {
      expect(getMaxSessionDuration('invalid' as Role)).toBe(3600);
    });
  });
});
