/**
 * Deadline Check Middleware
 * 
 * Enforces the Florida Annual Report filing deadline (May 1).
 * Blocks submissions after the deadline with a 422 Unprocessable Entity response.
 * 
 * Per regulatory-requirements.md:
 * - Filing window: January 1 - May 1
 * - Late fee penalties apply after May 1
 * 
 * @module middleware/deadlineCheck
 */

const { isPastDeadline, getDeadlineStatus } = require('../utils/deadline');

/**
 * Middleware that blocks submissions after the May 1 deadline.
 * Returns 422 Unprocessable Entity if current date is past deadline.
 * 
 * Use this middleware on routes that should be blocked after the filing deadline.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function enforceDeadline(req, res, next) {
  const now = new Date();
  
  if (isPastDeadline(now)) {
    const status = getDeadlineStatus(now);
    
    return res.status(422).json({
      status: 'error',
      data: null,
      error: {
        code: 'FILING_DEADLINE_PASSED',
        message: `Filing deadline has passed. The Florida Annual Report filing window (January 1 - May 1) has closed. ` +
                 `Late filings may be subject to penalties. Please visit Sunbiz.org directly for late filing options.`,
        details: {
          deadline: status.deadline,
          filing_year: status.filing_year,
          days_past_deadline: Math.abs(status.days_remaining)
        }
      }
    });
  }
  
  next();
}

/**
 * Middleware factory that allows custom date injection for testing.
 * 
 * @param {Function} dateProvider - Function that returns the current date
 * @returns {Function} - Express middleware
 */
function createDeadlineEnforcer(dateProvider) {
  return function(req, res, next) {
    const now = dateProvider ? dateProvider() : new Date();
    
    if (isPastDeadline(now)) {
      const status = getDeadlineStatus(now);
      
      return res.status(422).json({
        status: 'error',
        data: null,
        error: {
          code: 'FILING_DEADLINE_PASSED',
          message: `Filing deadline has passed. The Florida Annual Report filing window (January 1 - May 1) has closed. ` +
                   `Late filings may be subject to penalties. Please visit Sunbiz.org directly for late filing options.`,
          details: {
            deadline: status.deadline,
            filing_year: status.filing_year,
            days_past_deadline: Math.abs(status.days_remaining)
          }
        }
      });
    }
    
    next();
  };
}

module.exports = {
  enforceDeadline,
  createDeadlineEnforcer
};
