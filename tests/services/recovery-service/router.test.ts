/**
 * Recovery Service Router Tests
 * 
 * Integration tests for REST API endpoints
 * Per CLAUDE.md: All new endpoints need integration tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';
import { createRecoveryRouter } from '../../../src/services/recovery-service/router';
import { RecoveryService } from '../../../src/services/recovery-service';

// ============================================================================
// Mock Dependencies
// ============================================================================

const mockRecoveryService = {
  retryOperation: jest.fn(),
  getOperationStatus: jest.fn(),
  getFailedOperations: jest.fn(),
  escalateToManual: jest.fn(),
};

// ============================================================================
// Test Setup
// ============================================================================

describe('Recovery Service Router', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/recovery', createRecoveryRouter(mockRecoveryService as any));
  });

  // ==========================================================================
  // POST /retry/:operation_id
  // ==========================================================================

  describe('POST /retry/:operation_id', () => {
    it('should return 200 with recovery result on successful retry', async () => {
      mockRecoveryService.retryOperation.mockResolvedValue({
        success: true,
        data: { confirmationNumber: 'FL-2024-12345' },
        retriesUsed: 1,
        escalated: false,
      });

      const response = await request(app)
        .post('/recovery/retry/op-123')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        data: {
          success: true,
          data: { confirmationNumber: 'FL-2024-12345' },
          retriesUsed: 1,
          escalated: false,
        },
        error: null,
      });
      expect(mockRecoveryService.retryOperation).toHaveBeenCalledWith('op-123');
    });

    it('should return 200 with escalation info when retry fails and escalates', async () => {
      mockRecoveryService.retryOperation.mockResolvedValue({
        success: false,
        data: null,
        retriesUsed: 3,
        escalated: true,
        error: {
          code: 'MAX_RETRIES_EXHAUSTED',
          message: 'Operation escalated to manual mode after 3 retries',
        },
      });

      const response = await request(app)
        .post('/recovery/retry/op-456')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.escalated).toBe(true);
      expect(response.body.data.retriesUsed).toBe(3);
    });

    it('should return 404 when operation not found', async () => {
      mockRecoveryService.retryOperation.mockRejectedValue(
        new Error('Operation not found: op-nonexistent')
      );

      const response = await request(app)
        .post('/recovery/retry/op-nonexistent')
        .send();

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        status: 'error',
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: 'Operation not found: op-nonexistent',
        },
      });
    });

    it('should return 400 when operation is not in retryable state', async () => {
      const error: any = new Error('Operation op-123 is not in a retryable state');
      error.code = 'INVALID_STATE';
      mockRecoveryService.retryOperation.mockRejectedValue(error);

      const response = await request(app)
        .post('/recovery/retry/op-123')
        .send();

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        status: 'error',
        data: null,
        error: {
          code: 'INVALID_STATE',
          message: 'Operation op-123 is not in a retryable state',
        },
      });
    });

    it('should return 500 on unexpected server error', async () => {
      mockRecoveryService.retryOperation.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/recovery/retry/op-123')
        .send();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        status: 'error',
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Database connection failed',
        },
      });
    });
  });

  // ==========================================================================
  // GET /status/:operation_id
  // ==========================================================================

  describe('GET /status/:operation_id', () => {
    it('should return operation status', async () => {
      mockRecoveryService.getOperationStatus.mockResolvedValue({
        id: 'op-123',
        filing_id: 'filing-456',
        company_id: 'company-789',
        type: 'submission',
        status: 'failed',
        last_error: 'Network timeout',
        retry_count: 2,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:05:00Z',
      });

      const response = await request(app)
        .get('/recovery/status/op-123')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        data: {
          id: 'op-123',
          filing_id: 'filing-456',
          company_id: 'company-789',
          type: 'submission',
          status: 'failed',
          last_error: 'Network timeout',
          retry_count: 2,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:05:00Z',
        },
        error: null,
      });
    });

    it('should return 404 when operation not found', async () => {
      mockRecoveryService.getOperationStatus.mockResolvedValue(null);

      const response = await request(app)
        .get('/recovery/status/op-nonexistent')
        .send();

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        status: 'error',
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: 'Operation not found',
        },
      });
    });
  });

  // ==========================================================================
  // GET /failed
  // ==========================================================================

  describe('GET /failed', () => {
    it('should return list of failed operations', async () => {
      mockRecoveryService.getFailedOperations.mockResolvedValue([
        {
          id: 'op-1',
          filing_id: 'filing-1',
          status: 'failed',
          last_error: 'Timeout',
          retry_count: 3,
        },
        {
          id: 'op-2',
          filing_id: 'filing-2',
          status: 'manual_required',
          last_error: 'Validation error',
          retry_count: 0,
        },
      ]);

      const response = await request(app)
        .get('/recovery/failed')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].id).toBe('op-1');
      expect(response.body.data[1].id).toBe('op-2');
    });

    it('should support filtering by status', async () => {
      mockRecoveryService.getFailedOperations.mockResolvedValue([
        {
          id: 'op-2',
          filing_id: 'filing-2',
          status: 'manual_required',
          last_error: 'Validation error',
          retry_count: 0,
        },
      ]);

      const response = await request(app)
        .get('/recovery/failed?status=manual_required')
        .send();

      expect(response.status).toBe(200);
      expect(mockRecoveryService.getFailedOperations).toHaveBeenCalledWith({
        status: 'manual_required',
      });
    });

    it('should return empty array when no failed operations', async () => {
      mockRecoveryService.getFailedOperations.mockResolvedValue([]);

      const response = await request(app)
        .get('/recovery/failed')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });
  });

  // ==========================================================================
  // POST /escalate/:operation_id
  // ==========================================================================

  describe('POST /escalate/:operation_id', () => {
    it('should escalate operation to manual mode', async () => {
      mockRecoveryService.escalateToManual.mockResolvedValue({
        success: true,
        newStatus: 'manual_required',
      });

      const response = await request(app)
        .post('/recovery/escalate/op-123')
        .send({ reason: 'User requested manual handling' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        data: {
          success: true,
          newStatus: 'manual_required',
        },
        error: null,
      });
      expect(mockRecoveryService.escalateToManual).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: 'op-123' }),
        'User requested manual handling'
      );
    });

    it('should use default reason if not provided', async () => {
      mockRecoveryService.escalateToManual.mockResolvedValue({
        success: true,
        newStatus: 'manual_required',
      });

      const response = await request(app)
        .post('/recovery/escalate/op-123')
        .send({});

      expect(response.status).toBe(200);
      expect(mockRecoveryService.escalateToManual).toHaveBeenCalledWith(
        expect.anything(),
        'Manually escalated by user'
      );
    });

    it('should return 404 when operation not found', async () => {
      mockRecoveryService.escalateToManual.mockRejectedValue(
        new Error('Operation not found: op-nonexistent')
      );

      const response = await request(app)
        .post('/recovery/escalate/op-nonexistent')
        .send({ reason: 'Test escalation' });

      expect(response.status).toBe(404);
    });
  });
});

// ============================================================================
// API Response Envelope Tests
// ============================================================================

describe('API Response Envelope', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/recovery', createRecoveryRouter(mockRecoveryService as any));
  });

  it('should always include status, data, and error fields', async () => {
    mockRecoveryService.getOperationStatus.mockResolvedValue({
      id: 'op-123',
      status: 'completed',
    });

    const response = await request(app)
      .get('/recovery/status/op-123')
      .send();

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('error');
  });

  it('should set error to null on success', async () => {
    mockRecoveryService.getOperationStatus.mockResolvedValue({
      id: 'op-123',
      status: 'completed',
    });

    const response = await request(app)
      .get('/recovery/status/op-123')
      .send();

    expect(response.body.status).toBe('success');
    expect(response.body.error).toBeNull();
  });

  it('should set data to null on error', async () => {
    mockRecoveryService.getOperationStatus.mockResolvedValue(null);

    const response = await request(app)
      .get('/recovery/status/op-nonexistent')
      .send();

    expect(response.body.status).toBe('error');
    expect(response.body.data).toBeNull();
    expect(response.body.error).not.toBeNull();
  });
});
