/**
 * Error Classifier
 * 
 * Categorizes errors as transient (retry) or permanent (escalate immediately)
 * Per CONSTITUTION.md Principle III: Fail-Safe Automation
 */

import { ErrorCategory, ClassifiedError } from './types';

// ============================================================================
// Error Pattern Definitions
// ============================================================================

interface ErrorPattern {
  pattern: RegExp;
  category: ErrorCategory;
  isTransient: boolean;
  recommendedDelay?: number;
}

/**
 * Patterns for classifying errors
 * Order matters - first match wins
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Network errors - transient
  {
    pattern: /timeout|timed out|ETIMEDOUT/i,
    category: ErrorCategory.NETWORK,
    isTransient: true,
    recommendedDelay: 2000,
  },
  {
    pattern: /ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH/i,
    category: ErrorCategory.NETWORK,
    isTransient: true,
    recommendedDelay: 3000,
  },
  {
    pattern: /network|socket|connection/i,
    category: ErrorCategory.NETWORK,
    isTransient: true,
    recommendedDelay: 2000,
  },

  // Rate limiting - transient with longer delay
  {
    pattern: /rate limit|too many requests|429|throttl/i,
    category: ErrorCategory.RATE_LIMIT,
    isTransient: true,
    recommendedDelay: 10000,
  },

  // Service unavailable - transient
  {
    pattern: /service unavailable|503|maintenance|temporarily/i,
    category: ErrorCategory.SERVICE_UNAVAILABLE,
    isTransient: true,
    recommendedDelay: 5000,
  },
  {
    pattern: /sunbiz.*unavailable|sunbiz.*down|sunbiz.*maintenance/i,
    category: ErrorCategory.SERVICE_UNAVAILABLE,
    isTransient: true,
    recommendedDelay: 10000,
  },

  // Selector/element errors - transient (page may be loading)
  {
    pattern: /element not found|selector|locator|no element/i,
    category: ErrorCategory.SELECTOR,
    isTransient: true,
    recommendedDelay: 2000,
  },
  {
    pattern: /waiting for.*failed|navigation.*timeout/i,
    category: ErrorCategory.SELECTOR,
    isTransient: true,
    recommendedDelay: 3000,
  },

  // Database errors - some are transient
  {
    pattern: /SQLITE_BUSY|database.*locked|deadlock/i,
    category: ErrorCategory.DATABASE,
    isTransient: true,
    recommendedDelay: 1000,
  },
  {
    pattern: /database.*connection|pool.*exhausted/i,
    category: ErrorCategory.DATABASE,
    isTransient: true,
    recommendedDelay: 2000,
  },

  // Validation errors - permanent (needs user action)
  {
    pattern: /validation|invalid|required field|missing.*required/i,
    category: ErrorCategory.VALIDATION,
    isTransient: false,
  },
  {
    pattern: /format.*error|parse.*error|malformed/i,
    category: ErrorCategory.VALIDATION,
    isTransient: false,
  },

  // Authentication errors - permanent
  {
    pattern: /auth|unauthorized|forbidden|401|403/i,
    category: ErrorCategory.AUTHENTICATION,
    isTransient: false,
  },
  {
    pattern: /credential|permission|access denied/i,
    category: ErrorCategory.AUTHENTICATION,
    isTransient: false,
  },
];

// ============================================================================
// Error Code Classification
// ============================================================================

interface ErrorCodeMapping {
  codes: string[];
  category: ErrorCategory;
  isTransient: boolean;
}

const ERROR_CODE_MAPPINGS: ErrorCodeMapping[] = [
  {
    codes: ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE'],
    category: ErrorCategory.NETWORK,
    isTransient: true,
  },
  {
    codes: ['SQLITE_BUSY', 'SQLITE_LOCKED', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'],
    category: ErrorCategory.DATABASE,
    isTransient: true,
  },
  {
    codes: ['INVALID_STATE', 'VALIDATION_ERROR', 'SCHEMA_ERROR'],
    category: ErrorCategory.VALIDATION,
    isTransient: false,
  },
  {
    codes: ['AUTH_FAILED', 'TOKEN_EXPIRED', 'UNAUTHORIZED'],
    category: ErrorCategory.AUTHENTICATION,
    isTransient: false,
  },
];

// ============================================================================
// Error Classifier
// ============================================================================

export class ErrorClassifier {
  /**
   * Classify an error to determine if it's transient (retryable) or permanent
   * 
   * @param error - The error to classify
   * @returns Classified error with retry recommendation
   */
  static classify(error: Error): ClassifiedError {
    // First, check if error has a code property
    const errorCode = (error as any).code as string | undefined;
    if (errorCode) {
      const codeMapping = this.classifyByCode(errorCode);
      if (codeMapping) {
        return {
          originalError: error,
          category: codeMapping.category,
          isTransient: codeMapping.isTransient,
          shouldRetry: codeMapping.isTransient,
          recommendedDelay: codeMapping.isTransient ? 2000 : undefined,
        };
      }
    }

    // Then, check error message against patterns
    const message = error.message;
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(message)) {
        return {
          originalError: error,
          category: pattern.category,
          isTransient: pattern.isTransient,
          shouldRetry: pattern.isTransient,
          recommendedDelay: pattern.recommendedDelay,
        };
      }
    }

    // Default: unknown errors are not transient (escalate)
    return {
      originalError: error,
      category: ErrorCategory.UNKNOWN,
      isTransient: false,
      shouldRetry: false,
    };
  }

  /**
   * Check if an error is transient (shorthand for classify().isTransient)
   */
  static isTransient(error: Error): boolean {
    return this.classify(error).isTransient;
  }

  /**
   * Get recommended delay for a classified error
   */
  static getRecommendedDelay(error: Error): number {
    const classified = this.classify(error);
    return classified.recommendedDelay ?? 1000;
  }

  /**
   * Classify error by error code
   */
  private static classifyByCode(code: string): ErrorCodeMapping | null {
    const upperCode = code.toUpperCase();
    for (const mapping of ERROR_CODE_MAPPINGS) {
      if (mapping.codes.includes(upperCode)) {
        return mapping;
      }
    }
    return null;
  }
}

// Re-export types
export { ErrorCategory, ClassifiedError };
