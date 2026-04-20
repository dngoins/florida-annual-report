/**
 * Audit Service Type Definitions
 * 
 * Types for the append-only audit logging system.
 * Per CONSTITUTION.md Principle IV: Audit Immutability is NON-NEGOTIABLE.
 * 
 * @module services/audit-service/types
 */

// ============================================================================
// Audit Action Types
// ============================================================================

/**
 * All supported audit action types per acceptance criteria
 */
export type AuditActionType =
  | 'UPLOAD'      // Document upload
  | 'EXTRACT'     // Data extraction from documents
  | 'VALIDATE'    // Data validation
  | 'REVIEW'      // User review action
  | 'RECONCILE'   // Data reconciliation
  | 'SUBMIT'      // Submission to Sunbiz
  | 'CONFIRM'     // Confirmation received
  | 'ERROR';      // Error occurred

/**
 * Validation helper for action types
 */
export const VALID_ACTION_TYPES: readonly AuditActionType[] = [
  'UPLOAD', 'EXTRACT', 'VALIDATE', 'REVIEW', 
  'RECONCILE', 'SUBMIT', 'CONFIRM', 'ERROR'
] as const;

export function isValidActionType(action: string): action is AuditActionType {
  return VALID_ACTION_TYPES.includes(action as AuditActionType);
}

// ============================================================================
// Audit Log Entry
// ============================================================================

/**
 * Audit log entry stored in the database
 * All fields are required for compliance
 */
export interface AuditLogEntry {
  /** Unique identifier for the audit entry */
  id: string;
  
  /** ID of the entity being audited (company_id, filing_id, etc.) */
  entity_id: string;
  
  /** Type of action performed */
  action: AuditActionType;
  
  /** User or system that performed the action */
  actor: string;
  
  /** Additional context/data about the action */
  payload: Record<string, unknown>;
  
  /** ISO 8601 timestamp when the action was logged */
  timestamp: string;
  
  /** Company ID for querying audit history */
  company_id: string;
}

/**
 * Input for creating an audit entry (id and timestamp auto-generated)
 */
export interface CreateAuditEntryInput {
  entity_id: string;
  action: AuditActionType;
  actor: string;
  payload?: Record<string, unknown>;
  company_id?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * POST /audit request body
 */
export interface CreateAuditRequest {
  entity_id: string;
  action: string;
  actor: string;
  payload?: Record<string, unknown>;
  company_id?: string;
}

/**
 * Standard API response envelope per api-contracts.md
 */
export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * POST /audit response
 */
export interface CreateAuditResponse {
  entry: AuditLogEntry;
}

/**
 * GET /audit/:company_id response
 */
export interface GetAuditHistoryResponse {
  company_id: string;
  entries: AuditLogEntry[];
  total_count: number;
  page: number;
  page_size: number;
}

/**
 * Query options for retrieving audit history
 */
export interface AuditQueryOptions {
  company_id: string;
  action?: AuditActionType;
  start_date?: string;
  end_date?: string;
  actor?: string;
  page?: number;
  page_size?: number;
}
