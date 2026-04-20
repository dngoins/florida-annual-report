/**
 * Error Handler Middleware
 * 
 * Centralized error handling that ensures all errors are returned
 * in the standard { status, data, error } envelope format.
 * 
 * @module middleware/errorHandler
 */

/**
 * Express error handling middleware
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Build error response following the standard envelope
  const errorResponse = {
    status: 'error',
    data: null,
    error: {
      message: err.message || 'Internal Server Error',
      requestId: req.requestId || 'unknown'
    }
  };

  // Include stack trace in development mode only
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  // Log the error for monitoring
  console.error(`[${req.requestId}] Error: ${err.message}`, {
    statusCode,
    path: req.path,
    method: req.method,
    stack: err.stack
  });

  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
