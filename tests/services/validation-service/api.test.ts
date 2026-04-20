/**
 * Integration Tests for Validation Service API
 * 
 * Tests the API endpoints:
 * - POST /validate
 * - GET /review-queue
 * - PATCH /review-queue/:field_id
 * - Submission blocking (403) when fields are unresolved
 * 
 * Per issue acceptance criteria and CLAUDE.md API conventions
 */

import { Request, Response } from 'express';
import {
  createValidationRouter,
  ValidationService,
} from '../../../src/services/validation-service';

// Mock Express request/response
const mockRequest = (body: any = {}, params: any = {}, query: any = {}): Partial<Request> => ({
  body,
  params,
  query,
  user: { id: 'test-user-123' },
} as any);

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Validation Service API', () => {
  let validationService: ValidationService;

  beforeEach(() => {
    validationService = new ValidationService();
  });

  describe('POST /validate', () => {
    it('should validate extraction output and return summary', async () => {
      const result = await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Florida Test Corp LLC',
            scores: { ruleBased: 0.95, nerModel: 0.92, llmSignal: 0.88 },
          },
          registered_agent_name: {
            value: 'John Smith',
            scores: { ruleBased: 0.90, nerModel: 0.88, llmSignal: 0.85 },
          },
        },
      });

      expect(result.status).toBe('success');
      expect(result.data.documentId).toBe('doc-123');
      expect(result.data.summary.totalFields).toBe(2);
      expect(result.data.summary.validatedFields).toBe(2);
      expect(result.data.summary.needsReviewFields).toBe(0);
    });

    it('should flag fields below confidence threshold', async () => {
      const result = await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Florida Test Corp LLC',
            scores: { ruleBased: 0.95, nerModel: 0.92, llmSignal: 0.88 },
          },
          registered_agent_name: {
            value: 'J. Smith', // Low confidence
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      expect(result.status).toBe('success');
      expect(result.data.summary.validatedFields).toBe(1);
      expect(result.data.summary.needsReviewFields).toBe(1);
      expect(result.data.fields.registered_agent_name.status).toBe('needs_review');
    });

    it('should add low-confidence fields to review queue', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      const queue = await validationService.getReviewQueue();
      expect(queue.data.items.length).toBeGreaterThan(0);
      expect(queue.data.items[0].fieldName).toBe('entity_name');
    });

    it('should return 400 for missing required fields', async () => {
      const result = await validationService.validateExtraction({
        // Missing documentId and filingId
        fields: {},
      } as any);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('INVALID_REQUEST');
    });

    it('should return canSubmit: false when any field needs review', async () => {
      const result = await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      expect(result.data.canSubmit).toBe(false);
    });

    it('should return canSubmit: true when all fields are validated', async () => {
      const result = await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.9, nerModel: 0.9, llmSignal: 0.9 },
          },
        },
      });

      expect(result.data.canSubmit).toBe(true);
    });
  });

  describe('GET /review-queue', () => {
    it('should return all pending review items', async () => {
      // Add items to queue via validation
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
          registered_agent: {
            value: 'Jane Doe',
            scores: { ruleBased: 0.4, nerModel: 0.5, llmSignal: 0.3 },
          },
        },
      });

      const result = await validationService.getReviewQueue();

      expect(result.status).toBe('success');
      expect(result.data.items.length).toBe(2);
      expect(result.data.items.every((item: any) => item.status === 'pending')).toBe(true);
    });

    it('should filter by filingId when provided', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      await validationService.validateExtraction({
        documentId: 'doc-789',
        filingId: 'filing-999',
        fields: {
          entity_name: {
            value: 'Other Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      const result = await validationService.getReviewQueue({ filingId: 'filing-456' });

      expect(result.data.items.length).toBe(1);
      expect(result.data.items[0].filingId).toBe('filing-456');
    });

    it('should return empty array when no pending reviews', async () => {
      const result = await validationService.getReviewQueue();

      expect(result.status).toBe('success');
      expect(result.data.items).toEqual([]);
    });
  });

  describe('PATCH /review-queue/:field_id', () => {
    it('should accept a field with corrected value', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      const queue = await validationService.getReviewQueue();
      const fieldId = queue.data.items[0].id;

      const result = await validationService.reviewField(fieldId, {
        action: 'accept',
        correctedValue: 'Test Corporation LLC',
        reviewerId: 'user-123',
        reason: 'Added full legal name',
      });

      expect(result.status).toBe('success');
      expect(result.data.status).toBe('accepted');
      expect(result.data.finalValue).toBe('Test Corporation LLC');
    });

    it('should accept a field without correction', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      const queue = await validationService.getReviewQueue();
      const fieldId = queue.data.items[0].id;

      const result = await validationService.reviewField(fieldId, {
        action: 'accept',
        reviewerId: 'user-123',
      });

      expect(result.status).toBe('success');
      expect(result.data.finalValue).toBe('Test Corp');
    });

    it('should reject a field', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      const queue = await validationService.getReviewQueue();
      const fieldId = queue.data.items[0].id;

      const result = await validationService.reviewField(fieldId, {
        action: 'reject',
        reviewerId: 'user-123',
        reason: 'Cannot determine from source',
      });

      expect(result.status).toBe('success');
      expect(result.data.status).toBe('rejected');
    });

    it('should return 404 for non-existent field_id', async () => {
      const result = await validationService.reviewField('non-existent-id', {
        action: 'accept',
        reviewerId: 'user-123',
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('REVIEW_ITEM_NOT_FOUND');
    });

    it('should return 400 for missing reviewerId', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      const queue = await validationService.getReviewQueue();
      const fieldId = queue.data.items[0].id;

      const result = await validationService.reviewField(fieldId, {
        action: 'accept',
        reviewerId: '', // Empty reviewer ID
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('INVALID_REQUEST');
    });
  });

  describe('Submission Blocking (403)', () => {
    it('should return 403 when checking submission with unresolved fields', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      const result = await validationService.checkSubmissionAllowed('filing-456');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('UNRESOLVED_FIELDS');
      expect(result.httpStatus).toBe(403);
    });

    it('should allow submission when all fields are resolved', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.9, nerModel: 0.9, llmSignal: 0.9 },
          },
        },
      });

      const result = await validationService.checkSubmissionAllowed('filing-456');

      expect(result.status).toBe('success');
      expect(result.data.allowed).toBe(true);
    });

    it('should allow submission after human review accepts all fields', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      // Initially blocked
      let result = await validationService.checkSubmissionAllowed('filing-456');
      expect(result.httpStatus).toBe(403);

      // Accept the field
      const queue = await validationService.getReviewQueue({ filingId: 'filing-456' });
      await validationService.reviewField(queue.data.items[0].id, {
        action: 'accept',
        reviewerId: 'user-123',
      });

      // Now allowed
      result = await validationService.checkSubmissionAllowed('filing-456');
      expect(result.status).toBe('success');
      expect(result.data.allowed).toBe(true);
    });

    it('should block submission when any field is rejected', async () => {
      await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.4 },
          },
        },
      });

      const queue = await validationService.getReviewQueue({ filingId: 'filing-456' });
      await validationService.reviewField(queue.data.items[0].id, {
        action: 'reject',
        reviewerId: 'user-123',
        reason: 'Cannot determine value',
      });

      const result = await validationService.checkSubmissionAllowed('filing-456');
      expect(result.httpStatus).toBe(403);
      expect(result.error?.code).toBe('UNRESOLVED_FIELDS');
    });
  });

  describe('API Response Format', () => {
    it('should use standard envelope format { status, data, error }', async () => {
      const result = await validationService.validateExtraction({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fields: {
          entity_name: {
            value: 'Test Corp',
            scores: { ruleBased: 0.9, nerModel: 0.9, llmSignal: 0.9 },
          },
        },
      });

      expect(result).toHaveProperty('status');
      expect(['success', 'error']).toContain(result.status);
      if (result.status === 'success') {
        expect(result).toHaveProperty('data');
      } else {
        expect(result).toHaveProperty('error');
      }
    });
  });
});
