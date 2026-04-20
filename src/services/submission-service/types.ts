/**
 * Submission Service Type Definitions
 * 
 * Types for the Sunbiz annual report submission workflow.
 * See: docs/reference/api-contracts.md
 */

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * POST /submit request body
 * CRITICAL: user_approved MUST be true - rejected with 403 otherwise
 */
export interface SubmitRequest {
  company_id: string;
  filing_id: string;
  user_approved: true; // Type-level enforcement - must be literal `true`
}

/**
 * POST /submit response
 */
export interface SubmitResponse {
  status: 'success' | 'error';
  data?: {
    submission_id: string;
    status: SubmissionStatus;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * GET /submission/:id response
 */
export interface SubmissionStatusResponse {
  status: 'success' | 'error';
  data?: {
    submission_id: string;
    status: SubmissionStatus;
    confirmation_number?: string;
    receipt_url?: string;
    error_details?: string;
    created_at: string;
    updated_at: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Domain Types
// ============================================================================

export type SubmissionStatus = 
  | 'pending'
  | 'in_progress'
  | 'awaiting_captcha'
  | 'awaiting_payment'
  | 'confirmed'
  | 'failed'
  | 'manual_escalation';

export interface Company {
  id: string;
  document_number: string;
  entity_name: string;
  principal_address: Address;
  mailing_address: Address;
  registered_agent: RegisteredAgent;
  officers: Officer[];
}

export interface Address {
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface RegisteredAgent {
  name: string;
  address: Address;
}

export interface Officer {
  title: string;
  name: string;
  address: string;
}

export interface Filing {
  id: string;
  company_id: string;
  year: number;
  status: 'draft' | 'ready' | 'submitted' | 'confirmed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  filing_id: string;
  company_id: string;
  status: SubmissionStatus;
  confirmation_number?: string;
  receipt_url?: string;
  screenshot_url?: string;
  html_snapshot_url?: string;
  error_details?: string;
  retry_count: number;
  user_approved: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Audit Types
// ============================================================================

export type AuditActionType =
  | 'submission_initiated'
  | 'submission_approved'
  | 'form_navigation_started'
  | 'field_populated'
  | 'captcha_detected'
  | 'payment_detected'
  | 'user_notified'
  | 'user_resumed'
  | 'confirmation_captured'
  | 'submission_completed'
  | 'submission_failed'
  | 'retry_initiated'
  | 'manual_escalation';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  action_type: AuditActionType;
  entity_type: 'submission' | 'filing' | 'company';
  entity_id: string;
  timestamp: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Automation Types
// ============================================================================

export interface AutomationContext {
  company: Company;
  filing: Filing;
  submission: Submission;
  selectors: SelectorConfig;
}

export interface SelectorConfig {
  version: string;
  filingStart: Record<string, SelectorEntry>;
  entityForm: Record<string, unknown>;
  reviewPage: Record<string, SelectorEntry>;
  signaturePage: Record<string, SelectorEntry>;
  captchaDetection: { indicators: string[] };
  paymentDetection: { indicators: string[] };
  confirmationPage: Record<string, SelectorEntry>;
  errorIndicators: Record<string, string[]>;
}

export interface SelectorEntry {
  primary: string;
  fallback: string;
  labelMatch?: string;
}

export type AutomationStep =
  | 'navigate_to_start'
  | 'enter_document_number'
  | 'load_entity_form'
  | 'populate_principal_address'
  | 'populate_mailing_address'
  | 'populate_registered_agent'
  | 'populate_officers'
  | 'proceed_to_review'
  | 'proceed_to_signature'
  | 'check_captcha'
  | 'check_payment'
  | 'capture_confirmation';

export interface AutomationResult {
  success: boolean;
  step: AutomationStep;
  data?: {
    confirmation_number?: string;
    receipt_url?: string;
    screenshot_path?: string;
    html_snapshot_path?: string;
  };
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  pauseRequired?: 'captcha' | 'payment';
}

// ============================================================================
// Recovery Types
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RecoveryResult {
  recovered: boolean;
  retriesUsed: number;
  finalStatus: SubmissionStatus;
  escalatedToManual: boolean;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 'captcha_required' | 'payment_required' | 'submission_failed' | 'submission_completed';

export interface UserNotification {
  type: NotificationType;
  submission_id: string;
  message: string;
  action_url?: string;
  timestamp: string;
}
