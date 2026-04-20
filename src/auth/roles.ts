/**
 * RBAC Role Definitions and Permissions
 * 
 * Implements role-based access control per CONSTITUTION.md Principle VII
 * and risk-compliance.md security requirements.
 * 
 * Roles: admin, preparer, reviewer, read-only
 */

export type Role = 'admin' | 'preparer' | 'reviewer' | 'read-only';

export interface Permission {
  resource: string;
  actions: ('create' | 'read' | 'update' | 'delete' | 'approve' | 'submit')[];
}

export interface RoleDefinition {
  name: Role;
  displayName: string;
  description: string;
  permissions: Permission[];
  requiresMFA: boolean;
  maxSessionDuration: number; // in seconds
}

/**
 * Role definitions with explicit permissions
 */
export const ROLES: Record<Role, RoleDefinition> = {
  admin: {
    name: 'admin',
    displayName: 'Administrator',
    description: 'Full system access including user management and configuration',
    permissions: [
      { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'reports', actions: ['create', 'read', 'update', 'delete', 'approve', 'submit'] },
      { resource: 'submissions', actions: ['create', 'read', 'update', 'delete', 'approve', 'submit'] },
      { resource: 'audit_logs', actions: ['read'] },
      { resource: 'settings', actions: ['read', 'update'] },
      { resource: 'companies', actions: ['create', 'read', 'update', 'delete'] },
    ],
    requiresMFA: true,
    maxSessionDuration: 3600, // 1 hour
  },
  preparer: {
    name: 'preparer',
    displayName: 'Report Preparer',
    description: 'Can create and edit reports, submit for review',
    permissions: [
      { resource: 'reports', actions: ['create', 'read', 'update'] },
      { resource: 'submissions', actions: ['create', 'read', 'update'] },
      { resource: 'companies', actions: ['read', 'update'] },
    ],
    requiresMFA: true,
    maxSessionDuration: 3600, // 1 hour
  },
  reviewer: {
    name: 'reviewer',
    displayName: 'Report Reviewer',
    description: 'Can review and approve reports for submission',
    permissions: [
      { resource: 'reports', actions: ['read', 'approve'] },
      { resource: 'submissions', actions: ['read', 'approve'] },
      { resource: 'companies', actions: ['read'] },
      { resource: 'audit_logs', actions: ['read'] },
    ],
    requiresMFA: false,
    maxSessionDuration: 3600, // 1 hour
  },
  'read-only': {
    name: 'read-only',
    displayName: 'Read-Only Viewer',
    description: 'Can only view reports and submissions',
    permissions: [
      { resource: 'reports', actions: ['read'] },
      { resource: 'submissions', actions: ['read'] },
      { resource: 'companies', actions: ['read'] },
    ],
    requiresMFA: false,
    maxSessionDuration: 3600, // 1 hour
  },
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(
  role: Role,
  resource: string,
  action: Permission['actions'][number]
): boolean {
  const roleDefinition = ROLES[role];
  if (!roleDefinition) {
    return false;
  }

  return roleDefinition.permissions.some(
    (permission) =>
      permission.resource === resource && permission.actions.includes(action)
  );
}

/**
 * Check if a role requires MFA
 */
export function requiresMFA(role: Role): boolean {
  const roleDefinition = ROLES[role];
  return roleDefinition?.requiresMFA ?? false;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Permission[] {
  const roleDefinition = ROLES[role];
  return roleDefinition?.permissions ?? [];
}

/**
 * Validate that a role string is a valid Role type
 */
export function isValidRole(role: string): role is Role {
  return ['admin', 'preparer', 'reviewer', 'read-only'].includes(role);
}

/**
 * Get the maximum session duration for a role
 */
export function getMaxSessionDuration(role: Role): number {
  const roleDefinition = ROLES[role];
  return roleDefinition?.maxSessionDuration ?? 3600;
}
