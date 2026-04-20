/**
 * Unit Tests for Review Queue Module
 * 
 * Tests the human review queue management:
 * - Adding fields to review queue
 * - Retrieving pending reviews
 * - Accepting/rejecting reviewed values
 * - Audit trail for all actions
 * 
 * Per docs/reference/product-requirements.md
 */

import {
  ReviewQueue,
  ReviewQueueItem,
  ReviewDecision,
} from '../../../src/services/validation-service/review-queue';

describe('Review Queue Module', () => {
  let reviewQueue: ReviewQueue;

  beforeEach(() => {
    reviewQueue = new ReviewQueue();
  });

  describe('addToQueue', () => {
    it('should add a field to the review queue', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: {
          ruleBased: 0.6,
          nerModel: 0.7,
          llmSignal: 0.5,
        },
      });

      expect(item.id).toBeDefined();
      expect(item.status).toBe('pending');
      expect(item.fieldName).toBe('entity_name');
      expect(item.extractedValue).toBe('Test Corp');
      expect(item.confidence).toBe(0.65);
    });

    it('should generate unique IDs for each item', () => {
      const item1 = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      const item2 = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'registered_agent',
        extractedValue: 'John Doe',
        confidence: 0.55,
        componentScores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.5 },
      });

      expect(item1.id).not.toBe(item2.id);
    });

    it('should set createdAt timestamp', () => {
      const before = new Date();
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });
      const after = new Date();

      expect(new Date(item.createdAt).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(item.createdAt).getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('getPendingReviews', () => {
    it('should return all pending reviews', () => {
      reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'registered_agent',
        extractedValue: 'John Doe',
        confidence: 0.55,
        componentScores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.5 },
      });

      const pending = reviewQueue.getPendingReviews();
      expect(pending).toHaveLength(2);
      expect(pending.every(item => item.status === 'pending')).toBe(true);
    });

    it('should return empty array when no pending reviews', () => {
      const pending = reviewQueue.getPendingReviews();
      expect(pending).toEqual([]);
    });

    it('should filter by filingId when provided', () => {
      reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      reviewQueue.addToQueue({
        documentId: 'doc-789',
        filingId: 'filing-999',
        fieldName: 'entity_name',
        extractedValue: 'Other Corp',
        confidence: 0.55,
        componentScores: { ruleBased: 0.5, nerModel: 0.6, llmSignal: 0.5 },
      });

      const pending = reviewQueue.getPendingReviews({ filingId: 'filing-456' });
      expect(pending).toHaveLength(1);
      expect(pending[0].filingId).toBe('filing-456');
    });
  });

  describe('reviewField', () => {
    it('should accept a field with corrected value', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      const decision: ReviewDecision = {
        action: 'accept',
        correctedValue: 'Test Corporation LLC',
        reviewerId: 'user-123',
        reason: 'Added full legal suffix',
      };

      const result = reviewQueue.reviewField(item.id, decision);

      expect(result.status).toBe('accepted');
      expect(result.correctedValue).toBe('Test Corporation LLC');
      expect(result.reviewedBy).toBe('user-123');
      expect(result.reviewedAt).toBeDefined();
    });

    it('should accept a field with original value', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      const decision: ReviewDecision = {
        action: 'accept',
        reviewerId: 'user-123',
        reason: 'Value is correct as extracted',
      };

      const result = reviewQueue.reviewField(item.id, decision);

      expect(result.status).toBe('accepted');
      expect(result.correctedValue).toBeUndefined();
      expect(result.finalValue).toBe('Test Corp'); // Original value
    });

    it('should reject a field with reason', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      const decision: ReviewDecision = {
        action: 'reject',
        reviewerId: 'user-123',
        reason: 'Cannot determine correct value from source document',
      };

      const result = reviewQueue.reviewField(item.id, decision);

      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe('Cannot determine correct value from source document');
    });

    it('should throw error for non-existent item', () => {
      expect(() => {
        reviewQueue.reviewField('non-existent-id', {
          action: 'accept',
          reviewerId: 'user-123',
        });
      }).toThrow('Review item not found');
    });

    it('should throw error when reviewing already reviewed item', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      reviewQueue.reviewField(item.id, {
        action: 'accept',
        reviewerId: 'user-123',
      });

      expect(() => {
        reviewQueue.reviewField(item.id, {
          action: 'accept',
          reviewerId: 'user-456',
        });
      }).toThrow('Item has already been reviewed');
    });

    it('should require reviewerId', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      expect(() => {
        reviewQueue.reviewField(item.id, {
          action: 'accept',
          reviewerId: '', // Empty reviewer ID
        });
      }).toThrow('Reviewer ID is required');
    });
  });

  describe('hasUnresolvedFields', () => {
    it('should return true when there are pending reviews', () => {
      reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      expect(reviewQueue.hasUnresolvedFields('filing-456')).toBe(true);
    });

    it('should return true when there are rejected reviews', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      reviewQueue.reviewField(item.id, {
        action: 'reject',
        reviewerId: 'user-123',
        reason: 'Invalid value',
      });

      expect(reviewQueue.hasUnresolvedFields('filing-456')).toBe(true);
    });

    it('should return false when all reviews are accepted', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      reviewQueue.reviewField(item.id, {
        action: 'accept',
        reviewerId: 'user-123',
      });

      expect(reviewQueue.hasUnresolvedFields('filing-456')).toBe(false);
    });

    it('should return false when no reviews exist for filing', () => {
      expect(reviewQueue.hasUnresolvedFields('filing-456')).toBe(false);
    });
  });

  describe('getAuditTrail', () => {
    it('should record all review actions', () => {
      const item = reviewQueue.addToQueue({
        documentId: 'doc-123',
        filingId: 'filing-456',
        fieldName: 'entity_name',
        extractedValue: 'Test Corp',
        confidence: 0.65,
        componentScores: { ruleBased: 0.6, nerModel: 0.7, llmSignal: 0.5 },
      });

      reviewQueue.reviewField(item.id, {
        action: 'accept',
        correctedValue: 'Test Corporation LLC',
        reviewerId: 'user-123',
        reason: 'Added legal suffix',
      });

      const audit = reviewQueue.getAuditTrail(item.id);

      expect(audit).toHaveLength(2); // Creation + Review
      expect(audit[0].action).toBe('created');
      expect(audit[1].action).toBe('reviewed');
      expect(audit[1].reviewerId).toBe('user-123');
    });
  });
});
