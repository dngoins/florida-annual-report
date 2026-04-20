/**
 * Recovery Service
 * 
 * Handles retry logic and manual escalation for failed operations
 * Per AGENTS.md Agent 8: Recovery Agent
 * Per CONSTITUTION.md Principle III: Fail-Safe Automation
 */

import { ErrorClassifier } from './error-classifier';
import { calculateBackoff, sleep, DEFAULT_BACKOFF_CONFIG } from './exponential-backoff';
import {
  RecoveryConfig,
  RecoveryResult,
  OperationContext,
  RetryableOperation,
  Operation,
  OperationStatus,
  RecoveryAuditEntry,
  EscalationNotification,
  FailedOperationFilters,
} from './types';

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Audit logger interface
 */
export interface IAuditLogger {
  log(entry: RecoveryAuditEntry): Promise<void>;
}

/**
 * Notification service interface
 */
export interface INotificationService {
  notifyManualEscalation(data: EscalationNotification): Promise<void>;
  notifyRetryStarted?(data: { operationId: string; retryCount: number }): Promise<void>;
}

/**
 * Filing service interface for operation management
 */
export interface IFilingService {
  getOperation(operationId: string): Promise<Operation | null>;
  updateStatus(filingId: string, status: OperationStatus): Promise<void>;
  updateOperationRetryCount(operationId: string, retryCount: number): Promise<void>;
  getOperationExecutor(operation: Operation): RetryableOperation<unknown>;
  getFailedOperations(filters: FailedOperationFilters): Promise<Operation[]>;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRetries: 3,
  backoff: DEFAULT_BACKOFF_CONFIG,
};

// ============================================================================
// Recovery Service Implementation
// ============================================================================

export class RecoveryService {
  constructor(
    private readonly auditLogger: IAuditLogger,
    private readonly notificationService: INotificationService,
    private readonly filingService: IFilingService,
    private readonly config: RecoveryConfig = DEFAULT_RECOVERY_CONFIG
  ) {}

