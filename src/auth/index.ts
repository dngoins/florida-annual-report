/**
 * Authentication Module - Public API
 * 
 * This module provides OAuth2 authentication, RBAC, and MFA
 * per CONSTITUTION.md Principle VII: Security by Default.
 */

// Role-based access control
export {
  Role,
  Permission,
  RoleDefinition,
  ROLES,
  hasPermission,
  requiresMFA,
  getRolePermissions,
  isValidRole,
  getMaxSessionDuration,
} from './roles';

// Authentication middleware
export {
  AuthenticatedUser,
  AuthMiddlewareOptions,
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
export {
  TOTP_CONFIG,
  BACKUP_CODES_CONFIG,
  MFASetup,
  MFAVerificationResult,
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
export {
  AuthEventType,
  AuthAuditEvent,
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
export {
  ProviderProfile,
  getGoogleProvider,
  getMicrosoftProvider,
  getConfiguredProviders,
  SUPPORTED_PROVIDERS,
  SupportedProvider,
  isSupportedProvider,
  getProviderDisplayName,
} from './providers';

// NextAuth configuration
export {
  JWT_CONFIG,
  ExtendedSession,
  ExtendedJWT,
  authOptions,
} from './config';
