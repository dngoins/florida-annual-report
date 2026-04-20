/**
 * Recovery Service Router
 * 
 * REST API endpoints for retry and escalation operations
 * Per docs/reference/api-contracts.md - All responses use { status, data, error } envelope
 */

import { Router, Request, Response, NextFunction } from 'express';
import { RecoveryService } from './recovery-service';
import { OperationContext, FailedOperationFilters } from './types';

// ============================================================================
// API Response Envelope
// ============================================================================

interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
}

function successResponse<T>(data: T): ApiResponse<T> {
  return {
    status: 'success',
    data,
    error: null,
  };
}

function errorResponse(code: string, message: string): ApiResponse<null> {
  return {
    status: 'error',
    data: null,
    error: { code, message },
  };
}

// ============================================================================
// Error Handler
// ============================================================================

function getErrorStatusCode(error: Error): number {
  const message = error.message.toLowerCase();
  const code = (error as any).code;

  if (message.includes('not found') || message.includes('does not exist')) {
    return 404;
  }
  if (code === 'INVALID_STATE' || message.includes('not in a retryable state')) {
    return 400;
  }
  if (message.includes('unauthorized') || message.includes('forbidden')) {
    return 403;
  }
  return 500;
}

function getErrorCode(error: Error, statusCode: number): string {
  const code = (error as any).code;
  if (code) return code;

  switch (statusCode) {
    case 400: return 'BAD_REQUEST';
    case 404: return 'NOT_FOUND';
    case 403: return 'FORBIDDEN';
    default: return 'INTERNAL_ERROR';
  }
}

// ============================================================================
// Router Factory
// ============================================================================

export function createRecoveryRouter(recoveryService: RecoveryService): Router {
  const router = Router();

  /**
   * POST /retry/:operation_id
   * 
   * Manually trigger a retry for a failed operation
   * 
   * Response: RecoveryResult with success status and retry count
   */
  router.post('/retry/:operation_id', async (req: Request, res: Response) => {
    try {
      const { operation_id } = req.params;
      
      const result = await recoveryService.retryOperation(operation_id);
      
      res.status(200).json(successResponse(result));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const statusCode = getErrorStatusCode(err);
      const errorCode = getErrorCode(err, statusCode);
      
      res.status(statusCode).json(errorResponse(errorCode, err.message));
    }
  });

  /**
   * GET /status/:operation_id
   * 
   * Get the status of an operation
   * 
   * Response: Operation details including retry count and status
   */
  router.get('/status/:operation_id', async (req: Request, res: Response) => {
    try {
      const { operation_id } = req.params;
      
      const operation = await recoveryService.getOperationStatus(operation_id);
      
      if (!operation) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Operation not found'));
        return;
      }
      
      res.status(200).json(successResponse(operation));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json(errorResponse('INTERNAL_ERROR', err.message));
    }
  });

  /**
   * GET /failed
   * 
   * Get all failed operations (escalation queue)
   * 
   * Query params:
   * - status: Filter by status (e.g., 'manual_required')
   * - type: Filter by operation type
   * - companyId: Filter by company
   * 
   * Response: Array of failed operations
   */
  router.get('/failed', async (req: Request, res: Response) => {
    try {
      const filters: FailedOperationFilters = {};
      
      if (req.query.status) {
        filters.status = req.query.status as any;
      }
      if (req.query.type) {
        filters.type = req.query.type as any;
      }
      if (req.query.companyId) {
        filters.companyId = req.query.companyId as string;
      }
      if (req.query.fromDate) {
        filters.fromDate = req.query.fromDate as string;
      }
      if (req.query.toDate) {
        filters.toDate = req.query.toDate as string;
      }
      
      const operations = await recoveryService.getFailedOperations(filters);
      
      res.status(200).json(successResponse(operations));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json(errorResponse('INTERNAL_ERROR', err.message));
    }
  });

  /**
   * POST /escalate/:operation_id
   * 
   * Manually escalate an operation to manual mode
   * 
   * Body:
   * - reason?: string - Reason for escalation
   * 
   * Response: Escalation result
   */
  router.post('/escalate/:operation_id', async (req: Request, res: Response) => {
    try {
      const { operation_id } = req.params;
      const { reason = 'Manually escalated by user' } = req.body;
      
      // Get operation details first
      const operation = await recoveryService.getOperationStatus(operation_id);
      
      if (!operation) {
        res.status(404).json(errorResponse('NOT_FOUND', `Operation not found: ${operation_id}`));
        return;
      }
      
      const context: OperationContext = {
        operationId: operation.id,
        filingId: operation.filing_id,
        companyId: operation.company_id,
        operationType: operation.type,
      };
      
      await recoveryService.escalateToManual(context, reason);
      
      res.status(200).json(successResponse({
        success: true,
        newStatus: 'manual_required',
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const statusCode = getErrorStatusCode(err);
      const errorCode = getErrorCode(err, statusCode);
      
      res.status(statusCode).json(errorResponse(errorCode, err.message));
    }
  });

  /**
   * GET /health
   * 
   * Health check endpoint
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json(successResponse({
      service: 'recovery-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    }));
  });

  return router;
}

// Export for direct use
export { Router };
