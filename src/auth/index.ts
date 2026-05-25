/**
 * Authentication Module - Public API
 *
 * This module provides OAuth2 authentication, RBAC, and MFA
 * per CONSTITUTION.md Principle VII: Security by Default.
 */

// Role-based access control
export type { Role, Permission, RoleDefinition } from './roles';
export {
  ROLES,
  hasPermission,
  requiresMFA,
  getRolePermissions,
  isValidRole,
  getMaxSessionDuration,
} from './roles';

// Authentication middleware
export type { AuthenticatedUser, AuthMiddlewareOptions } from './middleware';
export {
  withAuth,
  adminOnly,
  preparerOrAbove,
  reviewerOrAbove,
  authenticated,
  authMiddleware,
  protectedRoutes,
  publicRoutes,
  matchesRoute,
} from './middleware';

// MFA (TOTP)
export type { MFASetup, MFAVerificationResult } from './mfa';
export {
  TOTP_CONFIG,
  BACKUP_CODES_CONFIG,
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  generateQRCodeURL,
  setupMFA,
  verifyMFA,
} from './mfa';

// Audit logging
export type { AuthEventType, AuthAuditEvent } from './audit';
export {
  logAuthEvent,
  logLoginSuccess,
  logLoginFailure,
  logMFAChallenge,
  logMFASuccess,
  logMFAFailure,
  logPermissionDenied,
  logTokenRefresh,
  logLogout,
  logBackupCodeUsed,
} from './audit';

// OAuth2 providers
export type { ProviderProfile, SupportedProvider } from './providers';
export {
  getGoogleProvider,
  getMicrosoftProvider,
  getConfiguredProviders,
  SUPPORTED_PROVIDERS,
  isSupportedProvider,
  getProviderDisplayName,
} from './providers';

// NextAuth configuration
export type { ExtendedSession, ExtendedJWT } from './config';
export { JWT_CONFIG, authOptions } from './config';
