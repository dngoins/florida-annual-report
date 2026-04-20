/**
 * Unit tests for deadline utility module
 * 
 * Tests deadline enforcement logic:
 * - Before deadline (allowed)
 * - After May 1 (blocked)
 * - 30-day warning trigger
 */

const {
  getFilingDeadline,
  getFilingWindowStart,
  isPastDeadline,
  isWithinFilingWindow,
  getDaysUntilDeadline,
  shouldShowDeadlineWarning,
  getDeadlineStatus,
  getNotificationThreshold,
  NOTIFICATION_THRESHOLDS
} = require('../../../../src/api/utils/deadline');

describe('Deadline Utilities', () => {
  describe('getFilingDeadline', () => {
    it('should return May 1 of current year by default', () => {
      const deadline = getFilingDeadline();
      const currentYear = new Date().getFullYear();
      
      expect(deadline.getFullYear()).toBe(currentYear);
      expect(deadline.getMonth()).toBe(4); // May (0-indexed)
      expect(deadline.getDate()).toBe(1);
    });

    it('should return May 1 of specified year', () => {
      const deadline = getFilingDeadline(2025);
      
      expect(deadline.getFullYear()).toBe(2025);
      expect(deadline.getMonth()).toBe(4);
      expect(deadline.getDate()).toBe(1);
    });
  });

  describe('getFilingWindowStart', () => {
    it('should return January 1 of current year by default', () => {
      const start = getFilingWindowStart();
      const currentYear = new Date().getFullYear();
      
      expect(start.getFullYear()).toBe(currentYear);
      expect(start.getMonth()).toBe(0); // January
      expect(start.getDate()).toBe(1);
    });
  });

  describe('isPastDeadline', () => {
    it('should return false before May 1 (allowed)', () => {
      // April 30, 2025 - last day to file
      const beforeDeadline = new Date(2025, 3, 30, 12, 0, 0);
      expect(isPastDeadline(beforeDeadline, 2025)).toBe(false);
    });

    it('should return true on May 1 (blocked)', () => {
      // May 1, 2025 - deadline day (past deadline)
      const onDeadline = new Date(2025, 4, 1, 0, 0, 0);
      expect(isPastDeadline(onDeadline, 2025)).toBe(true);
    });

    it('should return true after May 1 (blocked)', () => {
      // May 15, 2025 - clearly past deadline
      const afterDeadline = new Date(2025, 4, 15, 12, 0, 0);
      expect(isPastDeadline(afterDeadline, 2025)).toBe(true);
    });

    it('should return false on January 1 (allowed)', () => {
      // January 1, 2025 - start of filing window
      const windowStart = new Date(2025, 0, 1, 0, 0, 0);
      expect(isPastDeadline(windowStart, 2025)).toBe(false);
    });
  });

  describe('isWithinFilingWindow', () => {
    it('should return true during filing window (Jan-Apr)', () => {
      const march15 = new Date(2025, 2, 15, 12, 0, 0);
      expect(isWithinFilingWindow(march15, 2025)).toBe(true);
    });

    it('should return true on January 1 (start of window)', () => {
      const jan1 = new Date(2025, 0, 1, 0, 0, 0);
      expect(isWithinFilingWindow(jan1, 2025)).toBe(true);
    });

    it('should return false on May 1 (past window)', () => {
      const may1 = new Date(2025, 4, 1, 0, 0, 0);
      expect(isWithinFilingWindow(may1, 2025)).toBe(false);
    });

    it('should return false before January 1', () => {
      // December 15 of previous year
      const dec15 = new Date(2024, 11, 15, 12, 0, 0);
      expect(isWithinFilingWindow(dec15, 2025)).toBe(false);
    });
  });

  describe('getDaysUntilDeadline', () => {
    it('should return positive days before deadline', () => {
      // April 1, 2025 - 30 days before May 1
      const april1 = new Date(2025, 3, 1, 0, 0, 0);
      const days = getDaysUntilDeadline(april1, 2025);
      expect(days).toBe(30);
    });

    it('should return 1 on April 30', () => {
      const april30 = new Date(2025, 3, 30, 0, 0, 0);
      const days = getDaysUntilDeadline(april30, 2025);
      expect(days).toBe(1);
    });

    it('should return 0 or negative on/after May 1', () => {
      const may1 = new Date(2025, 4, 1, 0, 0, 0);
      const days = getDaysUntilDeadline(may1, 2025);
      expect(days).toBeLessThanOrEqual(0);
    });

    it('should return negative days after deadline', () => {
      const may15 = new Date(2025, 4, 15, 0, 0, 0);
      const days = getDaysUntilDeadline(may15, 2025);
      expect(days).toBeLessThan(0);
    });
  });

  describe('shouldShowDeadlineWarning', () => {
    it('should return true when 30 days or less remain (30-day warning trigger)', () => {
      // April 1, 2025 - exactly 30 days before May 1
      const april1 = new Date(2025, 3, 1, 0, 0, 0);
      expect(shouldShowDeadlineWarning(april1, 2025)).toBe(true);
    });

    it('should return true when 7 days remain', () => {
      // April 24, 2025 - 7 days before May 1
      const april24 = new Date(2025, 3, 24, 0, 0, 0);
      expect(shouldShowDeadlineWarning(april24, 2025)).toBe(true);
    });

    it('should return true when 1 day remains', () => {
      // April 30, 2025 - 1 day before May 1
      const april30 = new Date(2025, 3, 30, 0, 0, 0);
      expect(shouldShowDeadlineWarning(april30, 2025)).toBe(true);
    });

    it('should return false when more than 30 days remain', () => {
      // March 1, 2025 - more than 30 days before May 1
      const march1 = new Date(2025, 2, 1, 0, 0, 0);
      expect(shouldShowDeadlineWarning(march1, 2025)).toBe(false);
    });

    it('should return false after deadline (past May 1)', () => {
      // May 15, 2025 - past deadline
      const may15 = new Date(2025, 4, 15, 0, 0, 0);
      expect(shouldShowDeadlineWarning(may15, 2025)).toBe(false);
    });

    it('should accept custom threshold', () => {
      // 60 days before deadline with 60-day threshold
      const march2 = new Date(2025, 2, 2, 0, 0, 0);
      expect(shouldShowDeadlineWarning(march2, 2025, 60)).toBe(true);
    });
  });

  describe('getDeadlineStatus', () => {
    it('should return complete status object', () => {
      const april15 = new Date(2025, 3, 15, 0, 0, 0);
      const status = getDeadlineStatus(april15, 2025);
      
      expect(status).toHaveProperty('filing_year', 2025);
      expect(status).toHaveProperty('deadline');
      expect(status).toHaveProperty('days_remaining');
      expect(status).toHaveProperty('past_deadline', false);
      expect(status).toHaveProperty('within_filing_window', true);
      expect(status).toHaveProperty('deadline_warning', true);
    });

    it('should show deadline_warning: true when < 30 days remain', () => {
      const april10 = new Date(2025, 3, 10, 0, 0, 0);
      const status = getDeadlineStatus(april10, 2025);
      expect(status.deadline_warning).toBe(true);
    });

    it('should show deadline_warning: false when > 30 days remain', () => {
      const feb1 = new Date(2025, 1, 1, 0, 0, 0);
      const status = getDeadlineStatus(feb1, 2025);
      expect(status.deadline_warning).toBe(false);
    });

    it('should show past_deadline: true after May 1', () => {
      const may10 = new Date(2025, 4, 10, 0, 0, 0);
      const status = getDeadlineStatus(may10, 2025);
      expect(status.past_deadline).toBe(true);
      expect(status.within_filing_window).toBe(false);
    });
  });

  describe('getNotificationThreshold', () => {
    it('should return 30 when exactly 30 days remain', () => {
      expect(getNotificationThreshold(30)).toBe(30);
    });

    it('should return 7 when exactly 7 days remain', () => {
      expect(getNotificationThreshold(7)).toBe(7);
    });

    it('should return 1 when exactly 1 day remains', () => {
      expect(getNotificationThreshold(1)).toBe(1);
    });

    it('should return null for non-threshold values', () => {
      expect(getNotificationThreshold(15)).toBeNull();
      expect(getNotificationThreshold(5)).toBeNull();
      expect(getNotificationThreshold(0)).toBeNull();
    });
  });

  describe('NOTIFICATION_THRESHOLDS', () => {
    it('should contain expected thresholds', () => {
      expect(NOTIFICATION_THRESHOLDS).toContain(30);
      expect(NOTIFICATION_THRESHOLDS).toContain(7);
      expect(NOTIFICATION_THRESHOLDS).toContain(1);
    });
  });
});
