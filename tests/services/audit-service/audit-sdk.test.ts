/**
 * Audit SDK Unit Tests
 * 
 * Tests for the internal SDK/helper used by other services.
 * Verifies write-ahead logging pattern and convenience methods.
 * 
 * @module tests/services/audit-service/audit-sdk.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditSdk, createAuditSdk } from '../../../src/services/audit-service/audit-sdk';
import { AuditService, InMemoryAuditRepository } from '../../../src/services/audit-service';

describe('AuditSdk', () => {
  let repository: InMemoryAuditRepository;
  let service: AuditService;
  let sdk: AuditSdk;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    service = new AuditService(repository);
    sdk = new AuditSdk(service);
  });

  // ==========================================================================
  // Convenience Method Tests
  // ==========================================================================

  describe('Convenience Methods', () => {
    it('should log UPLOAD action via logUpload', async () => {
      const entry = await sdk.logUpload('file-123', 'user@example.com', { filename: 'doc.pdf' });

      expect(entry.action).toBe('UPLOAD');
      expect(entry.entity_id).toBe('file-123');
      expect(entry.actor).toBe('user@example.com');
      expect(entry.payload).toEqual({ filename: 'doc.pdf' });
    });

    it('should log EXTRACT action via logExtract', async () => {
      const entry = await sdk.logExtract('doc-456', 'system', { fields: ['name', 'address'] });

      expect(entry.action).toBe('EXTRACT');
      expect(entry.entity_id).toBe('doc-456');
    });

    it('should log VALIDATE action via logValidate', async () => {
      const entry = await sdk.logValidate('filing-789', 'system', { valid: true });

      expect(entry.action).toBe('VALIDATE');
    });

    it('should log REVIEW action via logReview', async () => {
      const entry = await sdk.logReview('filing-789', 'user@example.com', { approved: true });

      expect(entry.action).toBe('REVIEW');
    });

    it('should log RECONCILE action via logReconcile', async () => {
      const entry = await sdk.logReconcile('company-123', 'system', { matched: true });

      expect(entry.action).toBe('RECONCILE');
    });

    it('should log SUBMIT action via logSubmit', async () => {
      const entry = await sdk.logSubmit('filing-789', 'user@example.com', { sunbiz_ref: 'REF123' });

      expect(entry.action).toBe('SUBMIT');
    });

    it('should log CONFIRM action via logConfirm', async () => {
      const entry = await sdk.logConfirm('filing-789', 'system', { confirmation_number: 'CONF456' });

      expect(entry.action).toBe('CONFIRM');
    });

    it('should log ERROR action via logError with Error object', async () => {
      const error = new Error('Something went wrong');
      const entry = await sdk.logError('filing-789', 'system', error, { step: 'validation' });

      expect(entry.action).toBe('ERROR');
      expect(entry.payload).toMatchObject({
        error_message: 'Something went wrong',
        step: 'validation'
      });
      expect(entry.payload.error_stack).toBeDefined();
    });

    it('should log ERROR action via logError with string', async () => {
      const entry = await sdk.logError('filing-789', 'system', 'Network timeout');

      expect(entry.action).toBe('ERROR');
      expect(entry.payload).toMatchObject({
        error_message: 'Network timeout'
      });
    });

    it('should use custom company_id when provided', async () => {
      const entry = await sdk.logUpload('file-123', 'user@example.com', {}, 'company-999');

      expect(entry.entity_id).toBe('file-123');
      expect(entry.company_id).toBe('company-999');
    });
  });

  // ==========================================================================
  // Write-Ahead Logging Tests (CRITICAL)
  // ==========================================================================

  describe('Write-Ahead Logging (withAuditLog)', () => {
    it('should log audit entry BEFORE executing the action', async () => {
      const executionOrder: string[] = [];

      // Mock the repository to track when insert is called
      const originalInsert = repository.insert.bind(repository);
      repository.insert = async (entry) => {
        executionOrder.push('audit_logged');
        return originalInsert(entry);
      };

      await sdk.withAuditLog(
        'SUBMIT',
        'filing-123',
        'user@example.com',
        async () => {
          executionOrder.push('action_executed');
          return 'result';
        }
      );

      // Verify audit was logged BEFORE action executed
      expect(executionOrder).toEqual(['audit_logged', 'action_executed']);
    });

    it('should return the result of the action function', async () => {
      const result = await sdk.withAuditLog(
        'VALIDATE',
        'filing-123',
        'system',
        async () => {
          return { valid: true, score: 0.95 };
        }
      );

      expect(result).toEqual({ valid: true, score: 0.95 });
    });

    it('should log an ERROR entry when action throws', async () => {
      await expect(
        sdk.withAuditLog(
          'SUBMIT',
          'filing-123',
          'user@example.com',
          async () => {
            throw new Error('Submission failed');
          }
        )
      ).rejects.toThrow('Submission failed');

      // Verify both the initial log and error log were created
      const entries = repository.getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].action).toBe('SUBMIT');
      expect(entries[1].action).toBe('ERROR');
      expect(entries[1].payload).toMatchObject({
        error_message: 'Submission failed',
        original_action: 'SUBMIT'
      });
    });

    it('should include payload in the audit entry', async () => {
      await sdk.withAuditLog(
        'UPLOAD',
        'file-123',
        'user@example.com',
        async () => 'uploaded',
        { filename: 'report.pdf', size: 1024 }
      );

      const entries = repository.getAllEntries();
      expect(entries[0].payload).toMatchObject({
        filename: 'report.pdf',
        size: 1024,
        status: 'started'
      });
    });

    it('should use custom company_id in audit entry', async () => {
      await sdk.withAuditLog(
        'VALIDATE',
        'filing-123',
        'system',
        async () => true,
        {},
        'company-456'
      );

      const entries = repository.getAllEntries();
      expect(entries[0].company_id).toBe('company-456');
    });
  });

  // ==========================================================================
  // getHistory Tests
  // ==========================================================================

  describe('getHistory', () => {
    beforeEach(async () => {
      await sdk.logUpload('file-1', 'user1', {}, 'company-A');
      await sdk.logExtract('file-1', 'system', {}, 'company-A');
      await sdk.logValidate('file-1', 'system', {}, 'company-A');
      await sdk.logUpload('file-2', 'user2', {}, 'company-B');
    });

    it('should retrieve history for a company', async () => {
      const result = await sdk.getHistory('company-A');

      expect(result.entries).toHaveLength(3);
      expect(result.total_count).toBe(3);
    });

    it('should filter by action type', async () => {
      const result = await sdk.getHistory('company-A', { action: 'UPLOAD' });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].action).toBe('UPLOAD');
    });

    it('should filter by actor', async () => {
      const result = await sdk.getHistory('company-A', { actor: 'system' });

      expect(result.entries).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe('createAuditSdk', () => {
    it('should create an AuditSdk instance', () => {
      const newSdk = createAuditSdk(service);

      expect(newSdk).toBeInstanceOf(AuditSdk);
    });

    it('should work with the created instance', async () => {
      const newSdk = createAuditSdk(service);
      const entry = await newSdk.logUpload('file-123', 'user@example.com');

      expect(entry.action).toBe('UPLOAD');
    });
  });
});
