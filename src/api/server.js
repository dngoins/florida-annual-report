/**
 * Florida Annual Report API Gateway
 * 
 * Express server entry point that routes requests to all backend microservices.
 * 
 * @module server
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const { errorHandler, requestLogger, responseEnvelope } = require('./middleware');
const routes = require('./routes');

// Create Express app
const app = express();

// =============================================================================
// Middleware Setup
// =============================================================================

// CORS - Cross-Origin Resource Sharing
app.use(cors(config.cors));

// JSON body parser
app.use(express.json());

// URL-encoded body parser (for form submissions)
app.use(express.urlencoded({ extended: true }));

// Request logging with Morgan
app.use(morgan(config.logging.format));

// Request ID tracking
app.use(requestLogger.addRequestId);
app.use(requestLogger.logRequest);

// Response envelope helpers (res.success, res.error)
app.use(responseEnvelope);

// =============================================================================
// Routes
// =============================================================================

// Health check endpoint
app.use('/health', routes.health);

// Document upload endpoint
app.use('/documents', routes.documents);

// Extraction endpoint
app.use('/extract', routes.extract);

// Company record endpoint
app.use('/company', routes.company);

// Reconciliation endpoint
app.use('/reconcile', routes.reconcile);

// Submission endpoint (requires user_approved: true)
app.use('/submit', routes.submit);

// Audit log endpoint
app.use('/audit', routes.audit);

// =============================================================================
// 404 Handler
// =============================================================================

app.use((req, res) => {
  res.error(`Route not found: ${req.method} ${req.path}`, 404);
});

// =============================================================================
// Error Handler (must be last)
// =============================================================================

app.use(errorHandler);

// =============================================================================
// Server Startup
// =============================================================================

// Only start server if this file is run directly (not when imported for testing)
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Florida Annual Report API Gateway                             ║
║  Environment: ${config.nodeEnv.padEnd(47)}║
║  Port: ${String(config.port).padEnd(54)}║
║  Health Check: http://localhost:${config.port}/health${' '.repeat(24)}║
╚════════════════════════════════════════════════════════════════╝
    `);
  });
}

// Export app for testing
module.exports = app;
