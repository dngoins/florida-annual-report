/**
 * Request Logger Middleware
 * 
 * Adds unique request IDs and logs all incoming requests.
 * Request IDs are used for tracing and debugging across services.
 * 
 * @module middleware/requestLogger
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Adds a unique request ID to each request
 * Uses existing X-Request-ID header if provided, otherwise generates a new UUID
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function addRequestId(req, res, next) {
  // Use existing request ID from header or generate new one
  const requestId = req.headers['x-request-id'] || uuidv4();
  
  // Attach to request object for use in other middleware/routes
  req.requestId = requestId;
  
  // Set response header for client-side correlation
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

/**
 * Logs request details including method, path, and request ID
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function logRequest(req, res, next) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${req.requestId}] ${req.method} ${req.path}`);
  next();
}

module.exports = {
  addRequestId,
  logRequest
};