  /**
   * Execute an operation with automatic retry logic
   * 
   * @param operation - The operation to execute
   * @param context - Operation context for logging/tracking
   * @returns Recovery result with success status and retry count
   */
  async executeWithRetry<T>(
    operation: RetryableOperation<T>,
    context: OperationContext
  ): Promise<RecoveryResult<T>> {
    let lastError: Error | null = null;
    let retriesUsed = 0;

    // Initial attempt
    try {
      const result = await operation();
      return {
        success: true,
        data: result,
        retriesUsed: 0,
        escalated: false,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Classify the error
      const classified = ErrorClassifier.classify(lastError);
      
      // If not transient, escalate immediately
      if (!classified.shouldRetry) {
        await this.escalateToManual(context, `Permanent error: ${lastError.message}`);
        return {
          success: false,
          data: null,
          retriesUsed: 0,
          escalated: true,
          error: {
            code: classified.category.toUpperCase(),
            message: lastError.message,
          },
        };
      }
    }

    // Retry loop
    while (retriesUsed < this.config.maxRetries) {
      retriesUsed++;

      // Log retry attempt
      await this.logRetryAttempt(context, retriesUsed, lastError!);

      // Calculate and wait for backoff delay
      const delay = calculateBackoff(retriesUsed, this.config.backoff);
      await sleep(delay);

      // Attempt retry
      try {
        const result = await operation();
        
        // Log successful retry
        await this.logRetrySuccess(context, retriesUsed);
        
        return {
          success: true,
          data: result,
          retriesUsed,
          escalated: false,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Classify the new error
        const classified = ErrorClassifier.classify(lastError);
        
        // If error is now permanent, stop retrying
        if (!classified.shouldRetry) {
          await this.logRetryFailed(context, retriesUsed, lastError, true);
          await this.escalateToManual(context, `Permanent error after ${retriesUsed} retries: ${lastError.message}`);
          return {
            success: false,
            data: null,
            retriesUsed,
            escalated: true,
            error: {
              code: classified.category.toUpperCase(),
              message: lastError.message,
            },
          };
        }

        // Log failed retry attempt
        await this.logRetryFailed(context, retriesUsed, lastError, false);
      }
    }

    // Max retries exhausted - escalate to manual
    await this.escalateToManual(
      context,
      `Max retries (${this.config.maxRetries}) exhausted. Last error: ${lastError?.message}`
    );

    return {
      success: false,
      data: null,
      retriesUsed,
      escalated: true,
      error: {
        code: 'MAX_RETRIES_EXHAUSTED',
        message: `Operation failed after ${this.config.maxRetries} retries`,
      },
    };
  }

  /**
   * Retry a specific operation by ID
   * Used by POST /retry/:operation_id endpoint
   */
  async retryOperation(operationId: string): Promise<RecoveryResult<unknown>> {
    // Get operation from database
    const operation = await this.filingService.getOperation(operationId);
    
    if (!operation) {
      throw new Error(`Operation not found: ${operationId}`);
    }

    // Check if operation is in a retryable state
    if (!this.isRetryableStatus(operation.status)) {
      const error: any = new Error(`Operation ${operationId} is not in a retryable state`);
      error.code = 'INVALID_STATE';
      throw error;
    }

    // Build operation context
    const context: OperationContext = {
      operationId: operation.id,
      filingId: operation.filing_id,
      companyId: operation.company_id,
      operationType: operation.type,
    };

    // Get the operation executor
    const executor = this.filingService.getOperationExecutor(operation);

    // Execute with retry logic
    return this.executeWithRetry(executor, context);
  }

  /**
   * Escalate an operation to manual mode
   * Sets filing status to manual_required and notifies user
   */
  async escalateToManual(context: OperationContext, reason: string): Promise<void> {
    // Update filing status
    await this.filingService.updateStatus(context.filingId, 'manual_required');

    // Log escalation
    await this.auditLogger.log({
      user_id: 'system',
      action_type: 'manual_escalation',
      entity_type: 'filing',
      entity_id: context.filingId,
      before_state: { status: 'failed' },
      after_state: { status: 'manual_required' },
      metadata: {
        operation_id: context.operationId,
        operation_type: context.operationType,
        reason,
      },
    });

    // Send notification
    await this.notificationService.notifyManualEscalation({
      operation_id: context.operationId,
      filing_id: context.filingId,
      company_id: context.companyId,
      reason,
      retry_count: this.config.maxRetries,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get operation status
   */
  async getOperationStatus(operationId: string): Promise<Operation | null> {
    return this.filingService.getOperation(operationId);
  }

  /**
   * Get all failed operations (for escalation queue)
   */
  async getFailedOperations(filters: FailedOperationFilters = {}): Promise<Operation[]> {
    return this.filingService.getFailedOperations(filters);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Check if operation status allows retry
   */
  private isRetryableStatus(status: OperationStatus): boolean {
    return status === 'failed';
  }

  /**
   * Log a retry attempt to audit log
   */
  private async logRetryAttempt(
    context: OperationContext,
    retryCount: number,
    lastError: Error
  ): Promise<void> {
    await this.auditLogger.log({
      user_id: 'system',
      action_type: 'retry_attempt',
      entity_type: 'operation',
      entity_id: context.operationId,
      before_state: {
        retry_count: retryCount - 1,
        status: 'failed',
      },
      after_state: {
        retry_count: retryCount,
        status: 'retrying',
      },
      metadata: {
        filing_id: context.filingId,
        company_id: context.companyId,
        operation_type: context.operationType,
        last_error: lastError.message,
        delay_ms: calculateBackoff(retryCount, this.config.backoff),
      },
    });

    // Update retry count in database
    await this.filingService.updateOperationRetryCount(context.operationId, retryCount);
  }

  /**
   * Log a successful retry to audit log
   */
  private async logRetrySuccess(
    context: OperationContext,
    retryCount: number
  ): Promise<void> {
    await this.auditLogger.log({
      user_id: 'system',
      action_type: 'retry_success',
      entity_type: 'operation',
      entity_id: context.operationId,
      before_state: {
        retry_count: retryCount,
        status: 'retrying',
      },
      after_state: {
        retry_count: retryCount,
        status: 'completed',
      },
      metadata: {
        filing_id: context.filingId,
        company_id: context.companyId,
        operation_type: context.operationType,
        total_retries: retryCount,
      },
    });
  }

  /**
   * Log a failed retry to audit log
   */
  private async logRetryFailed(
    context: OperationContext,
    retryCount: number,
    error: Error,
    isPermanent: boolean
  ): Promise<void> {
    await this.auditLogger.log({
      user_id: 'system',
      action_type: 'retry_failed',
      entity_type: 'operation',
      entity_id: context.operationId,
      before_state: {
        retry_count: retryCount,
        status: 'retrying',
      },
      after_state: {
        retry_count: retryCount,
        status: isPermanent ? 'escalating' : 'failed',
      },
      metadata: {
        filing_id: context.filingId,
        company_id: context.companyId,
        operation_type: context.operationType,
        error_message: error.message,
        is_permanent: isPermanent,
        classified_as: ErrorClassifier.classify(error).category,
      },
    });
  }
}
