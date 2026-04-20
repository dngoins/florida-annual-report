/**
 * Submission Service API Handler
 * 
 * Express-compatible HTTP handlers for the submission service endpoints.
 * See: docs/reference/api-contracts.md
 * 
 * Endpoints:
 * - POST /submit - Submit annual report (requires user_approved: true)
 * - GET /submission/:id - Get submission status
 * - POST /submission/:id/resume - Resume after CAPTCHA/payment
 */

import { Request, Response, Router } from 'express';
import {
  SubmitRequest,
  SubmitResponse,
  SubmissionStatusResponse,
} from './types';
import { SubmissionService, validateApprovalGate } from './submission-service';

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
  body: { status: 'success' | 'error'; data?: T; error?: { code: string; message: string } }
): void {
  res.status(statusCode).json(body);
}

// ============================================================================
// Route Handlers
// ============================================================================

export function createSubmissionRouter(submissionService: SubmissionService): Router {
  const router = Router();

  /**
   * POST /submit
   * 
   * Submit an annual report to Sunbiz.
   * 
   * CRITICAL: Requires user_approved: true in request body.
   * Returns 403 Forbidden if user_approved !== true.
   * 
   * Request body:
   * {
   *   company_id: string,
   *   filing_id: string,
   *   user_approved: true
   * }
   * 
   * Response:
   * {
   *   status: "success" | "error",
   *   data?: { submission_id: string, status: string },
   *   error?: { code: string, message: string }
   * }
   */
  router.post('/submit', async (req: Request, res: Response) => {
    try {
      const { company_id, filing_id, user_approved } = req.body;

      // =====================================================================
      // APPROVAL GATE - NON-NEGOTIABLE
      // Per CONSTITUTION.md Principle II: Human-in-the-Loop
      // Submission REQUIRES explicit user approval
      // =====================================================================
      const approvalCheck = validateApprovalGate(user_approved);
      if (!approvalCheck.valid) {
        // Return 403 Forbidden - approval is required
        return sendResponse(res, 403, approvalCheck.response);
      }

      // Validate required fields
      if (!company_id || typeof company_id !== 'string') {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'INVALID_REQUEST',
            message: 'company_id is required and must be a string',
          },
        });
      }

      if (!filing_id || typeof filing_id !== 'string') {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'INVALID_REQUEST',
            message: 'filing_id is required and must be a string',
          },
        });
      }

      // Get user ID from authenticated session
      const userId = (req as any).user?.id || 'anonymous';

      const request: SubmitRequest = {
        company_id,
        filing_id,
        user_approved: true, // Already validated above
      };

      const result = await submissionService.submit(request, userId);

      if (result.status === 'success') {
        return sendResponse(res, 200, result);
      } else {
        // Map error codes to HTTP status codes
        const statusCode = mapErrorToStatusCode(result.error?.code);
        return sendResponse(res, statusCode, result);
      }
    } catch (error) {
      console.error('POST /submit error:', error);
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
   * GET /submission/:id
   * 
   * Get the status of a submission.
   * 
   * Response:
   * {
   *   status: "success" | "error",
   *   data?: {
   *     submission_id: string,
   *     status: string,
   *     confirmation_number?: string,
   *     receipt_url?: string
   *   },
   *   error?: { code: string, message: string }
   * }
   */
  router.get('/submission/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!id) {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'INVALID_REQUEST',
            message: 'Submission ID is required',
          },
        });
      }

      const result = await submissionService.getStatus(id);

      if (result.status === 'success') {
        return sendResponse(res, 200, result);
      } else {
        const statusCode = result.error?.code === 'SUBMISSION_NOT_FOUND' ? 404 : 500;
        return sendResponse(res, statusCode, result);
      }
    } catch (error) {
      console.error('GET /submission/:id error:', error);
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
   * POST /submission/:id/resume
   * 
   * Resume a submission after user completes CAPTCHA or payment.
   * Only valid for submissions in 'awaiting_captcha' or 'awaiting_payment' status.
   * 
   * Response:
   * {
   *   status: "success" | "error",
   *   data?: { submission_id: string, status: string },
   *   error?: { code: string, message: string }
   * }
   */
  router.post('/submission/:id/resume', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!id) {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'INVALID_REQUEST',
            message: 'Submission ID is required',
          },
        });
      }

      // Get user ID from authenticated session
      const userId = (req as any).user?.id || 'anonymous';

      const result = await submissionService.resume(id, userId);

      if (result.status === 'success') {
        return sendResponse(res, 200, result);
      } else {
        const statusCode = mapErrorToStatusCode(result.error?.code);
        return sendResponse(res, statusCode, result);
      }
    } catch (error) {
      console.error('POST /submission/:id/resume error:', error);
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
// Error Code Mapping
// ============================================================================

function mapErrorToStatusCode(errorCode: string | undefined): number {
  switch (errorCode) {
    case 'APPROVAL_REQUIRED':
      return 403; // Forbidden - user hasn't approved
    case 'COMPANY_NOT_FOUND':
    case 'FILING_NOT_FOUND':
    case 'SUBMISSION_NOT_FOUND':
      return 404; // Not Found
    case 'INVALID_REQUEST':
    case 'INVALID_STATE':
      return 400; // Bad Request
    case 'SUBMISSION_FAILED':
      return 422; // Unprocessable Entity
    default:
      return 500; // Internal Server Error
  }
}

// ============================================================================
// Module Exports
// ============================================================================

export { SubmissionService } from './submission-service';
export { validateApprovalGate } from './submission-service';
export * from './types';
export * from './audit-logger';
export * from './playwright-automation';
export * from './recovery-agent';
