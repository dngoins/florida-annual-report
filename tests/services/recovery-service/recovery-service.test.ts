/**
 * Recovery Service Unit Tests
 * 
 * Tests for retry logic, error classification, and escalation path
 * Per CONSTITUTION.md Section VI: Test-first approach
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import {
  RecoveryService,
  RecoveryConfig,
  RecoveryResult,
  OperationContext,
  RetryableOperation,
} from '../../../src/services/recovery-service';
import {
  ErrorClassifier,
  ErrorCategory,
  ClassifiedError,
} from '../../../src/services/recovery-service/error-classifier';
import {
  calculateBackoff,
  BackoffConfig,
} from '../../../src/services/recovery-service/exponential-backoff';

// ============================================================================
// Mock Dependencies
// ============================================================================

const mockAuditLogger = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockNotificationService = {
  notifyManualEscalation: jest.fn().mockResolvedValue(undefined),
  notifyRetryStarted: jest.fn().mockResolvedValue(undefined),
};

const mockFilingService = {
  updateStatus: jest.fn().mockResolvedValue(undefined),
  getOperation: jest.fn().mockResolvedValue({
    id: 'op-123',
    filing_id: 'filing-456',
    company_id: 'company-789',
    type: 'submission',
    status: 'failed',
    last_error: 'Network timeout',
    retry_count: 0,
  }),
};

// ============================================================================
// Error Classifier Tests
// ============================================================================

describe('ErrorClassifier', () => {
  describe('classifyError', () => {
    it('should classify network timeout as transient', () => {
      const error = new Error('Request timeout after 30000ms');
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(true);
      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.shouldRetry).toBe(true);
    });

    it('should classify connection refused as transient', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(true);
      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.shouldRetry).toBe(true);
    });

    it('should classify validation errors as permanent', () => {
      const error = new Error('Validation failed: Invalid EIN format');
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(false);
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.shouldRetry).toBe(false);
    });

    it('should classify authentication errors as permanent', () => {
      const error = new Error('Authentication failed: Invalid credentials');
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(false);
      expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(result.shouldRetry).toBe(false);
    });

    it('should classify rate limit errors as transient', () => {
      const error = new Error('Rate limit exceeded');
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(true);
      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(result.shouldRetry).toBe(true);
    });

    it('should classify Sunbiz maintenance as transient', () => {
      const error = new Error('Sunbiz system under maintenance');
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(true);
      expect(result.category).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
      expect(result.shouldRetry).toBe(true);
    });

    it('should classify selector not found as transient (page may still be loading)', () => {
      const error = new Error('Element not found: #submit-button');
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(true);
      expect(result.category).toBe(ErrorCategory.SELECTOR);
      expect(result.shouldRetry).toBe(true);
    });

    it('should classify unknown errors as permanent by default', () => {
      const error = new Error('Something completely unexpected happened');
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(false);
      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      expect(result.shouldRetry).toBe(false);
    });

    it('should handle errors with error codes', () => {
      const error: any = new Error('Database error');
      error.code = 'SQLITE_BUSY';
      const result = ErrorClassifier.classify(error);
      
      expect(result.isTransient).toBe(true);
      expect(result.category).toBe(ErrorCategory.DATABASE);
      expect(result.shouldRetry).toBe(true);
    });
  });
});

// ============================================================================
// Exponential Backoff Tests
// ============================================================================

describe('ExponentialBackoff', () => {
  describe('calculateBackoff', () => {
    const config: BackoffConfig = {
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      multiplier: 2,
      jitterFactor: 0, // No jitter for predictable tests
    };

    it('should return base delay for first retry', () => {
      const delay = calculateBackoff(1, { ...config, jitterFactor: 0 });
      expect(delay).toBe(1000);
    });

    it('should double delay for second retry', () => {
      const delay = calculateBackoff(2, { ...config, jitterFactor: 0 });
      expect(delay).toBe(2000);
    });

    it('should continue exponential growth for third retry', () => {
      const delay = calculateBackoff(3, { ...config, jitterFactor: 0 });
      expect(delay).toBe(4000);
    });

    it('should cap at maxDelayMs', () => {
      const delay = calculateBackoff(10, { ...config, jitterFactor: 0 });
      expect(delay).toBe(30000);
    });

    it('should add jitter when jitterFactor > 0', () => {
      const configWithJitter = { ...config, jitterFactor: 0.25 };
      const delays = new Set<number>();
      
      // Run multiple times to verify jitter adds variance
      for (let i = 0; i < 10; i++) {
        delays.add(calculateBackoff(1, configWithJitter));
      }
      
      // With jitter, we should see some variance
      // (there's a tiny chance all 10 are the same, but extremely unlikely)
      expect(delays.size).toBeGreaterThan(1);
    });

    it('should keep jittered delay within bounds', () => {
      const configWithJitter = { ...config, jitterFactor: 0.25 };
      
      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoff(1, configWithJitter);
        expect(delay).toBeGreaterThanOrEqual(750); // 1000 - 25%
        expect(delay).toBeLessThanOrEqual(1250);   // 1000 + 25%
      }
    });
  });
});

// ============================================================================
// Recovery Service Tests
// ============================================================================

describe('RecoveryService', () => {
  let recoveryService: RecoveryService;
  
  const defaultConfig: RecoveryConfig = {
    maxRetries: 3,
    backoff: {
      baseDelayMs: 10,     // Short delays for tests
      maxDelayMs: 100,
      multiplier: 2,
      jitterFactor: 0,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    recoveryService = new RecoveryService(
      mockAuditLogger as any,
      mockNotificationService as any,
      mockFilingService as any,
      defaultConfig
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt if operation succeeds', async () => {
      const operation: RetryableOperation<string> = jest.fn().mockResolvedValue('success');
      const context: OperationContext = {
        operationId: 'op-123',
        filingId: 'filing-456',
        companyId: 'company-789',
        operationType: 'submission',
      };

      const result = await recoveryService.executeWithRetry(operation, context);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.retriesUsed).toBe(0);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient error and succeed', async () => {
      const operation: RetryableOperation<string> = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('success after retry');
      
      const context: OperationContext = {
        operationId: 'op-123',
        filingId: 'filing-456',
        companyId: 'company-789',
        operationType: 'submission',
      };

      const result = await recoveryService.executeWithRetry(operation, context);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success after retry');
      expect(result.retriesUsed).toBe(1);
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockAuditLogger.log).toHaveBeenCalled();
    });

    it('should retry up to maxRetries times before failing', async () => {
      const operation: RetryableOperation<string> = jest.fn()
        .mockRejectedValue(new Error('Network timeout'));
      
      const context: OperationContext = {
        operationId: 'op-123',
        filingId: 'filing-456',
        companyId: 'company-789',
        operationType: 'submission',
      };

      const result = await recoveryService.executeWithRetry(operation, context);

      expect(result.success).toBe(false);
      expect(result.retriesUsed).toBe(3);
      expect(result.escalated).toBe(true);
      expect(operation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should not retry on permanent error', async () => {
      const operation: RetryableOperation<string> = jest.fn()
        .mockRejectedValue(new Error('Validation failed: Invalid EIN'));
      
      const context: OperationContext = {
        operationId: 'op-123',
        filingId: 'filing-456',
        companyId: 'company-789',
        operationType: 'submission',
      };

      const result = await recoveryService.executeWithRetry(operation, context);

      expect(result.success).toBe(false);
      expect(result.retriesUsed).toBe(0);
      expect(result.escalated).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should log all retry attempts to audit log', async () => {
      const operation: RetryableOperation<string> = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('success');
      
      const context: OperationContext = {
        operationId: 'op-123',
        filingId: 'filing-456',
        companyId: 'company-789',
        operationType: 'submission',
      };

      await recoveryService.executeWithRetry(operation, context);

      // Should log each retry attempt
      const retryCalls = mockAuditLogger.log.mock.calls.filter(
        (call: any) => call[0].action_type === 'retry_attempt'
      );
      expect(retryCalls.length).toBe(2);
    });
  });

  describe('escalateToManual', () => {
    it('should set filing status to manual_required', async () => {
      const context: OperationContext = {
        operationId: 'op-123',
        filingId: 'filing-456',
        companyId: 'company-789',
        operationType: 'submission',
      };

      await recoveryService.escalateToManual(context, 'Max retries exhausted');

      expect(mockFilingService.updateStatus).toHaveBeenCalledWith(
        'filing-456',
        'manual_required'
      );
    });

    it('should send user notification on escalation', async () => {
      const context: OperationContext = {
        operationId: 'op-123',
        filingId: 'filing-456',
        companyId: 'company-789',
        operationType: 'submission',
      };

      await recoveryService.escalateToManual(context, 'Max retries exhausted');

      expect(mockNotificationService.notifyManualEscalation).toHaveBeenCalledWith(
        expect.objectContaining({
          filing_id: 'filing-456',
          company_id: 'company-789',
          reason: 'Max retries exhausted',
        })
      );
    });

    it('should log escalation to audit log', async () => {
      const context: OperationContext = {
        operationId: 'op-123',
        filingId: 'filing-456',
        companyId: 'company-789',
        operationType: 'submission',
      };

      await recoveryService.escalateToManual(context, 'Max retries exhausted');

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'manual_escalation',
          entity_type: 'filing',
          entity_id: 'filing-456',
        })
      );
    });
  });

  describe('getOperationStatus', () => {
    it('should return operation status from filing service', async () => {
      const status = await recoveryService.getOperationStatus('op-123');

      expect(status).toEqual({
        id: 'op-123',
        filing_id: 'filing-456',
        company_id: 'company-789',
        type: 'submission',
        status: 'failed',
        last_error: 'Network timeout',
        retry_count: 0,
      });
      expect(mockFilingService.getOperation).toHaveBeenCalledWith('op-123');
    });
  });
});

// ============================================================================
// Integration Test: Full Retry Flow
// ============================================================================

describe('RecoveryService Integration', () => {
  it('should handle full retry flow with eventual success', async () => {
    jest.clearAllMocks();
    
    const recoveryService = new RecoveryService(
      mockAuditLogger as any,
      mockNotificationService as any,
      mockFilingService as any,
      {
        maxRetries: 3,
        backoff: {
          baseDelayMs: 1,
          maxDelayMs: 10,
          multiplier: 2,
          jitterFactor: 0,
        },
      }
    );

    let attemptCount = 0;
    const operation: RetryableOperation<{ confirmationNumber: string }> = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Connection reset');
      }
      return { confirmationNumber: 'FL-2024-12345' };
    };

    const context: OperationContext = {
      operationId: 'op-integration-test',
      filingId: 'filing-integration',
      companyId: 'company-integration',
      operationType: 'submission',
    };

    const result = await recoveryService.executeWithRetry(operation, context);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ confirmationNumber: 'FL-2024-12345' });
    expect(result.retriesUsed).toBe(2);
    expect(result.escalated).toBe(false);
  });

  it('should handle full retry flow with escalation', async () => {
    jest.clearAllMocks();
    
    const recoveryService = new RecoveryService(
      mockAuditLogger as any,
      mockNotificationService as any,
      mockFilingService as any,
      {
        maxRetries: 3,
        backoff: {
          baseDelayMs: 1,
          maxDelayMs: 10,
          multiplier: 2,
          jitterFactor: 0,
        },
      }
    );

    const operation: RetryableOperation<string> = async () => {
      throw new Error('Service temporarily unavailable');
    };

    const context: OperationContext = {
      operationId: 'op-escalation-test',
      filingId: 'filing-escalation',
      companyId: 'company-escalation',
      operationType: 'submission',
    };

    const result = await recoveryService.executeWithRetry(operation, context);

    expect(result.success).toBe(false);
    expect(result.retriesUsed).toBe(3);
    expect(result.escalated).toBe(true);
    expect(mockFilingService.updateStatus).toHaveBeenCalledWith(
      'filing-escalation',
      'manual_required'
    );
    expect(mockNotificationService.notifyManualEscalation).toHaveBeenCalled();
  });
});
