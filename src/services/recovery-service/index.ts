/**
 * Recovery Service
 * 
 * Agent 8: Recovery Agent
 * Handles retry logic and manual escalation for failed operations
 * 
 * Per CONSTITUTION.md Principle III: Fail-Safe Automation
 * Per AGENTS.md Agent 8: Recovery Agent
 * 
 * Features:
 * - Retry failed operations up to 3 times with exponential backoff
 * - Categorize errors: transient (retry) vs permanent (escalate)
 * - On max retries: set filing status to manual_required, notify user
 * - POST /retry/:operation_id endpoint for manual retry
 * - All retry attempts logged to audit_logs
 * - No silent failures - every error surfaces to user or escalation queue
 */

// Main service
export {
  RecoveryService,
  IAuditLogger,
  INotificationService,
  IFilingService,
  DEFAULT_RECOVERY_CONFIG,
} from './recovery-service';

// Error classification
export {
  ErrorClassifier,
  ErrorCategory,
  ClassifiedError,
} from './error-classifier';

// Exponential backoff
export {
  calculateBackoff,
  applyJitter,
  calculateAllDelays,
  estimateTotalWaitTime,
  backoffSleep,
  sleep,
  DEFAULT_BACKOFF_CONFIG,
  BackoffConfig,
} from './exponential-backoff';

// Router
export { createRecoveryRouter } from './router';

// Types
export {
  RecoveryConfig,
  RecoveryResult,
  OperationContext,
  RetryableOperation,
  Operation,
  OperationStatus,
  OperationType,
  RecoveryAuditEntry,
  EscalationNotification,
  FailedOperationFilters,
} from './types';
