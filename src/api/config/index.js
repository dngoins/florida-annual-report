/**
 * Configuration Management
 * 
 * Centralizes all configuration, loading from environment variables.
 * Never commit secrets - use environment variables or Azure Key Vault.
 * 
 * @module config
 */

require('dotenv').config();

const config = {
  // Server configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? 'combined' : 'dev'
  },
  
  // API version
  apiVersion: process.env.API_VERSION || 'v1',
  
  // Service name for health checks
  serviceName: 'florida-annual-report-api',
  
  // Rate limiting (future implementation)
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100 // 100 requests per window
  }
};

module.exports = config;
