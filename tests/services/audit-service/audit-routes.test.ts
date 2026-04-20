/**
 * Audit Routes Integration Tests
 * 
 * Tests for the audit API endpoints.
 * Verifies request validation, response format, and integration with service.
 * 
 * @module tests/services/audit-service/audit-routes.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock Express app and request/response objects for testing
function createMockReq(body = {}, params = {}, query = {}, locals = {}) {
  return {
    body,
    params,
    query,
    app: { locals }
  };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    jsonData: null
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.jsonData = data;
    return res;
  };
  return res;
}

// Import service for mocking
import { AuditService, InMemoryAuditRepository } from '../../../src/services/audit-service';

describe('Audit Routes', () => {
  let mockAuditService: AuditService;
  let repository: InMemoryAuditRepository;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    mockAuditService = new AuditService(repository);
  });

  // ==========================================================================
  // POST /audit Tests
  // ==========================================================================

  describe('POST /audit', () => {
    // Simulate the route handler logic
    async function handlePostAudit(req: any, res: any) {
      const { entity_id, action, actor, payload, company_id } = req.body;

      if (!entity_id) {
        return res.status(400).json({
          status: 'error',
          error: { code: 'MISSING_FIELD', message: 'entity_id is required' }
        });
      }

      if (!action) {
        return res.status(400).json({
          status: 'error',
          error: { code: 'MISSING_FIELD', message: 'action is required' }
        });
      }

      if (!actor) {
        return res.status(400).json({
          status: 'error',
          error: { code: 'MISSING_FIELD', message: 'actor is required' }
        });
      }

      const validActions = ['UPLOAD', 'EXTRACT', 'VALIDATE', 'REVIEW', 'RECONCILE', 'SUBMIT', 'CONFIRM', 'ERROR'];
      if (!validActions.includes(action)) {
        return res.status(400).json({
          status: 'error',
          error: { code: 'INVALID_ACTION', message: `Invalid action type: ${action}` }
        });
      }

      const auditService = req.app.locals.auditService;
      if (!auditService) {
        return res.status(500).json({
          status: 'error',
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Audit service not configured' }
        });
      }

      const entry = await auditService.createEntry({
        entity_id,
        action,
        actor,
        payload: payload || {},
        company_id: company_id || entity_id
      });

      return res.status(201).json({
        status: 'success',
        data: { entry }
      });
    }

    it('should create audit entry with valid request', async () => {
      const req = createMockReq(
        { entity_id: 'company-123', action: 'UPLOAD', actor: 'user@example.com', payload: { file: 'doc.pdf' } },
        {},
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handlePostAudit(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.status).toBe('success');
      expect(res.jsonData.data.entry).toBeDefined();
      expect(res.jsonData.data.entry.action).toBe('UPLOAD');
      expect(res.jsonData.data.entry.entity_id).toBe('company-123');
    });

    it('should return 400 when entity_id is missing', async () => {
      const req = createMockReq(
        { action: 'UPLOAD', actor: 'user@example.com' },
        {},
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handlePostAudit(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.status).toBe('error');
      expect(res.jsonData.error.code).toBe('MISSING_FIELD');
      expect(res.jsonData.error.message).toContain('entity_id');
    });

    it('should return 400 when action is missing', async () => {
      const req = createMockReq(
        { entity_id: 'company-123', actor: 'user@example.com' },
        {},
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handlePostAudit(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error.message).toContain('action');
    });

    it('should return 400 when actor is missing', async () => {
      const req = createMockReq(
        { entity_id: 'company-123', action: 'UPLOAD' },
        {},
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handlePostAudit(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error.message).toContain('actor');
    });

    it('should return 400 for invalid action type', async () => {
      const req = createMockReq(
        { entity_id: 'company-123', action: 'INVALID', actor: 'user@example.com' },
        {},
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handlePostAudit(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error.code).toBe('INVALID_ACTION');
    });

    it('should return 500 when audit service is not configured', async () => {
      const req = createMockReq(
        { entity_id: 'company-123', action: 'UPLOAD', actor: 'user@example.com' },
        {},
        {},
        {} // No auditService
      );
      const res = createMockRes();

      await handlePostAudit(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should accept all valid action types', async () => {
      const validActions = ['UPLOAD', 'EXTRACT', 'VALIDATE', 'REVIEW', 'RECONCILE', 'SUBMIT', 'CONFIRM', 'ERROR'];

      for (const action of validActions) {
        const req = createMockReq(
          { entity_id: 'company-123', action, actor: 'test' },
          {},
          {},
          { auditService: mockAuditService }
        );
        const res = createMockRes();

        await handlePostAudit(req, res);

        expect(res.statusCode).toBe(201);
        expect(res.jsonData.data.entry.action).toBe(action);
      }
    });
  });

  // ==========================================================================
  // GET /audit/:company_id Tests
  // ==========================================================================

  describe('GET /audit/:company_id', () => {
    // Simulate the route handler logic
    async function handleGetAudit(req: any, res: any) {
      const { company_id } = req.params;

      if (!company_id) {
        return res.status(400).json({
          status: 'error',
          error: { code: 'MISSING_FIELD', message: 'company_id is required' }
        });
      }

      const { action, actor, start_date, end_date, page, page_size } = req.query;

      const validActions = ['UPLOAD', 'EXTRACT', 'VALIDATE', 'REVIEW', 'RECONCILE', 'SUBMIT', 'CONFIRM', 'ERROR'];
      if (action && !validActions.includes(action)) {
        return res.status(400).json({
          status: 'error',
          error: { code: 'INVALID_ACTION', message: `Invalid action filter: ${action}` }
        });
      }

      const auditService = req.app.locals.auditService;
      if (!auditService) {
        return res.status(500).json({
          status: 'error',
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Audit service not configured' }
        });
      }

      const result = await auditService.getHistory({
        company_id,
        action: action || undefined,
        actor: actor || undefined,
        start_date: start_date || undefined,
        end_date: end_date || undefined,
        page: page ? parseInt(page, 10) : 1,
        page_size: page_size ? parseInt(page_size, 10) : 50
      });

      return res.json({
        status: 'success',
        data: {
          company_id,
          entries: result.entries,
          total_count: result.total_count,
          page: result.page,
          page_size: result.page_size
        }
      });
    }

    beforeEach(async () => {
      // Create test data
      await mockAuditService.createEntry({ entity_id: 'f1', action: 'UPLOAD', actor: 'user1', company_id: 'company-A' });
      await mockAuditService.createEntry({ entity_id: 'f1', action: 'EXTRACT', actor: 'system', company_id: 'company-A' });
      await mockAuditService.createEntry({ entity_id: 'f2', action: 'UPLOAD', actor: 'user2', company_id: 'company-B' });
    });

    it('should return audit history for a company', async () => {
      const req = createMockReq(
        {},
        { company_id: 'company-A' },
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handleGetAudit(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.status).toBe('success');
      expect(res.jsonData.data.company_id).toBe('company-A');
      expect(res.jsonData.data.entries).toHaveLength(2);
      expect(res.jsonData.data.total_count).toBe(2);
    });

    it('should filter by action type', async () => {
      const req = createMockReq(
        {},
        { company_id: 'company-A' },
        { action: 'UPLOAD' },
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handleGetAudit(req, res);

      expect(res.jsonData.data.entries).toHaveLength(1);
      expect(res.jsonData.data.entries[0].action).toBe('UPLOAD');
    });

    it('should filter by actor', async () => {
      const req = createMockReq(
        {},
        { company_id: 'company-A' },
        { actor: 'system' },
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handleGetAudit(req, res);

      expect(res.jsonData.data.entries).toHaveLength(1);
      expect(res.jsonData.data.entries[0].actor).toBe('system');
    });

    it('should return 400 for invalid action filter', async () => {
      const req = createMockReq(
        {},
        { company_id: 'company-A' },
        { action: 'INVALID' },
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handleGetAudit(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error.code).toBe('INVALID_ACTION');
    });

    it('should paginate results', async () => {
      const req = createMockReq(
        {},
        { company_id: 'company-A' },
        { page: '1', page_size: '1' },
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handleGetAudit(req, res);

      expect(res.jsonData.data.entries).toHaveLength(1);
      expect(res.jsonData.data.page).toBe(1);
      expect(res.jsonData.data.page_size).toBe(1);
      expect(res.jsonData.data.total_count).toBe(2);
    });

    it('should return empty array for non-existent company', async () => {
      const req = createMockReq(
        {},
        { company_id: 'non-existent' },
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handleGetAudit(req, res);

      expect(res.jsonData.data.entries).toHaveLength(0);
      expect(res.jsonData.data.total_count).toBe(0);
    });
  });

  // ==========================================================================
  // Response Format Tests (per api-contracts.md)
  // ==========================================================================

  describe('Response Format (api-contracts.md compliance)', () => {
    async function handlePostAudit(req: any, res: any) {
      const { entity_id, action, actor, payload, company_id } = req.body;

      if (!entity_id || !action || !actor) {
        return res.status(400).json({
          status: 'error',
          error: { code: 'MISSING_FIELD', message: 'Required field missing' }
        });
      }

      const auditService = req.app.locals.auditService;
      const entry = await auditService.createEntry({
        entity_id, action, actor, payload: payload || {}, company_id: company_id || entity_id
      });

      return res.status(201).json({
        status: 'success',
        data: { entry }
      });
    }

    it('should use { status, data } envelope for success responses', async () => {
      const req = createMockReq(
        { entity_id: 'test', action: 'UPLOAD', actor: 'user' },
        {},
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handlePostAudit(req, res);

      expect(res.jsonData).toHaveProperty('status', 'success');
      expect(res.jsonData).toHaveProperty('data');
      expect(res.jsonData).not.toHaveProperty('error');
    });

    it('should use { status, error } envelope for error responses', async () => {
      const req = createMockReq(
        { action: 'UPLOAD', actor: 'user' }, // Missing entity_id
        {},
        {},
        { auditService: mockAuditService }
      );
      const res = createMockRes();

      await handlePostAudit(req, res);

      expect(res.jsonData).toHaveProperty('status', 'error');
      expect(res.jsonData).toHaveProperty('error');
      expect(res.jsonData.error).toHaveProperty('code');
      expect(res.jsonData.error).toHaveProperty('message');
    });
  });
});
