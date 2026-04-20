/**
 * Jest Setup File
 * 
 * This file runs before each test file.
 * Use for global test configuration and custom matchers.
 */

// Extend Jest timeout for slower tests
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
  /**
   * Florida Annual Report filing window constants
   * Per CONSTITUTION.md: Filing window is Jan 1 - May 1
   */
  FILING_WINDOW: {
    START_MONTH: 1,  // January
    START_DAY: 1,
    END_MONTH: 5,    // May
    END_DAY: 1,
  },

  /**
   * Confidence threshold per CONSTITUTION.md
   * Fields below 0.75 must be flagged for human review
   */
  CONFIDENCE_THRESHOLD: 0.75,

  /**
   * Check if a date falls within the filing window
   */
  isWithinFilingWindow(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    if (month < this.FILING_WINDOW.START_MONTH) return false;
    if (month > this.FILING_WINDOW.END_MONTH) return false;
    if (month === this.FILING_WINDOW.END_MONTH && day > this.FILING_WINDOW.END_DAY) return false;
    
    return true;
  },

  /**
   * Create a mock audit log entry
   */
  createMockAuditEntry(overrides = {}) {
    return {
      user_id: 'test-user-001',
      action_type: 'test_action',
      entity_id: 'entity-001',
      timestamp: new Date().toISOString(),
      before_state: null,
      after_state: null,
      ...overrides,
    };
  },
};

// Suppress console output during tests (optional)
// Uncomment to reduce noise in test output
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };
