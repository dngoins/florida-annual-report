/**
 * Middleware Aggregator
 * 
 * Exports all middleware modules for easy importing.
 * 
 * @module middleware
 */

const errorHandler = require('./errorHandler');
const requestLogger = require('./requestLogger');
const responseEnvelope = require('./responseEnvelope');
const deadlineCheck = require('./deadlineCheck');

module.exports = {
  errorHandler,
  requestLogger,
  responseEnvelope,
  deadlineCheck,
  // Also export individual deadline functions for convenience
  enforceDeadline: deadlineCheck.enforceDeadline,
  createDeadlineEnforcer: deadlineCheck.createDeadlineEnforcer
};
