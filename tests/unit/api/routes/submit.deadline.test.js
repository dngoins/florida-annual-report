/**
 * Unit tests for submit endpoint deadline enforcement
 * 
 * Tests:
 * - Before deadline (allowed): request passes through to validation
 * - After May 1 (blocked): returns 422 Unprocessable Entity
 */

const request = require('supertest');
const express = require('express');

// Mock the deadline module to control the date
jest.mock('../../../../src/api/utils/deadline', () => {
  const original = jest.requireActual('../../../../src/api/utils/deadline');
  return {
    ...original,
    // We'll use mockDate to control time in tests
    isPastDeadline: jest.fn(),
    getDeadlineStatus: jest.fn()
  };
});

const deadlineUtils = require('../../../../src/api/utils/deadline');

// Create a test app
const createTestApp = () => {
  const app = express();
  const submitRouter = require('../../../../src/api/routes/submit');
  const responseEnvelope = require('../../../../src/api/middleware/responseEnvelope');
  
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/submit', submitRouter);
  
  return app;
};

describe('POST /submit - Deadline Enforcement', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });

  describe('before deadline (allowed)', () => {
    beforeEach(() => {
      // Mock: before deadline
      deadlineUtils.isPastDeadline.mockReturnValue(false);
      deadlineUtils.getDeadlineStatus.mockReturnValue({
        filing_year: 2025,
        deadline: '2025-05-01T00:00:00.000Z',
        days_remaining: 30,
        past_deadline: false,
        within_filing_window: true,
        deadline_warning: true
      });
    });

    it('should allow submission before May 1', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: true
        });
      
      // Should pass deadline check and succeed
      expect(response.status).toBe(202);
      expect(response.body.status).toBe('success');
    });

    it('should still enforce user_approved even before deadline', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456'
          // Missing user_approved
        });
      
      // Passes deadline check but fails user_approved
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('USER_APPROVAL_REQUIRED');
    });
  });

  describe('after May 1 (blocked)', () => {
    beforeEach(() => {
      // Mock: after deadline
      deadlineUtils.isPastDeadline.mockReturnValue(true);
      deadlineUtils.getDeadlineStatus.mockReturnValue({
        filing_year: 2025,
        deadline: '2025-05-01T00:00:00.000Z',
        days_remaining: -10,
        past_deadline: true,
        within_filing_window: false,
        deadline_warning: false
      });
    });

    it('should return 422 after May 1', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: true
        });
      
      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return FILING_DEADLINE_PASSED error code', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: true
        });
      
      expect(response.body.error.code).toBe('FILING_DEADLINE_PASSED');
    });

    it('should include deadline details in error', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: true
        });
      
      expect(response.body.error.details).toHaveProperty('deadline');
      expect(response.body.error.details).toHaveProperty('filing_year');
      expect(response.body.error.details).toHaveProperty('days_past_deadline');
    });

    it('should mention Sunbiz.org for late filing options', async () => {
      const response = await request(app)
        .post('/submit')
        .send({
          company_id: 'comp_123',
          filing_id: 'fil_456',
          user_approved: true
        });
      
      expect(response.body.error.message).toContain('Sunbiz.org');
      expect(response.body.error.message).toContain('late filing');
    });
  });
});
