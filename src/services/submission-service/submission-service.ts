/**
 * Submission Service
 * 
 * Main orchestrator for Sunbiz annual report submissions.
 * 
 * CRITICAL REQUIREMENTS (per CONSTITUTION.md):
 * 1. NEVER submit without explicit user_approved: true (403 rejection)
 * 2. ALWAYS pause at CAPTCHA and notify user
 * 3. ALWAYS pause at payment and notify user
 * 4. Audit log every action with write-ahead pattern
 * 5. Retry up to 3 times, then escalate to manual
 */

import {
  SubmitRequest,
  SubmitResponse,
  SubmissionStatusResponse,
  Submission,
  SubmissionStatus,
  Company,
  Filing,
  AutomationContext,
  SelectorConfig,
} from './types';
import {
  IAuditLogger,
  createSubmissionInitiatedEntry,
  createCaptchaDetectedEntry,
  createPaymentDetectedEntry,
  createSubmissionCompletedEntry,
  createSubmissionFailedEntry,
} from './audit-logger';
import { IPlaywrightAutomation } from './playwright-automation';
import { IRecoveryAgent, INotificationService } from './recovery-agent';

// ============================================================================
// Submission Service Interface
// ============================================================================

export interface ISubmissionService {
  /**
   * Submit an annual report
   * CRITICAL: Rejects with 403 if user_approved !== true
   */
  submit(request: SubmitRequest, userId: string): Promise<SubmitResponse>;

  /**
   * Get submission status
   */
  getStatus(submissionId: string): Promise<SubmissionStatusResponse>;

  /**
   * Resume submission after user completes CAPTCHA/payment
   */
  resume(submissionId: string, userId: string): Promise<SubmitResponse>;
}

// ============================================================================
// Data Access Interfaces
// ============================================================================

export interface ICompanyRepository {
  getById(companyId: string): Promise<Company | null>;
}

export interface IFilingRepository {
  getById(filingId: string): Promise<Filing | null>;
  updateStatus(filingId: string, status: string): Promise<void>;
}

export interface ISubmissionRepository {
  create(submission: Omit<Submission, 'id' | 'created_at' | 'updated_at'>): Promise<Submission>;
  getById(submissionId: string): Promise<Submission | null>;
  update(submissionId: string, updates: Partial<Submission>): Promise<Submission>;
}

// ============================================================================
// Submission Service Implementation
// ============================================================================

export class SubmissionService implements ISubmissionService {
  constructor(
    private readonly auditLogger: IAuditLogger,
    private readonly automation: IPlaywrightAutomation,
    private readonly recoveryAgent: IRecoveryAgent,
    private readonly notificationService: INotificationService,
    private readonly companyRepo: ICompanyRepository,
    private readonly filingRepo: IFilingRepository,
    private readonly submissionRepo: ISubmissionRepository,
    private readonly selectors: SelectorConfig
  ) {}

