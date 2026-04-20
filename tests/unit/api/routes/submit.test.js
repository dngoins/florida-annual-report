/**
 * Unit tests for submit endpoint
 * Verifies the critical user_approved enforcement
 */

const request = require('supertest');
const express = require('express');

// Create a minimal test app with submit route
const createTestApp = () => {
  const app = express();
  const submitRouter = require('../../../../src/api/routes/submit');
  const responseEnvelope = require('../../../../src/api/middleware/responseEnvelope');
  
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/submit', submitRouter);
  
  return app;
};

describe('POST /submit', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('user_approved enforcement', () => {
    it('should reject request without user_approved', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456'
        });
      
      expect(response.status).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.error.message).toContain('user_approved');
    });

    it('should reject request with user_approved: false', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: false
        });
      
      expect(response.status).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.error.code).toBe('USER_APPROVAL_REQUIRED');
    });

    it('should reject request with user_approved: "true" (string)', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: 'true' // String, not boolean
        });
      
      expect(response.status).toBe(403);
      expect(response.body.status).toBe('error');
    });

    it('should accept request with user_approved: true (boolean)', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: true
        });
      
      expect(response.status).toBe(202);
      expect(response.body.status).toBe('success');
      expect(response.body.data.submission_id).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should reject request without company_id', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          filing_id: 'fil_456',
          user_approved: true
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('company_id');
    });

    it('should reject request without filing_id', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          user_approved: true
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('filing_id');
    });
  });

  describe('response format', () => {
    it('should return standard envelope format', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: true
        });
      
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('error');
    });

    it('should include submission_id and status in response', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: true
        });
      
      expect(response.body.data.submission_id).toBeDefined();
      expect(response.body.data.status).toBe('in_progress');
    });
  });
});
