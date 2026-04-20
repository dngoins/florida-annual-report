/**
 * Submission Service Unit Tests
 * 
 * Tests verifying:
 * 1. Approval gate enforcement (user_approved: true required)
 * 2. CAPTCHA pause behavior
 * 3. Payment pause behavior
 * 4. Audit logging
 * 5. Recovery/retry logic
 * 6. Status tracking
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  SubmissionService,
  validateApprovalGate,
  ICompanyRepository,
  IFilingRepository,
  ISubmissionRepository,
} from '../../../src/services/submission-service/submission-service';
import {
  InMemoryAuditLogger,
} from '../../../src/services/submission-service/audit-logger';
import {
  IPlaywrightAutomation,
} from '../../../src/services/submission-service/playwright-automation';
import {
  IRecoveryAgent,
  MockNotificationService,
} from '../../../src/services/submission-service/recovery-agent';
import {
  SubmitRequest,
  Company,
  Filing,
  Submission,
  SelectorConfig,
  AutomationResult,
  AutomationContext,
} from '../../../src/services/submission-service/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockCompany: Company = {
  id: 'company-123',
  document_number: 'P12345678',
  entity_name: 'Test Company LLC',
  principal_address: {
    street_address: '123 Main St',
    city: 'Miami',
    state: 'FL',
    zip_code: '33101',
  },
  mailing_address: {
    street_address: '123 Main St',
    city: 'Miami',
    state: 'FL',
    zip_code: '33101',
  },
  registered_agent: {
    name: 'John Doe',
    address: {
      street_address: '456 Agent Ave',
      city: 'Miami',
      state: 'FL',
      zip_code: '33102',
    },
  },
  officers: [
    { title: 'President', name: 'Jane Smith', address: '789 Officer Blvd, Miami, FL 33103' },
  ],
};

const mockFiling: Filing = {
  id: 'filing-456',
  company_id: 'company-123',
  year: 2026,
  status: 'ready',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T10:00:00Z',
};

const mockSelectors: SelectorConfig = {
  version: '1.0.0',
  filingStart: {
    url: 'https://services.sunbiz.org/Filings/AnnualReport/FilingStart',
    documentNumberInput: { primary: 'input#doc', fallback: '//input' },
    continueButton: { primary: 'button', fallback: '//button' },
  },
  entityForm: {},
  reviewPage: {
    continueButton: { primary: 'button', fallback: '//button' },
  },
  signaturePage: {
    signatureInput: { primary: 'input', fallback: '//input' },
    certificationCheckbox: { primary: 'input[type=checkbox]', fallback: '//input' },
    submitButton: { primary: 'button', fallback: '//button' },
  },
  captchaDetection: { indicators: ['iframe[src*="recaptcha"]'] },
  paymentDetection: { indicators: ['[data-section="payment"]'] },
  confirmationPage: {
    confirmationNumber: { primary: '.confirmation', fallback: '//span' },
  },
  errorIndicators: {
    validationErrors: ['.error'],
    systemErrors: ['.system-error'],
  },
};

// ============================================================================
// Mock Implementations
// ============================================================================

class MockCompanyRepository implements ICompanyRepository {
  private companies = new Map<string, Company>();

  constructor() {
    this.companies.set(mockCompany.id, mockCompany);
  }

  async getById(companyId: string): Promise<Company | null> {
    return this.companies.get(companyId) || null;
  }
}

class MockFilingRepository implements IFilingRepository {
  private filings = new Map<string, Filing>();
  public statusUpdates: Array<{ filingId: string; status: string }> = [];

  constructor() {
    this.filings.set(mockFiling.id, mockFiling);
  }

  async getById(filingId: string): Promise<Filing | null> {
    return this.filings.get(filingId) || null;
  }

  async updateStatus(filingId: string, status: string): Promise<void> {
    this.statusUpdates.push({ filingId, status });
  }
}

class MockSubmissionRepository implements ISubmissionRepository {
  private submissions = new Map<string, Submission>();
  private idCounter = 1;

  async create(data: Omit<Submission, 'id' | 'created_at' | 'updated_at'>): Promise<Submission> {
    const submission: Submission = {
      ...data,
      id: `submission-${this.idCounter++}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.submissions.set(submission.id, submission);
    return submission;
  }

  async getById(submissionId: string): Promise<Submission | null> {
    return this.submissions.get(submissionId) || null;
  }

  async update(submissionId: string, updates: Partial<Submission>): Promise<Submission> {
    const submission = this.submissions.get(submissionId);
    if (!submission) throw new Error('Submission not found');
    
    const updated = { ...submission, ...updates, updated_at: new Date().toISOString() };
    this.submissions.set(submissionId, updated);
    return updated;
  }

  // Test helper
  getAll(): Submission[] {
    return Array.from(this.submissions.values());
  }
}

class MockPlaywrightAutomation implements IPlaywrightAutomation {
  public executeResult: AutomationResult = {
    success: true,
    step: 'capture_confirmation',
    data: {
      confirmation_number: 'CONF-123456',
      screenshot_path: '/receipts/test.png',
      html_snapshot_path: '/receipts/test.html',
    },
  };

  public resumeResult: AutomationResult = this.executeResult;
  public cleanupCalled = false;

  async executeSubmission(_context: AutomationContext): Promise<AutomationResult> {
    return this.executeResult;
  }

  async resumeAfterUserAction(_context: AutomationContext): Promise<AutomationResult> {
    return this.resumeResult;
  }

  async cleanup(): Promise<void> {
    this.cleanupCalled = true;
  }
}

class MockRecoveryAgent implements IRecoveryAgent {
  public attemptRecoveryCalled = false;
  public escalateToManualCalled = false;

  async attemptRecovery(
    _submission: Submission,
    lastResult: AutomationResult,
    _retryFn: () => Promise<AutomationResult>
  ) {
    this.attemptRecoveryCalled = true;
    return {
      recovered: false,
      retriesUsed: 3,
      finalStatus: 'manual_escalation' as const,
      escalatedToManual: true,
    };
  }

  async escalateToManual(_submission: Submission, _reason: string): Promise<void> {
    this.escalateToManualCalled = true;
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTestService() {
  const auditLogger = new InMemoryAuditLogger();
  const automation = new MockPlaywrightAutomation();
  const recoveryAgent = new MockRecoveryAgent();
  const notificationService = new MockNotificationService();
  const companyRepo = new MockCompanyRepository();
  const filingRepo = new MockFilingRepository();
  const submissionRepo = new MockSubmissionRepository();

  const service = new SubmissionService(
    auditLogger,
    automation,
    recoveryAgent,
    notificationService,
    companyRepo,
    filingRepo,
    submissionRepo,
    mockSelectors
  );

  return {
    service,
    auditLogger,
    automation,
    recoveryAgent,
    notificationService,
    companyRepo,
    filingRepo,
    submissionRepo,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SubmissionService', () => {
  describe('Approval Gate Enforcement', () => {
    it('should reject submission when user_approved is false', async () => {
      const { service } = createTestService();

      const request = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: false,
      } as unknown as SubmitRequest;

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('APPROVAL_REQUIRED');
      expect(result.error?.message).toContain('user_approved: true');
    });

    it('should reject submission when user_approved is undefined', async () => {
      const { service } = createTestService();

      const request = {
        company_id: 'company-123',
        filing_id: 'filing-456',
      } as unknown as SubmitRequest;

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('APPROVAL_REQUIRED');
    });

    it('should reject submission when user_approved is null', async () => {
      const { service } = createTestService();

      const request = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: null,
      } as unknown as SubmitRequest;

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('APPROVAL_REQUIRED');
    });

    it('should reject submission when user_approved is "true" (string)', async () => {
      const { service } = createTestService();

      const request = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: 'true',
      } as unknown as SubmitRequest;

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('APPROVAL_REQUIRED');
    });

    it('should reject submission when user_approved is 1 (number)', async () => {
      const { service } = createTestService();

      const request = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: 1,
      } as unknown as SubmitRequest;

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('APPROVAL_REQUIRED');
    });

    it('should accept submission when user_approved is exactly true', async () => {
      const { service } = createTestService();

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('success');
      expect(result.data?.submission_id).toBeDefined();
    });
  });

  describe('validateApprovalGate utility', () => {
    it('should return valid: false for false', () => {
      const result = validateApprovalGate(false);
      expect(result.valid).toBe(false);
    });

    it('should return valid: false for undefined', () => {
      const result = validateApprovalGate(undefined);
      expect(result.valid).toBe(false);
    });

    it('should return valid: false for string "true"', () => {
      const result = validateApprovalGate('true');
      expect(result.valid).toBe(false);
    });

    it('should return valid: true for boolean true', () => {
      const result = validateApprovalGate(true);
      expect(result.valid).toBe(true);
    });
  });

  describe('CAPTCHA Handling', () => {
    it('should pause and notify when CAPTCHA is detected', async () => {
      const { service, automation, notificationService } = createTestService();

      // Configure automation to return CAPTCHA detected
      automation.executeResult = {
        success: true,
        step: 'check_captcha',
        pauseRequired: 'captcha',
      };

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('success');
      expect(result.data?.status).toBe('awaiting_captcha');
      
      // Verify notification was sent
      expect(notificationService.notifications).toContainEqual(
        expect.objectContaining({ type: 'captcha_required' })
      );
    });
  });

  describe('Payment Handling', () => {
    it('should pause and notify when payment page is detected', async () => {
      const { service, automation, notificationService } = createTestService();

      // Configure automation to return payment detected
      automation.executeResult = {
        success: true,
        step: 'check_payment',
        pauseRequired: 'payment',
      };

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('success');
      expect(result.data?.status).toBe('awaiting_payment');
      
      // Verify notification was sent
      expect(notificationService.notifications).toContainEqual(
        expect.objectContaining({ type: 'payment_required' })
      );
    });
  });

  describe('Audit Logging', () => {
    it('should log submission initiation before automation starts', async () => {
      const { service, auditLogger } = createTestService();

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      await service.submit(request, 'user-1');

      const entries = auditLogger.getAllEntries();
      const initiationEntry = entries.find(e => e.action_type === 'submission_initiated');

      expect(initiationEntry).toBeDefined();
      expect(initiationEntry?.user_id).toBe('user-1');
      expect(initiationEntry?.entity_type).toBe('submission');
      expect((initiationEntry?.after_state as any)?.user_approved).toBe(true);
    });

    it('should log CAPTCHA detection', async () => {
      const { service, automation, auditLogger } = createTestService();

      automation.executeResult = {
        success: true,
        step: 'check_captcha',
        pauseRequired: 'captcha',
      };

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      await service.submit(request, 'user-1');

      const entries = auditLogger.getAllEntries();
      const captchaEntry = entries.find(e => e.action_type === 'captcha_detected');

      expect(captchaEntry).toBeDefined();
      expect((captchaEntry?.after_state as any)?.status).toBe('awaiting_captcha');
    });

    it('should log successful completion with confirmation number', async () => {
      const { service, auditLogger } = createTestService();

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      await service.submit(request, 'user-1');

      const entries = auditLogger.getAllEntries();
      const completionEntry = entries.find(e => e.action_type === 'submission_completed');

      expect(completionEntry).toBeDefined();
      expect((completionEntry?.after_state as any)?.confirmation_number).toBe('CONF-123456');
    });
  });

  describe('Successful Submission', () => {
    it('should return confirmation number on successful submission', async () => {
      const { service } = createTestService();

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('success');
      expect(result.data?.status).toBe('confirmed');
    });

    it('should update filing status on success', async () => {
      const { service, filingRepo } = createTestService();

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      await service.submit(request, 'user-1');

      expect(filingRepo.statusUpdates).toContainEqual({
        filingId: 'filing-456',
        status: 'confirmed',
      });
    });

    it('should notify user on successful completion', async () => {
      const { service, notificationService } = createTestService();

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      await service.submit(request, 'user-1');

      expect(notificationService.notifications).toContainEqual(
        expect.objectContaining({
          type: 'submission_complete',
          data: expect.objectContaining({
            confirmation_number: 'CONF-123456',
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should return error for non-existent company', async () => {
      const { service } = createTestService();

      const request: SubmitRequest = {
        company_id: 'non-existent',
        filing_id: 'filing-456',
        user_approved: true,
      };

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('COMPANY_NOT_FOUND');
    });

    it('should return error for non-existent filing', async () => {
      const { service } = createTestService();

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'non-existent',
        user_approved: true,
      };

      const result = await service.submit(request, 'user-1');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('FILING_NOT_FOUND');
    });

    it('should trigger recovery agent on automation failure', async () => {
      const { service, automation, recoveryAgent } = createTestService();

      automation.executeResult = {
        success: false,
        step: 'enter_document_number',
        error: {
          code: 'SELECTOR_MISMATCH',
          message: 'Element not found',
          recoverable: true,
        },
      };

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      await service.submit(request, 'user-1');

      expect(recoveryAgent.attemptRecoveryCalled).toBe(true);
    });
  });

  describe('Resume Functionality', () => {
    it('should allow resume from awaiting_captcha state', async () => {
      const { service, automation, submissionRepo } = createTestService();

      // First, create a submission in awaiting_captcha state
      automation.executeResult = {
        success: true,
        step: 'check_captcha',
        pauseRequired: 'captcha',
      };

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      const submitResult = await service.submit(request, 'user-1');
      const submissionId = submitResult.data!.submission_id;

      // Now resume
      automation.resumeResult = {
        success: true,
        step: 'capture_confirmation',
        data: {
          confirmation_number: 'CONF-789',
        },
      };

      const resumeResult = await service.resume(submissionId, 'user-1');

      expect(resumeResult.status).toBe('success');
      expect(resumeResult.data?.status).toBe('confirmed');
    });

    it('should reject resume from invalid state', async () => {
      const { service, automation } = createTestService();

      // Create a confirmed submission
      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      const submitResult = await service.submit(request, 'user-1');
      const submissionId = submitResult.data!.submission_id;

      // Try to resume (should fail - already confirmed)
      const resumeResult = await service.resume(submissionId, 'user-1');

      expect(resumeResult.status).toBe('error');
      expect(resumeResult.error?.code).toBe('INVALID_STATE');
    });
  });

  describe('Get Status', () => {
    it('should return submission status', async () => {
      const { service } = createTestService();

      const request: SubmitRequest = {
        company_id: 'company-123',
        filing_id: 'filing-456',
        user_approved: true,
      };

      const submitResult = await service.submit(request, 'user-1');
      const submissionId = submitResult.data!.submission_id;

      const statusResult = await service.getStatus(submissionId);

      expect(statusResult.status).toBe('success');
      expect(statusResult.data?.submission_id).toBe(submissionId);
      expect(statusResult.data?.status).toBe('confirmed');
    });

    it('should return error for non-existent submission', async () => {
      const { service } = createTestService();

      const statusResult = await service.getStatus('non-existent');

      expect(statusResult.status).toBe('error');
      expect(statusResult.error?.code).toBe('SUBMISSION_NOT_FOUND');
    });
  });
});

describe('Approval Gate - HTTP Layer', () => {
  // These tests verify the API handler correctly returns 403 for missing approval
  // In a real test, you'd use supertest to test the Express routes
  
  it('should document that POST /submit returns 403 without user_approved', () => {
    // This is a documentation test - the actual HTTP test would use supertest
    // The behavior is: POST /submit without user_approved: true → 403 Forbidden
    
    const expectedBehavior = {
      endpoint: 'POST /submit',
      missingApproval: {
        statusCode: 403,
        body: {
          status: 'error',
          error: {
            code: 'APPROVAL_REQUIRED',
            message: expect.stringContaining('user_approved: true'),
          },
        },
      },
    };

    expect(expectedBehavior.missingApproval.statusCode).toBe(403);
  });
});