  /**
   * Submit an annual report
   * 
   * CRITICAL GATE: This method MUST reject if user_approved !== true
   * This is NON-NEGOTIABLE per CONSTITUTION.md Principle II
   */
  async submit(request: SubmitRequest, userId: string): Promise<SubmitResponse> {
    // =========================================================================
    // APPROVAL GATE - NON-NEGOTIABLE
    // Per CONSTITUTION.md: Submission requires explicit user approval
    // =========================================================================
    if (request.user_approved !== true) {
      return {
        status: 'error',
        error: {
          code: 'APPROVAL_REQUIRED',
          message: 'Submission requires explicit user approval (user_approved: true)',
        },
      };
    }

    try {
      // Validate company exists
      const company = await this.companyRepo.getById(request.company_id);
      if (!company) {
        return {
          status: 'error',
          error: {
            code: 'COMPANY_NOT_FOUND',
            message: `Company not found: ${request.company_id}`,
          },
        };
      }

      // Validate filing exists
      const filing = await this.filingRepo.getById(request.filing_id);
      if (!filing) {
        return {
          status: 'error',
          error: {
            code: 'FILING_NOT_FOUND',
            message: `Filing not found: ${request.filing_id}`,
          },
        };
      }

      // Create submission record
      const submission = await this.submissionRepo.create({
        filing_id: request.filing_id,
        company_id: request.company_id,
        status: 'in_progress',
        retry_count: 0,
        user_approved: true,
      });

      // WRITE-AHEAD LOG: Log submission initiation BEFORE proceeding
      await this.auditLogger.log(
        createSubmissionInitiatedEntry(
          userId,
          submission.id,
          request.company_id,
          request.filing_id,
          true
        )
      );

      // Execute automation workflow
      const context: AutomationContext = {
        company,
        filing,
        submission,
        selectors: this.selectors,
      };

      const result = await this.automation.executeSubmission(context);

      // Handle different outcomes
      if (result.pauseRequired === 'captcha') {
        await this.handleCaptchaPause(submission, userId);
        return {
          status: 'success',
          data: {
            submission_id: submission.id,
            status: 'awaiting_captcha',
          },
        };
      }

      if (result.pauseRequired === 'payment') {
        await this.handlePaymentPause(submission, userId);
        return {
          status: 'success',
          data: {
            submission_id: submission.id,
            status: 'awaiting_payment',
          },
        };
      }

      if (result.success && result.data?.confirmation_number) {
        await this.handleSuccess(submission, result.data.confirmation_number, userId);
        return {
          status: 'success',
          data: {
            submission_id: submission.id,
            status: 'confirmed',
          },
        };
      }

      // Handle failure - attempt recovery
      if (!result.success && result.error) {
        const recoveryResult = await this.recoveryAgent.attemptRecovery(
          submission,
          result,
          () => this.automation.executeSubmission(context)
        );

        if (recoveryResult.recovered) {
          return {
            status: 'success',
            data: {
              submission_id: submission.id,
              status: recoveryResult.finalStatus,
            },
          };
        }

        // Recovery failed - submission is in manual escalation
        await this.submissionRepo.update(submission.id, {
          status: 'manual_escalation',
          error_details: result.error.message,
        });

        return {
          status: 'error',
          error: {
            code: 'SUBMISSION_FAILED',
            message: `Submission failed and escalated to manual mode: ${result.error.message}`,
          },
        };
      }

      // Unexpected state
      return {
        status: 'error',
        error: {
          code: 'UNEXPECTED_STATE',
          message: 'Submission ended in an unexpected state',
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      };
    }
  }

  async getStatus(submissionId: string): Promise<SubmissionStatusResponse> {
    const submission = await this.submissionRepo.getById(submissionId);
    
    if (!submission) {
      return {
        status: 'error',
        error: {
          code: 'SUBMISSION_NOT_FOUND',
          message: `Submission not found: ${submissionId}`,
        },
      };
    }

    return {
      status: 'success',
      data: {
        submission_id: submission.id,
        status: submission.status,
        confirmation_number: submission.confirmation_number,
        receipt_url: submission.receipt_url,
        error_details: submission.error_details,
        created_at: submission.created_at,
        updated_at: submission.updated_at,
      },
    };
  }

  async resume(submissionId: string, userId: string): Promise<SubmitResponse> {
    const submission = await this.submissionRepo.getById(submissionId);
    
    if (!submission) {
      return {
        status: 'error',
        error: {
          code: 'SUBMISSION_NOT_FOUND',
          message: `Submission not found: ${submissionId}`,
        },
      };
    }

    // Only allow resume from awaiting states
    if (submission.status !== 'awaiting_captcha' && submission.status !== 'awaiting_payment') {
      return {
        status: 'error',
        error: {
          code: 'INVALID_STATE',
          message: `Cannot resume submission in state: ${submission.status}`,
        },
      };
    }

    // Log user resume action
    await this.auditLogger.log({
      user_id: userId,
      action_type: 'user_resumed',
      entity_type: 'submission',
      entity_id: submissionId,
      before_state: { status: submission.status },
      after_state: { status: 'in_progress' },
    });

    // Get company and filing for context
    const company = await this.companyRepo.getById(submission.company_id);
    const filing = await this.filingRepo.getById(submission.filing_id);

    if (!company || !filing) {
      return {
        status: 'error',
        error: {
          code: 'DATA_NOT_FOUND',
          message: 'Company or filing data not found',
        },
      };
    }

    const context: AutomationContext = {
      company,
      filing,
      submission,
      selectors: this.selectors,
    };

    // Resume automation
    const result = await this.automation.resumeAfterUserAction(context);

    if (result.success && result.data?.confirmation_number) {
      await this.handleSuccess(submission, result.data.confirmation_number, userId);
      return {
        status: 'success',
        data: {
          submission_id: submission.id,
          status: 'confirmed',
        },
      };
    }

    if (!result.success) {
      return {
        status: 'error',
        error: {
          code: 'RESUME_FAILED',
          message: result.error?.message || 'Failed to resume submission',
        },
      };
    }

    return {
      status: 'success',
      data: {
        submission_id: submission.id,
        status: 'in_progress',
      },
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async handleCaptchaPause(submission: Submission, userId: string): Promise<void> {
    // Log CAPTCHA detection
    await this.auditLogger.log(createCaptchaDetectedEntry(userId, submission.id));

    // Update submission status
    await this.submissionRepo.update(submission.id, {
      status: 'awaiting_captcha',
    });

    // Notify user
    await this.notificationService.notifyCaptchaRequired({
      submission_id: submission.id,
      filing_id: submission.filing_id,
      company_id: submission.company_id,
      timestamp: new Date().toISOString(),
    });
  }

  private async handlePaymentPause(submission: Submission, userId: string): Promise<void> {
    // Log payment detection
    await this.auditLogger.log(createPaymentDetectedEntry(userId, submission.id));

    // Update submission status
    await this.submissionRepo.update(submission.id, {
      status: 'awaiting_payment',
    });

    // Notify user
    await this.notificationService.notifyPaymentRequired({
      submission_id: submission.id,
      filing_id: submission.filing_id,
      company_id: submission.company_id,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleSuccess(
    submission: Submission,
    confirmationNumber: string,
    userId: string
  ): Promise<void> {
    // Log success
    await this.auditLogger.log(
      createSubmissionCompletedEntry(userId, submission.id, confirmationNumber)
    );

    // Update submission
    await this.submissionRepo.update(submission.id, {
      status: 'confirmed',
      confirmation_number: confirmationNumber,
    });

    // Update filing status
    await this.filingRepo.updateStatus(submission.filing_id, 'confirmed');

    // Notify user
    await this.notificationService.notifySubmissionComplete({
      submission_id: submission.id,
      filing_id: submission.filing_id,
      company_id: submission.company_id,
      confirmation_number: confirmationNumber,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Approval Gate Utility (for use in API handlers)
// ============================================================================

/**
 * Validates that the request has explicit user approval
 * Returns error response if approval is missing
 * 
 * This is the CRITICAL approval gate per CONSTITUTION.md Principle II
 */
export function validateApprovalGate(
  userApproved: unknown
): { valid: true } | { valid: false; response: SubmitResponse } {
  if (userApproved !== true) {
    return {
      valid: false,
      response: {
        status: 'error',
        error: {
          code: 'APPROVAL_REQUIRED',
          message: 'Submission requires explicit user approval (user_approved: true). This is a non-negotiable safety requirement.',
        },
      },
    };
  }
  return { valid: true };
}
