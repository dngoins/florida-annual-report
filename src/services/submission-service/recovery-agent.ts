/**
 * Recovery Agent Module
 * 
 * Handles retry logic and manual escalation for submission failures.
 * Per CONSTITUTION.md Principle III: Fail-Safe Automation
 * 
 * Requirements:
 * - Retry up to 3 times with exponential backoff
 * - After 3 retries, escalate to manual mode
 * - All errors must be logged and surfaced
 * - Recovery Agent must always have a path to human intervention
 */

import {
  RetryConfig,
  RecoveryResult,
  SubmissionStatus,
  AutomationResult,
  Submission,
} from './types';
import { 
  IAuditLogger,
  createSubmissionFailedEntry,
  createManualEscalationEntry,
} from './audit-logger';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 30000, // 30 seconds max
};

// ============================================================================
// Recovery Agent Interface
// ============================================================================

export interface IRecoveryAgent {
  /**
   * Attempt to recover from a failed automation step
   * @param submission Current submission state
   * @param lastResult The failed automation result
   * @param retryFn Function to retry the automation
   */
  attemptRecovery(
    submission: Submission,
    lastResult: AutomationResult,
    retryFn: () => Promise<AutomationResult>
  ): Promise<RecoveryResult>;

  /**
   * Escalate to manual mode when recovery is not possible
   */
  escalateToManual(
    submission: Submission,
    reason: string
  ): Promise<void>;
}

// ============================================================================
// Recovery Agent Implementation
// ============================================================================

export class RecoveryAgent implements IRecoveryAgent {
  constructor(
    private readonly auditLogger: IAuditLogger,
    private readonly notificationService: INotificationService,
    private readonly config: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {}

  async attemptRecovery(
    submission: Submission,
    lastResult: AutomationResult,
    retryFn: () => Promise<AutomationResult>
  ): Promise<RecoveryResult> {
    // Check if error is recoverable
    if (!lastResult.error?.recoverable) {
      await this.escalateToManual(
        submission,
        `Non-recoverable error: ${lastResult.error?.message}`
      );
      
      return {
        recovered: false,
        retriesUsed: 0,
        finalStatus: 'manual_escalation',
        escalatedToManual: true,
      };
    }

    let retriesUsed = 0;
    let currentResult = lastResult;

    while (retriesUsed < this.config.maxRetries) {
      retriesUsed++;
      
      // Log retry attempt
      await this.auditLogger.log({
        user_id: 'system',
        action_type: 'retry_initiated',
        entity_type: 'submission',
        entity_id: submission.id,
        before_state: { retry_count: retriesUsed - 1 },
        after_state: { retry_count: retriesUsed },
        metadata: {
          step: currentResult.step,
          error: currentResult.error?.message,
        },
      });

      // Calculate exponential backoff delay
      const delay = this.calculateBackoffDelay(retriesUsed);
      await this.sleep(delay);

      // Attempt retry
      try {
        currentResult = await retryFn();
        
        if (currentResult.success) {
          return {
            recovered: true,
            retriesUsed,
            finalStatus: currentResult.pauseRequired 
              ? (currentResult.pauseRequired === 'captcha' ? 'awaiting_captcha' : 'awaiting_payment')
              : 'in_progress',
            escalatedToManual: false,
          };
        }
      } catch (error) {
        currentResult = {
          success: false,
          step: currentResult.step,
          error: {
            code: 'RETRY_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true,
          },
        };
      }

      // Log failed retry
      await this.auditLogger.log(
        createSubmissionFailedEntry(
          'system',
          submission.id,
          currentResult.error?.code || 'UNKNOWN',
          currentResult.error?.message || 'Unknown error',
          retriesUsed
        )
      );
    }

    // Max retries exhausted - escalate to manual
    await this.escalateToManual(
      submission,
      `Max retries (${this.config.maxRetries}) exhausted. Last error: ${currentResult.error?.message}`
    );

    return {
      recovered: false,
      retriesUsed,
      finalStatus: 'manual_escalation',
      escalatedToManual: true,
    };
  }

  async escalateToManual(submission: Submission, reason: string): Promise<void> {
    // Log escalation
    await this.auditLogger.log(
      createManualEscalationEntry('system', submission.id, reason)
    );

    // Notify user/admin of escalation
    await this.notificationService.notifyManualEscalation({
      submission_id: submission.id,
      filing_id: submission.filing_id,
      company_id: submission.company_id,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(retryCount: number): number {
    // Exponential backoff: baseDelay * 2^(retryCount-1)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, retryCount - 1);
    
    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    
    // Cap at maxDelay
    return Math.min(exponentialDelay + jitter, this.config.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Notification Service Interface
// ============================================================================

export interface INotificationService {
  /**
   * Notify user that CAPTCHA completion is required
   */
  notifyCaptchaRequired(data: NotificationData): Promise<void>;

  /**
   * Notify user that payment completion is required
   */
  notifyPaymentRequired(data: NotificationData): Promise<void>;

  /**
   * Notify user/admin of manual escalation
   */
  notifyManualEscalation(data: EscalationData): Promise<void>;

  /**
   * Notify user of successful submission
   */
  notifySubmissionComplete(data: CompletionData): Promise<void>;
}

export interface NotificationData {
  submission_id: string;
  filing_id: string;
  company_id: string;
  timestamp: string;
}

export interface EscalationData extends NotificationData {
  reason: string;
}

export interface CompletionData extends NotificationData {
  confirmation_number: string;
}

// ============================================================================
// Mock Notification Service (for testing)
// ============================================================================

export class MockNotificationService implements INotificationService {
  public notifications: Array<{type: string; data: unknown}> = [];

  async notifyCaptchaRequired(data: NotificationData): Promise<void> {
    this.notifications.push({ type: 'captcha_required', data });
  }

  async notifyPaymentRequired(data: NotificationData): Promise<void> {
    this.notifications.push({ type: 'payment_required', data });
  }

  async notifyManualEscalation(data: EscalationData): Promise<void> {
    this.notifications.push({ type: 'manual_escalation', data });
  }

  async notifySubmissionComplete(data: CompletionData): Promise<void> {
    this.notifications.push({ type: 'submission_complete', data });
  }

  // Test helper
  clear(): void {
    this.notifications = [];
  }
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Classify errors to determine if they're recoverable
 */
export function classifyError(error: Error): {
  recoverable: boolean;
  category: 'network' | 'selector' | 'validation' | 'system' | 'unknown';
} {
  const message = error.message.toLowerCase();

  // Network errors are recoverable
  if (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('econnreset')
  ) {
    return { recoverable: true, category: 'network' };
  }

  // Selector mismatches need attention but can be retried
  if (
    message.includes('element not found') ||
    message.includes('selector') ||
    message.includes('locator')
  ) {
    return { recoverable: true, category: 'selector' };
  }

  // Validation errors from Sunbiz are not recoverable without user action
  if (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('required field')
  ) {
    return { recoverable: false, category: 'validation' };
  }

  // System errors might be recoverable
  if (
    message.includes('system') ||
    message.includes('internal')
  ) {
    return { recoverable: true, category: 'system' };
  }

  // Default to non-recoverable for unknown errors
  return { recoverable: false, category: 'unknown' };
}
