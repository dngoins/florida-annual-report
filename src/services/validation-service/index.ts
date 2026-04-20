/**
 * Validation Service API Handler
 * 
 * Express-compatible HTTP handlers for the validation service endpoints.
 * Per issue #10 acceptance criteria:
 * - POST /validate - Validate extraction output
 * - GET /review-queue - List pending human reviews
 * - PATCH /review-queue/:field_id - Accept/reject a reviewed value
 * 
 * Endpoints:
 * - POST /validate - Validate extraction output, apply confidence scoring
 * - GET /review-queue - List all fields pending human review
 * - PATCH /review-queue/:field_id - Accept or reject a human-reviewed value
 * - GET /submission-check/:filing_id - Check if submission is allowed (403 if unresolved)
 */

import { Request, Response, Router } from 'express';
import { ValidationService } from './validation-service';

// ============================================================================
// API Response Helpers
// ============================================================================

/**
 * Standard API response envelope
 * Per CLAUDE.md: All REST responses use { status, data, error }
 */
function sendResponse<T>(
  res: Response,
  statusCode: number,
  body: { status: 'success' | 'error'; data?: T; error?: { code: string; message: string; [key: string]: any } }
): void {
  res.status(statusCode).json(body);
}

// ============================================================================
// Route Handlers
// ============================================================================

export function createValidationRouter(validationService?: ValidationService): Router {
  const router = Router();
  const service = validationService || new ValidationService();

  /**
   * POST /validate
   * 
   * Validate extraction output and apply confidence scoring.
   * Fields below threshold are added to review queue.
   * 
   * Request body:
   * {
   *   documentId: string,
   *   filingId: string,
   *   fields: {
   *     [fieldName]: {
   *       value: any,
   *       scores: { ruleBased: number, nerModel: number, llmSignal: number }
   *     }
   *   },
   *   threshold?: number  // Optional, defaults to 0.75
   * }
   * 
   * Response:
   * {
   *   status: "success" | "error",
   *   data?: {
   *     documentId: string,
   *     filingId: string,
   *     fields: { ... evaluated fields ... },
   *     summary: { totalFields, validatedFields, needsReviewFields, ... },
   *     canSubmit: boolean,
   *     reviewQueueItems?: [ ... items added to queue ... ]
   *   },
   *   error?: { code: string, message: string }
   * }
   */
  router.post('/validate', async (req: Request, res: Response) => {
    try {
      const { documentId, filingId, fields, threshold } = req.body;

      const result = await service.validateExtraction({
        documentId,
        filingId,
        fields,
        threshold,
      });

      if (result.status === 'success') {
        return sendResponse(res, 200, result);
      } else {
        return sendResponse(res, 400, result);
      }
    } catch (error) {
      console.error('POST /validate error:', error);
      return sendResponse(res, 500, {
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  });

  /**
   * GET /review-queue
   * 
   * List all fields pending human review.
   * 
   * Query parameters:
   * - filingId?: string - Filter by filing ID
   * - documentId?: string - Filter by document ID
   * 
   * Response:
   * {
   *   status: "success" | "error",
   *   data?: {
   *     items: [ ... pending review items ... ],
   *     total: number
   *   },
   *   error?: { code: string, message: string }
   * }
   */
  router.get('/review-queue', async (req: Request, res: Response) => {
    try {
      const { filingId, documentId } = req.query;

      const result = await service.getReviewQueue({
        filingId: filingId as string | undefined,
        documentId: documentId as string | undefined,
      });

      if (result.status === 'success') {
        return sendResponse(res, 200, result);
      } else {
        return sendResponse(res, 500, result);
      }
    } catch (error) {
      console.error('GET /review-queue error:', error);
      return sendResponse(res, 500, {
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  });

  /**
   * PATCH /review-queue/:field_id
   * 
   * Accept or reject a human-reviewed value.
   * 
   * Request body:
   * {
   *   action: "accept" | "reject",
   *   correctedValue?: any,      // Only for accept - optional corrected value
   *   reviewerId: string,        // Required - who is reviewing
   *   reason?: string            // Optional - reason for decision
   * }
   * 
   * Response:
   * {
   *   status: "success" | "error",
   *   data?: {
   *     id: string,
   *     status: "accepted" | "rejected",
   *     finalValue?: any,
   *     reviewedBy: string,
   *     reviewedAt: string,
   *     ...
   *   },
   *   error?: { code: string, message: string }
   * }
   */
  router.patch('/review-queue/:field_id', async (req: Request, res: Response) => {
    try {
      const { field_id } = req.params;
      const { action, correctedValue, reviewerId, reason } = req.body;

      // Validate action
      if (!action || !['accept', 'reject'].includes(action)) {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'INVALID_REQUEST',
            message: 'action must be "accept" or "reject"',
          },
        });
      }

      // Get reviewer ID from body or authenticated user
      const reviewer = reviewerId || (req as any).user?.id;

      const result = await service.reviewField(field_id, {
        action,
        correctedValue,
        reviewerId: reviewer,
        reason,
      });

      if (result.status === 'success') {
        return sendResponse(res, 200, result);
      } else {
        // Map error codes to HTTP status codes
        const statusCode = result.error?.code === 'REVIEW_ITEM_NOT_FOUND' ? 404 : 400;
        return sendResponse(res, statusCode, result);
      }
    } catch (error) {
      console.error('PATCH /review-queue/:field_id error:', error);
      return sendResponse(res, 500, {
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  });

  /**
   * GET /submission-check/:filing_id
   * 
   * Check if submission is allowed for a filing.
   * Returns 403 Forbidden if any fields are unresolved.
   * 
   * Response (200 - allowed):
   * {
   *   status: "success",
   *   data: { allowed: true, filingId: string }
   * }
   * 
   * Response (403 - blocked):
   * {
   *   status: "error",
   *   error: {
   *     code: "UNRESOLVED_FIELDS",
   *     message: "Submission blocked: X field(s) require human review",
   *     unresolvedFields: [ ... field names ... ]
   *   }
   * }
   */
  router.get('/submission-check/:filing_id', async (req: Request, res: Response) => {
    try {
      const { filing_id } = req.params;

      if (!filing_id) {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'INVALID_REQUEST',
            message: 'Filing ID is required',
          },
        });
      }

      const result = await service.checkSubmissionAllowed(filing_id);

      return sendResponse(res, result.httpStatus, {
        status: result.status,
        data: result.data,
        error: result.error,
      });
    } catch (error) {
      console.error('GET /submission-check/:filing_id error:', error);
      return sendResponse(res, 500, {
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  });

  return router;
}

// ============================================================================
// Module Exports
// ============================================================================

export { ValidationService } from './validation-service';
export * from './confidence-scoring';
export * from './review-queue';
