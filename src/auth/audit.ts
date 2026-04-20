/**
 * Authentication Event Audit Logging
 * 
 * Implements audit logging per CONSTITUTION.md Principle IV:
 * "Permanent Audit Trail - append-only audit log"
 * 
 * All auth events are logged to audit_logs directory.
 */

import * as fs from 'fs';
import * as path from 'path';

export type AuthEventType =
  | 'login_attempt'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'mfa_challenge'
  | 'mfa_success'
  | 'mfa_failure'
  | 'token_refresh'
  | 'token_revoked'
  | 'password_reset_request'
  | 'password_reset_success'
  | 'role_changed'
  | 'permission_denied'
  | 'session_expired'
  | 'mfa_setup'
  | 'mfa_disabled'
  | 'backup_code_used';

export interface AuthAuditEvent {
  id: string;
  timestamp: string;
  eventType: AuthEventType;
  userId?: string;
  userEmail?: string;
  role?: string;
  ipAddress?: string;
  userAgent?: string;
  provider?: string;
  resource?: string;
  action?: string;
  success: boolean;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `auth_${timestamp}_${random}`;
}

/**
 * Get the audit log file path for today
 */
function getAuditLogPath(): string {
  const auditDir = path.join(process.cwd(), 'audit_logs', 'auth');
  const today = new Date().toISOString().split('T')[0];
  return path.join(auditDir, `auth_events_${today}.jsonl`);
}

/**
 * Ensure audit log directory exists
 */
function ensureAuditDir(): void {
  const auditDir = path.join(process.cwd(), 'audit_logs', 'auth');
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }
}

/**
 * Log an authentication event (append-only)
 */
export async function logAuthEvent(
  eventType: AuthEventType,
  details: Omit<AuthAuditEvent, 'id' | 'timestamp' | 'eventType'>
): Promise<AuthAuditEvent> {
  const event: AuthAuditEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    eventType,
    ...details,
  };

  // Append-only write per CONSTITUTION.md
  try {
    ensureAuditDir();
    const logPath = getAuditLogPath();
    const logLine = JSON.stringify(event) + '\n';
    fs.appendFileSync(logPath, logLine, { flag: 'a' });
  } catch (error) {
    // Log to console as fallback - never lose audit events
    console.error('[AUDIT] Failed to write auth event to file:', error);
    console.log('[AUDIT]', JSON.stringify(event));
  }

  return event;
}

/**
 * Log a successful login
 */
export async function logLoginSuccess(
  userId: string,
  userEmail: string,
  provider: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('login_success', {
    userId,
    userEmail,
    provider,
    ipAddress,
    userAgent,
    success: true,
  });
}

/**
 * Log a failed login attempt
 */
export async function logLoginFailure(
  userEmail: string,
  provider: string,
  failureReason: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('login_failure', {
    userEmail,
    provider,
    ipAddress,
    userAgent,
    success: false,
    failureReason,
  });
}

/**
 * Log MFA challenge issued
 */
export async function logMFAChallenge(
  userId: string,
  userEmail: string,
  ipAddress?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('mfa_challenge', {
    userId,
    userEmail,
    ipAddress,
    success: true,
  });
}

/**
 * Log MFA verification success
 */
export async function logMFASuccess(
  userId: string,
  userEmail: string,
  ipAddress?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('mfa_success', {
    userId,
    userEmail,
    ipAddress,
    success: true,
  });
}

/**
 * Log MFA verification failure
 */
export async function logMFAFailure(
  userId: string,
  userEmail: string,
  failureReason: string,
  ipAddress?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('mfa_failure', {
    userId,
    userEmail,
    ipAddress,
    success: false,
    failureReason,
  });
}

/**
 * Log permission denied event
 */
export async function logPermissionDenied(
  userId: string,
  userEmail: string,
  role: string,
  resource: string,
  action: string,
  ipAddress?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('permission_denied', {
    userId,
    userEmail,
    role,
    resource,
    action,
    ipAddress,
    success: false,
    failureReason: `Role '${role}' does not have '${action}' permission on '${resource}'`,
  });
}

/**
 * Log token refresh
 */
export async function logTokenRefresh(
  userId: string,
  userEmail: string,
  ipAddress?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('token_refresh', {
    userId,
    userEmail,
    ipAddress,
    success: true,
  });
}

/**
 * Log logout event
 */
export async function logLogout(
  userId: string,
  userEmail: string,
  ipAddress?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('logout', {
    userId,
    userEmail,
    ipAddress,
    success: true,
  });
}

/**
 * Log backup code usage
 */
export async function logBackupCodeUsed(
  userId: string,
  userEmail: string,
  ipAddress?: string
): Promise<AuthAuditEvent> {
  return logAuthEvent('backup_code_used', {
    userId,
    userEmail,
    ipAddress,
    success: true,
    metadata: { warning: 'User used backup code - consider prompting for MFA re-enrollment' },
  });
}
