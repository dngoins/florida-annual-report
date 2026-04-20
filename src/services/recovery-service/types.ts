/**
 * Recovery Service Types
 * 
 * Type definitions for retry logic and manual escalation
 * Per AGENTS.md Agent 8: Recovery Agent
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for exponential backoff
 */
export interface BackoffConfig {
  /** Base delay in milliseconds for first retry */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential growth (default: 2) */
  multiplier: number;
  /** Jitter factor (0-1) to add randomness to delays */
  jitterFactor: number;
}

/**
 * Configuration for recovery service
 */
export interface RecoveryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Backoff configuration */
  backoff: BackoffConfig;
}

// ============================================================================
// Operation Types
// ============================================================================

/**
 * Context for an operation being recovered
 */
export interface OperationContext {
  /** Unique operation identifier */
  operationId: string;
  /** Associated filing ID */
  filingId: string;
  /** Associated company ID */
  companyId: string;
  /** Type of operation (e.g., 'submission', 'extraction', 'validation') */
  operationType: OperationType;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export type OperationType = 
  | 'submission'
  | 'extraction'
  | 'validation'
  | 'reconciliation'
  | 'document_upload';

/**
 * Status of an operation
 */
export type OperationStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'manual_required'
  | 'awaiting_captcha'
  | 'awaiting_payment';

/**
 * Operation record from database
 */
export interface Operation {
  id: string;
  filing_id: string;
  company_id: string;
  type: OperationType;
  status: OperationStatus;
  last_error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Recovery Result Types
// ============================================================================

/**
 * Result of a recovery attempt
 */
export interface RecoveryResult<T = unknown> {
  /** Whether the operation ultimately succeeded */
  success: boolean;
  /** Result data if successful */
  data: T | null;
  /** Number of retries used */
  retriesUsed: number;
  /** Whether the operation was escalated to manual mode */
  escalated: boolean;
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Function signature for retryable operations
 */
export type RetryableOperation<T> = () => Promise<T>;

// ============================================================================
// Error Classification Types
// ============================================================================

/**
 * Categories of errors
 */
export enum ErrorCategory {
  /** Network-related errors (timeout, connection refused) */
  NETWORK = 'network',
  /** Rate limiting / throttling */
  RATE_LIMIT = 'rate_limit',
  /** Service unavailable (maintenance, overload) */
  SERVICE_UNAVAILABLE = 'service_unavailable',
  /** Selector/element not found (page loading issues) */
  SELECTOR = 'selector',
  /** Database errors (lock, busy) */
  DATABASE = 'database',
  /** Validation errors (invalid data) */
  VALIDATION = 'validation',
  /** Authentication/authorization errors */
  AUTHENTICATION = 'authentication',
  /** Unknown/unclassified errors */
  UNKNOWN = 'unknown',
}

/**
 * Classified error with retry recommendation
 */
export interface ClassifiedError {
  /** Original error */
  originalError: Error;
  /** Error category */
  category: ErrorCategory;
  /** Whether this is a transient (temporary) error */
  isTransient: boolean;
  /** Whether the operation should be retried */
  shouldRetry: boolean;
  /** Recommended wait time before retry (ms) */
  recommendedDelay?: number;
}

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Data for manual escalation notification
 */
export interface EscalationNotification {
  operation_id: string;
  filing_id: string;
  company_id: string;
  reason: string;
  error_details?: string;
  retry_count: number;
  timestamp: string;
}

// ============================================================================
// Audit Log Types
// ============================================================================

/**
 * Audit log entry for recovery actions
 */
export interface RecoveryAuditEntry {
  user_id: string;
  action_type: 
    | 'retry_attempt'
    | 'retry_success'
    | 'retry_failed'
    | 'manual_escalation';
  entity_type: 'operation' | 'filing';
  entity_id: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Filters for querying failed operations
 */
export interface FailedOperationFilters {
  /** Filter by status */
  status?: OperationStatus;
  /** Filter by operation type */
  type?: OperationType;
  /** Filter by company ID */
  companyId?: string;
  /** Filter by date range (start) */
  fromDate?: string;
  /** Filter by date range (end) */
  toDate?: string;
}
