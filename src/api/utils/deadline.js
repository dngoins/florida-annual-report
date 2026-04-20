/**
 * Deadline Utilities
 * 
 * Florida Annual Report filing deadline enforcement utilities.
 * Filing window: January 1 - May 1 (midnight)
 * 
 * @module utils/deadline
 */

/**
 * Get the filing deadline for a given year.
 * Florida Annual Reports are due by May 1st at midnight.
 * 
 * @param {number} [year] - The filing year (defaults to current year)
 * @returns {Date} - The deadline date (May 1 at 00:00:00)
 */
function getFilingDeadline(year) {
  const targetYear = year || new Date().getFullYear();
  // May 1st at midnight (start of day) - submissions must be before this
  return new Date(targetYear, 4, 1, 0, 0, 0, 0); // Month is 0-indexed, so 4 = May
}

/**
 * Get the start of the filing window for a given year.
 * Filing window opens January 1st.
 * 
 * @param {number} [year] - The filing year (defaults to current year)
 * @returns {Date} - The window start date (January 1 at 00:00:00)
 */
function getFilingWindowStart(year) {
  const targetYear = year || new Date().getFullYear();
  return new Date(targetYear, 0, 1, 0, 0, 0, 0); // January 1st
}

/**
 * Check if a date is past the filing deadline.
 * 
 * @param {Date} [date] - The date to check (defaults to now)
 * @param {number} [year] - The filing year (defaults to current year)
 * @returns {boolean} - True if past deadline
 */
function isPastDeadline(date, year) {
  const checkDate = date || new Date();
  const deadline = getFilingDeadline(year);
  return checkDate >= deadline;
}

/**
 * Check if currently within the filing window (Jan 1 - May 1).
 * 
 * @param {Date} [date] - The date to check (defaults to now)
 * @param {number} [year] - The filing year (defaults to current year)
 * @returns {boolean} - True if within filing window
 */
function isWithinFilingWindow(date, year) {
  const checkDate = date || new Date();
  const targetYear = year || checkDate.getFullYear();
  const windowStart = getFilingWindowStart(targetYear);
  const deadline = getFilingDeadline(targetYear);
  
  return checkDate >= windowStart && checkDate < deadline;
}

/**
 * Get the number of days remaining until the filing deadline.
 * 
 * @param {Date} [date] - The date to check from (defaults to now)
 * @param {number} [year] - The filing year (defaults to current year)
 * @returns {number} - Days remaining (negative if past deadline)
 */
function getDaysUntilDeadline(date, year) {
  const checkDate = date || new Date();
  const deadline = getFilingDeadline(year);
  const diffMs = deadline - checkDate;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Check if a deadline warning should be shown.
 * Warning is shown when < 30 days remain before May 1.
 * 
 * @param {Date} [date] - The date to check (defaults to now)
 * @param {number} [year] - The filing year (defaults to current year)
 * @param {number} [warningThresholdDays=30] - Days before deadline to start warning
 * @returns {boolean} - True if warning should be shown
 */
function shouldShowDeadlineWarning(date, year, warningThresholdDays = 30) {
  const daysRemaining = getDaysUntilDeadline(date, year);
  // Show warning if within threshold AND not past deadline
  return daysRemaining > 0 && daysRemaining <= warningThresholdDays;
}

/**
 * Get deadline status info for API responses.
 * 
 * @param {Date} [date] - The date to check (defaults to now)
 * @param {number} [year] - The filing year (defaults to current year)
 * @returns {Object} - Status object with deadline info
 */
function getDeadlineStatus(date, year) {
  const checkDate = date || new Date();
  const targetYear = year || checkDate.getFullYear();
  const deadline = getFilingDeadline(targetYear);
  const daysRemaining = getDaysUntilDeadline(checkDate, targetYear);
  const pastDeadline = isPastDeadline(checkDate, targetYear);
  const withinWindow = isWithinFilingWindow(checkDate, targetYear);
  const showWarning = shouldShowDeadlineWarning(checkDate, targetYear);
  
  return {
    filing_year: targetYear,
    deadline: deadline.toISOString(),
    days_remaining: daysRemaining,
    past_deadline: pastDeadline,
    within_filing_window: withinWindow,
    deadline_warning: showWarning
  };
}

/**
 * Warning notification thresholds (days before deadline).
 */
const NOTIFICATION_THRESHOLDS = [30, 7, 1];

/**
 * Check which notification should be sent based on days remaining.
 * 
 * @param {number} daysRemaining - Days until deadline
 * @returns {number|null} - The threshold that matches, or null if no notification needed
 */
function getNotificationThreshold(daysRemaining) {
  for (const threshold of NOTIFICATION_THRESHOLDS) {
    if (daysRemaining === threshold) {
      return threshold;
    }
  }
  return null;
}

module.exports = {
  getFilingDeadline,
  getFilingWindowStart,
  isPastDeadline,
  isWithinFilingWindow,
  getDaysUntilDeadline,
  shouldShowDeadlineWarning,
  getDeadlineStatus,
  getNotificationThreshold,
  NOTIFICATION_THRESHOLDS
};
