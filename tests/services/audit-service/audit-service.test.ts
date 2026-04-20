/**
 * Audit Service Unit Tests
 * 
 * Tests for the core AuditService functionality.
 * Verifies append-only enforcement per CONSTITUTION.md Principle IV.
 * 
 * @module tests/services/audit-service/audit-service.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  AuditService,
  InMemoryAuditRepository,
  IAuditRepository,
} from '../../../src/services/audit-service';
import { AuditActionType, VALID_ACTION_TYPES, isValidActionType } from '../../../src/services/audit-service/types';

describe('AuditService', () => {
  let repository: InMemoryAuditRepository;
  let service: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    service = new AuditService(repository);
  });

  // ==========================================================================
  // Append-Only Enforcement Tests (CRITICAL for CONSTITUTION.md compliance)
  // ==========================================================================

  describe('Append-Only Enforcement', () => {
    it('should NOT expose any update method on IAuditRepository interface', () => {
      // Verify the repository interface does not have update method
      const repoMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(repository));
      expect(repoMethods).not.toContain('update');
      expect(repoMethods).not.toContain('updateEntry');
      expect(repoMethods).not.toContain('modify');
    });

    it('should NOT expose any delete method on IAuditRepository interface', () => {
      // Verify the repository interface does not have delete method
      const repoMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(repository));
      expect(repoMethods).not.toContain('delete');
      expect(repoMethods).not.toContain('deleteEntry');
      expect(repoMethods).not.toContain('remove');
    });

    it('should NOT expose any update method on AuditService', () => {
      const serviceMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
      expect(serviceMethods).not.toContain('update');
      expect(serviceMethods).not.toContain('updateEntry');
      expect(serviceMethods).not.toContain('modify');
    });

    it('should NOT expose any delete method on AuditService', () => {
      const serviceMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
      expect(serviceMethods).not.toContain('delete');
      expect(serviceMethods).not.toContain('deleteEntry');
      expect(serviceMethods).not.toContain('remove');
    });

    it('should only allow insert operations for writing', async () => {
      // The only way to write is through createEntry
      const entry = await service.createEntry({
        entity_id: 'company-123',
        action: 'UPLOAD',
        actor: 'user@example.com',
        payload: { filename: 'report.pdf' }
      });

      // Verify the entry was created
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();

      // Verify it's in the repository
      const allEntries = repository.getAllEntries();
      expect(allEntries).toHaveLength(1);
      expect(allEntries[0].id).toBe(entry.id);
    });
  });

  // ==========================================================================
  // createEntry Tests
  // ==========================================================================

  describe('createEntry', () => {
    it('should create an audit entry with all required fields', async () => {
      const entry = await service.createEntry({
        entity_id: 'company-123',
        action: 'UPLOAD',
        actor: 'user@example.com',
        payload: { filename: 'report.pdf' }
      });

      expect(entry.id).toMatch(/^audit_\d+_[a-z0-9]+$/);
      expect(entry.entity_id).toBe('company-123');
      expect(entry.action).toBe('UPLOAD');
      expect(entry.actor).toBe('user@example.com');
      expect(entry.payload).toEqual({ filename: 'report.pdf' });
      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });

    it('should default company_id to entity_id when not provided', async () => {
      const entry = await service.createEntry({
        entity_id: 'company-123',
        action: 'VALIDATE',
        actor: 'system'
      });

      expect(entry.company_id).toBe('company-123');
    });

    it('should use provided company_id when specified', async () => {
      const entry = await service.createEntry({
        entity_id: 'filing-456',
        action: 'SUBMIT',
        actor: 'user@example.com',
        company_id: 'company-123'
      });

      expect(entry.entity_id).toBe('filing-456');
      expect(entry.company_id).toBe('company-123');
    });

    it('should default payload to empty object when not provided', async () => {
      const entry = await service.createEntry({
        entity_id: 'company-123',
        action: 'REVIEW',
        actor: 'user@example.com'
      });

      expect(entry.payload).toEqual({});
    });

    it('should validate all action types', async () => {
      for (const actionType of VALID_ACTION_TYPES) {
        const entry = await service.createEntry({
          entity_id: `test-${actionType}`,
          action: actionType,
          actor: 'test'
        });
        expect(entry.action).toBe(actionType);
      }
    });

    it('should reject invalid action types', async () => {
      await expect(service.createEntry({
        entity_id: 'company-123',
        action: 'INVALID_ACTION' as AuditActionType,
        actor: 'user@example.com'
      })).rejects.toThrow('Invalid action type');
    });

    it('should generate unique IDs for each entry', async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const entry = await service.createEntry({
          entity_id: 'company-123',
          action: 'UPLOAD',
          actor: 'test'
        });
        expect(ids.has(entry.id)).toBe(false);
        ids.add(entry.id);
      }
    });
  });

  // ==========================================================================
  // getHistory Tests
  // ==========================================================================

  describe('getHistory', () => {
    beforeEach(async () => {
      // Create test entries
      await service.createEntry({ entity_id: 'filing-1', action: 'UPLOAD', actor: 'user1', company_id: 'company-A' });
      await service.createEntry({ entity_id: 'filing-1', action: 'EXTRACT', actor: 'system', company_id: 'company-A' });
      await service.createEntry({ entity_id: 'filing-1', action: 'VALIDATE', actor: 'system', company_id: 'company-A' });
      await service.createEntry({ entity_id: 'filing-2', action: 'UPLOAD', actor: 'user2', company_id: 'company-B' });
    });

    it('should return entries for a specific company', async () => {
      const result = await service.getHistory({ company_id: 'company-A' });

      expect(result.entries).toHaveLength(3);
      expect(result.total_count).toBe(3);
      expect(result.entries.every(e => e.company_id === 'company-A')).toBe(true);
    });

    it('should filter by action type', async () => {
      const result = await service.getHistory({
        company_id: 'company-A',
        action: 'UPLOAD'
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].action).toBe('UPLOAD');
    });

    it('should filter by actor', async () => {
      const result = await service.getHistory({
        company_id: 'company-A',
        actor: 'system'
      });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.actor === 'system')).toBe(true);
    });

    it('should paginate results', async () => {
      // Add more entries
      for (let i = 0; i < 10; i++) {
        await service.createEntry({
          entity_id: `filing-${i}`,
          action: 'REVIEW',
          actor: 'user',
          company_id: 'company-A'
        });
      }

      const page1 = await service.getHistory({
        company_id: 'company-A',
        page: 1,
        page_size: 5
      });

      const page2 = await service.getHistory({
        company_id: 'company-A',
        page: 2,
        page_size: 5
      });

      expect(page1.entries).toHaveLength(5);
      expect(page2.entries).toHaveLength(5);
      expect(page1.page).toBe(1);
      expect(page2.page).toBe(2);
      expect(page1.total_count).toBe(13); // 3 original + 10 new
    });

    it('should return entries in chronological order', async () => {
      const result = await service.getHistory({ company_id: 'company-A' });

      for (let i = 1; i < result.entries.length; i++) {
        const prev = new Date(result.entries[i - 1].timestamp);
        const curr = new Date(result.entries[i].timestamp);
        expect(prev.getTime()).toBeLessThanOrEqual(curr.getTime());
      }
    });

    it('should return empty array for non-existent company', async () => {
      const result = await service.getHistory({ company_id: 'non-existent' });

      expect(result.entries).toHaveLength(0);
      expect(result.total_count).toBe(0);
    });
  });

  // ==========================================================================
  // getEntry Tests
  // ==========================================================================

  describe('getEntry', () => {
    it('should return entry by ID', async () => {
      const created = await service.createEntry({
        entity_id: 'company-123',
        action: 'UPLOAD',
        actor: 'user@example.com'
      });

      const retrieved = await service.getEntry(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.entity_id).toBe('company-123');
    });

    it('should return null for non-existent ID', async () => {
      const result = await service.getEntry('non-existent-id');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Type Validation Tests
  // ==========================================================================

  describe('isValidActionType', () => {
    it('should return true for valid action types', () => {
      expect(isValidActionType('UPLOAD')).toBe(true);
      expect(isValidActionType('EXTRACT')).toBe(true);
      expect(isValidActionType('VALIDATE')).toBe(true);
      expect(isValidActionType('REVIEW')).toBe(true);
      expect(isValidActionType('RECONCILE')).toBe(true);
      expect(isValidActionType('SUBMIT')).toBe(true);
      expect(isValidActionType('CONFIRM')).toBe(true);
      expect(isValidActionType('ERROR')).toBe(true);
    });

    it('should return false for invalid action types', () => {
      expect(isValidActionType('INVALID')).toBe(false);
      expect(isValidActionType('upload')).toBe(false); // case sensitive
      expect(isValidActionType('')).toBe(false);
      expect(isValidActionType('DELETE')).toBe(false);
    });
  });
});
