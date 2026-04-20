/**
 * Health Check Route
 * 
 * Provides a simple health check endpoint for monitoring and load balancers.
 * 
 * @module routes/health
 */

const express = require('express');
const router = express.Router();

/**
 * GET /health
 * 
 * Returns the health status of the API Gateway.
 */
router.get('/', (req, res) => {
  res.success({
    service: 'florida-annual-report-api',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

module.exports = router;
