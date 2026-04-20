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

module.exports = {
  errorHandler,
  requestLogger,
  responseEnvelope
};
