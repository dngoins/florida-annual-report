/**
 * Response Envelope Middleware
 * 
 * Adds helper methods to the response object for sending standardized
 * responses in the { status, data, error } envelope format.
 * 
 * Per CLAUDE.md conventions, all API responses must use this envelope.
 * 
 * @module middleware/responseEnvelope
 */

/**
 * Adds res.success() and res.error() helper methods
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function responseEnvelope(req, res, next) {
  /**
   * Send a successful response
   * @param {*} data - The response data
   * @param {number} [statusCode=200] - HTTP status code
   */
  res.success = function(data, statusCode = 200) {
    return res.status(statusCode).json({
      status: 'success',
      data: data,
      error: null
    });
  };

  /**
   * Send an error response
   * @param {string} message - Error message
   * @param {number} [statusCode=400] - HTTP status code
   * @param {Object} [details={}] - Additional error details
   */
  res.error = function(message, statusCode = 400, details = {}) {
    return res.status(statusCode).json({
      status: 'error',
      data: null,
      error: {
        message: message,
        requestId: req.requestId,
        ...details
      }
    });
  };

  next();
}

module.exports = responseEnvelope;
