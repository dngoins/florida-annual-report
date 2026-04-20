/**
 * Unit Tests for Auth Audit Logging Module
 * 
 * Tests authentication event logging functionality.
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

describe('Auth Audit Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
  });

  describe('logAuthEvent', () => {
    it('should create an event with required fields', async () => {
      const { logAuthEvent } = await import('../../../src/auth/audit');
      
      const event = await logAuthEvent('login_success', {
        userId: 'user-123',
        userEmail: 'test@example.com',
        success: true,
      });

      expect(event.id).toBeDefined();
      expect(event.id).toMatch(/^auth_/);
      expect(event.timestamp).toBeDefined();
      expect(event.eventType).toBe('login_success');
      expect(event.userId).toBe('user-123');
      expect(event.userEmail).toBe('test@example.com');
      expect(event.success).toBe(true);
    });

    it('should write event to file in JSONL format', async () => {
      const { logAuthEvent } = await import('../../../src/auth/audit');
      
      await logAuthEvent('login_success', {
        userId: 'user-123',
        userEmail: 'test@example.com',
        success: true,
      });

      expect(fs.appendFileSync).toHaveBeenCalled();
      const writeCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toContain('auth_events_');
      expect(writeCall[0]).toContain('.jsonl');
      
      const writtenData = writeCall[1];
      expect(writtenData).toContain('"eventType":"login_success"');
      expect(writtenData.endsWith('\n')).toBe(true);
    });

    it('should create audit directory if it does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      const { logAuthEvent } = await import('../../../src/auth/audit');
      
      await logAuthEvent('login_attempt', {
        userEmail: 'test@example.com',
        success: true,
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('audit_logs'),
        { recursive: true }
      );
    });

    it('should handle file write errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      (fs.appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write failed');
      });

      const { logAuthEvent } = await import('../../../src/auth/audit');
      
      const event = await logAuthEvent('login_success', {
        userId: 'user-123',
        userEmail: 'test@example.com',
        success: true,
      });

      // Should still return the event
      expect(event).toBeDefined();
      expect(event.eventType).toBe('login_success');
      
      // Should log error and fallback to console
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe('Convenience Logging Functions', () => {
    it('should log login success events', async () => {
      const { logLoginSuccess } = await import('../../../src/auth/audit');
      
      const event = await logLoginSuccess(
        'user-123',
        'test@example.com',
        'google',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(event.eventType).toBe('login_success');
      expect(event.userId).toBe('user-123');
      expect(event.provider).toBe('google');
      expect(event.ipAddress).toBe('192.168.1.1');
      expect(event.userAgent).toBe('Mozilla/5.0');
      expect(event.success).toBe(true);
    });

    it('should log login failure events', async () => {
      const { logLoginFailure } = await import('../../../src/auth/audit');
      
      const event = await logLoginFailure(
        'test@example.com',
        'google',
        'Invalid credentials',
        '192.168.1.1'
      );

      expect(event.eventType).toBe('login_failure');
      expect(event.userEmail).toBe('test@example.com');
      expect(event.failureReason).toBe('Invalid credentials');
      expect(event.success).toBe(false);
    });

    it('should log MFA challenge events', async () => {
      const { logMFAChallenge } = await import('../../../src/auth/audit');
      
      const event = await logMFAChallenge(
        'user-123',
        'test@example.com',
        '192.168.1.1'
      );

      expect(event.eventType).toBe('mfa_challenge');
      expect(event.success).toBe(true);
    });

    it('should log MFA success events', async () => {
      const { logMFASuccess } = await import('../../../src/auth/audit');
      
      const event = await logMFASuccess(
        'user-123',
        'test@example.com',
        '192.168.1.1'
      );

      expect(event.eventType).toBe('mfa_success');
      expect(event.success).toBe(true);
    });

    it('should log MFA failure events', async () => {
      const { logMFAFailure } = await import('../../../src/auth/audit');
      
      const event = await logMFAFailure(
        'user-123',
        'test@example.com',
        'Invalid TOTP code',
        '192.168.1.1'
      );

      expect(event.eventType).toBe('mfa_failure');
      expect(event.failureReason).toBe('Invalid TOTP code');
      expect(event.success).toBe(false);
    });

    it('should log permission denied events', async () => {
      const { logPermissionDenied } = await import('../../../src/auth/audit');
      
      const event = await logPermissionDenied(
        'user-123',
        'test@example.com',
        'read-only',
        'reports',
        'create',
        '192.168.1.1'
      );

      expect(event.eventType).toBe('permission_denied');
      expect(event.role).toBe('read-only');
      expect(event.resource).toBe('reports');
      expect(event.action).toBe('create');
      expect(event.success).toBe(false);
      expect(event.failureReason).toContain('read-only');
      expect(event.failureReason).toContain('create');
      expect(event.failureReason).toContain('reports');
    });

    it('should log token refresh events', async () => {
      const { logTokenRefresh } = await import('../../../src/auth/audit');
      
      const event = await logTokenRefresh(
        'user-123',
        'test@example.com',
        '192.168.1.1'
      );

      expect(event.eventType).toBe('token_refresh');
      expect(event.success).toBe(true);
    });

    it('should log logout events', async () => {
      const { logLogout } = await import('../../../src/auth/audit');
      
      const event = await logLogout(
        'user-123',
        'test@example.com',
        '192.168.1.1'
      );

      expect(event.eventType).toBe('logout');
      expect(event.success).toBe(true);
    });

    it('should log backup code usage events', async () => {
      const { logBackupCodeUsed } = await import('../../../src/auth/audit');
      
      const event = await logBackupCodeUsed(
        'user-123',
        'test@example.com',
        '192.168.1.1'
      );

      expect(event.eventType).toBe('backup_code_used');
      expect(event.success).toBe(true);
      expect(event.metadata?.warning).toContain('backup code');
    });
  });

  describe('Event ID Generation', () => {
    it('should generate unique event IDs', async () => {
      const { logAuthEvent } = await import('../../../src/auth/audit');
      
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const event = await logAuthEvent('login_attempt', {
          userEmail: 'test@example.com',
          success: true,
        });
        ids.add(event.id);
      }

      expect(ids.size).toBe(100);
    });

    it('should prefix event IDs with auth_', async () => {
      const { logAuthEvent } = await import('../../../src/auth/audit');
      
      const event = await logAuthEvent('login_attempt', {
        userEmail: 'test@example.com',
        success: true,
      });

      expect(event.id.startsWith('auth_')).toBe(true);
    });
  });

  describe('Timestamp Format', () => {
    it('should use ISO 8601 timestamp format', async () => {
      const { logAuthEvent } = await import('../../../src/auth/audit');
      
      const event = await logAuthEvent('login_attempt', {
        userEmail: 'test@example.com',
        success: true,
      });

      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(event.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });
});
