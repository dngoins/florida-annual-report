/**
 * Validation Service
 * 
 * Main service class that orchestrates:
 * - Field confidence scoring
 * - Review queue management
 * - Submission gating
 * 
 * Per CONSTITUTION.md: Human-in-the-Loop principle
 * Submission MUST be blocked when any field is unresolved
 */

import {
  ComponentScores,
  evaluateAllFields,
  evaluateFieldConfidence,
  generateValidationSummary,
  FieldConfidenceResult,
  CONFIDENCE_THRESHOLD,
} from './confidence-scoring';

import {
  ReviewQueue,
  ReviewQueueItem,
  ReviewDecision,
} from './review-queue';

// ============================================================================
// Types
// ============================================================================

export interface ValidationRequest {
  documentId: string;
  filingId: string;
  fields: Record<string, {
    value: any;
    scores: ComponentScores;
  }>;
  threshold?: number;
}

export interface ValidationResponse {
  status: 'success' | 'error';
  data?: {
    documentId: string;
    filingId: string;
    fields: Record<string, FieldConfidenceResult>;
    summary: {
      totalFields: number;
      validatedFields: number;
      needsReviewFields: number;
      averageConfidence: number;
      lowestConfidence: { fieldName: string; confidence: number } | null;
    };
    canSubmit: boolean;
    reviewQueueItems?: ReviewQueueItem[];
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface ReviewQueueResponse {
  status: 'success' | 'error';
  data?: {
    items: ReviewQueueItem[];
    total: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface ReviewFieldResponse {
  status: 'success' | 'error';
  data?: ReviewQueueItem;
  error?: {
    code: string;
    message: string;
  };
}

export interface SubmissionCheckResponse {
  status: 'success' | 'error';
  httpStatus: number;
  data?: {
    allowed: boolean;
    filingId: string;
    unresolvedCount?: number;
  };
  error?: {
    code: string;
    message: string;
    unresolvedFields?: string[];
  };
}

// ============================================================================
// Validation Service Class
// ============================================================================

export class ValidationService {
  private reviewQueue: ReviewQueue;

  constructor(reviewQueue?: ReviewQueue) {
    this.reviewQueue = reviewQueue || new ReviewQueue();
  }

  /**
   * Validate extraction output and apply confidence scoring
   * 
   * - Evaluates all fields with weighted confidence
   * - Adds low-confidence fields to review queue
   * - Returns validation summary with canSubmit flag
   */
  async validateExtraction(request: ValidationRequest): Promise<ValidationResponse> {
    // Validate required fields
    if (!request.documentId || typeof request.documentId !== 'string') {
      return {
        status: 'error',
        error: {
          code: 'INVALID_REQUEST',
          message: 'documentId is required and must be a string',
        },
      };
    }

    if (!request.filingId || typeof request.filingId !== 'string') {
      return {
        status: 'error',
        error: {
          code: 'INVALID_REQUEST',
          message: 'filingId is required and must be a string',
        },
      };
    }

    if (!request.fields || typeof request.fields !== 'object') {
      return {
        status: 'error',
        error: {
          code: 'INVALID_REQUEST',
          message: 'fields is required and must be an object',
        },
      };
    }

    try {
      const threshold = request.threshold ?? CONFIDENCE_THRESHOLD;

      // Evaluate all fields
      const evaluatedFields = evaluateAllFields(request.fields, threshold);

      // Generate summary
      const summary = generateValidationSummary(evaluatedFields);

      // Add low-confidence fields to review queue
      const reviewQueueItems: ReviewQueueItem[] = [];
      for (const [fieldName, result] of Object.entries(evaluatedFields)) {
        if (result.status === 'needs_review') {
          const queueItem = this.reviewQueue.addToQueue({
            documentId: request.documentId,
            filingId: request.filingId,
            fieldName,
            extractedValue: result.value,
            confidence: result.weightedConfidence,
            componentScores: result.componentScores,
          });
          reviewQueueItems.push(queueItem);
        }
      }

      // Determine if submission is allowed
      const canSubmit = summary.needsReviewFields === 0;

      return {
        status: 'success',
        data: {
          documentId: request.documentId,
          filingId: request.filingId,
          fields: evaluatedFields,
          summary,
          canSubmit,
          reviewQueueItems: reviewQueueItems.length > 0 ? reviewQueueItems : undefined,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred during validation',
        },
      };
    }
  }

  /**
   * Get the review queue, optionally filtered
   */
  async getReviewQueue(options?: {
    filingId?: string;
    documentId?: string;
  }): Promise<ReviewQueueResponse> {
    try {
      const items = this.reviewQueue.getPendingReviews(options);

      return {
        status: 'success',
        data: {
          items,
          total: items.length,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          code: 'QUEUE_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching review queue',
        },
      };
    }
  }

  /**
   * Review a field (accept or reject)
   */
  async reviewField(
    fieldId: string,
    decision: ReviewDecision
  ): Promise<ReviewFieldResponse> {
    // Validate reviewer ID
    if (!decision.reviewerId || decision.reviewerId.trim() === '') {
      return {
        status: 'error',
        error: {
          code: 'INVALID_REQUEST',
          message: 'reviewerId is required',
        },
      };
    }

    try {
      const result = this.reviewQueue.reviewField(fieldId, decision);

      return {
        status: 'success',
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      
      if (message === 'Review item not found') {
        return {
          status: 'error',
          error: {
            code: 'REVIEW_ITEM_NOT_FOUND',
            message: 'The specified review item does not exist',
          },
        };
      }

      if (message === 'Item has already been reviewed') {
        return {
          status: 'error',
          error: {
            code: 'ALREADY_REVIEWED',
            message: 'This item has already been reviewed',
          },
        };
      }

      return {
        status: 'error',
        error: {
          code: 'REVIEW_ERROR',
          message,
        },
      };
    }
  }

  /**
   * Check if submission is allowed for a filing
   * 
   * CRITICAL: Returns 403 if any field is unresolved
   * Per CONSTITUTION.md: Human-in-the-Loop principle
   */
  async checkSubmissionAllowed(filingId: string): Promise<SubmissionCheckResponse> {
    try {
      const hasUnresolved = this.reviewQueue.hasUnresolvedFields(filingId);

      if (hasUnresolved) {
        const unresolvedCount = this.reviewQueue.getUnresolvedCount(filingId);
        const pending = this.reviewQueue.getPendingReviews({ filingId });
        const unresolvedFields = pending.map(item => item.fieldName);

        return {
          status: 'error',
          httpStatus: 403,
          error: {
            code: 'UNRESOLVED_FIELDS',
            message: `Submission blocked: ${unresolvedCount} field(s) require human review`,
            unresolvedFields,
          },
        };
      }

      return {
        status: 'success',
        httpStatus: 200,
        data: {
          allowed: true,
          filingId,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        httpStatus: 500,
        error: {
          code: 'CHECK_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred',
        },
      };
    }
  }

  /**
   * Get resolved values for a filing after human review
   */
  async getResolvedValues(filingId: string): Promise<Record<string, any>> {
    return this.reviewQueue.getResolvedValues(filingId);
  }

  /**
   * Get audit trail for a filing
   */
  async getAuditTrail(filingId: string) {
    return this.reviewQueue.getFilingAuditTrail(filingId);
  }
}
