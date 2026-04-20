/**
 * Unit tests for health check endpoint
 * Verifies the API Gateway health check functionality
 */

const request = require('supertest');
const express = require('express');

// Create a minimal test app with health route
const createTestApp = () => {
  const app = express();
  const healthRouter = require('../../../../src/api/routes/health');
  const responseEnvelope = require('../../../../src/api/middleware/responseEnvelope');
  
  app.use(responseEnvelope);
  app.use('/health', healthRouter);
  
  return app;
};

describe('GET /health', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('should return 200 status code', async () => {
    const response = await request(app).get('/health');
    
    expect(response.status).toBe(200);
  });

  it('should return standard envelope format', async () => {
    const response = await request(app).get('/health');
    
    expect(response.body).toHaveProperty('status', 'success');
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('error', null);
  });

  it('should include service status in data', async () => {
    const response = await request(app).get('/health');
    
    expect(response.body.data).toHaveProperty('service', 'florida-annual-report-api');
    expect(response.body.data).toHaveProperty('status', 'healthy');
  });

  it('should include timestamp in data', async () => {
    const response = await request(app).get('/health');
    
    expect(response.body.data).toHaveProperty('timestamp');
    expect(new Date(response.body.data.timestamp)).toBeInstanceOf(Date);
  });

  it('should include version in data', async () => {
    const response = await request(app).get('/health');
    
    expect(response.body.data).toHaveProperty('version');
  });
});
