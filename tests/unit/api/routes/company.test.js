/**
 * Unit tests for company endpoint
 * 
 * Tests deadline_warning flag in company responses:
 * - Returns deadline_warning: true when < 30 days to May 1
 * - Returns deadline_warning: false when > 30 days to May 1
 */

const request = require('supertest');
const express = require('express');

// Mock the deadline module to control the date
jest.mock('../../../../src/api/utils/deadline', () => ({
  getDeadlineStatus: jest.fn()
}));

const { getDeadlineStatus } = require('../../../../src/api/utils/deadline');

// Create a test app
const createTestApp = () => {
  const app = express();
  const companyRouter = require('../../../../src/api/routes/company');
  const responseEnvelope = require('../../../../src/api/middleware/responseEnvelope');
  
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/company', companyRouter);
  
  return app;
};

describe('GET /company/:id', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });

  describe('deadline_warning flag', () => {
    it('should return deadline_warning: true when < 30 days to deadline', async () => {
      getDeadlineStatus.mockReturnValue({
        filing_year: 2025,
        deadline: '2025-05-01T00:00:00.000Z',
        days_remaining: 20,
        past_deadline: false,
        within_filing_window: true,
        deadline_warning: true
      });

      const response = await request(app)
        .get('/company/comp_123');
      
      expect(response.status).toBe(200);
      expect(response.body.data.deadline_warning).toBe(true);
      expect(response.body.data.days_until_deadline).toBe(20);
    });

    it('should return deadline_warning: false when > 30 days to deadline', async () => {
      getDeadlineStatus.mockReturnValue({
        filing_year: 2025,
        deadline: '2025-05-01T00:00:00.000Z',
        days_remaining: 90,
        past_deadline: false,
        within_filing_window: true,
        deadline_warning: false
      });

      const response = await request(app)
        .get('/company/comp_123');
      
      expect(response.status).toBe(200);
      expect(response.body.data.deadline_warning).toBe(false);
    });

    it('should include deadline message when warning is true', async () => {
      getDeadlineStatus.mockReturnValue({
        filing_year: 2025,
        deadline: '2025-05-01T00:00:00.000Z',
        days_remaining: 7,
        past_deadline: false,
        within_filing_window: true,
        deadline_warning: true
      });

      const response = await request(app)
        .get('/company/comp_123');
      
      expect(response.body.data.deadline_message).toBeDefined();
      expect(response.body.data.deadline_message).toContain('7 days');
      expect(response.body.data.deadline_message).toContain('May 1');
    });

    it('should not include deadline message when warning is false', async () => {
      getDeadlineStatus.mockReturnValue({
        filing_year: 2025,
        deadline: '2025-05-01T00:00:00.000Z',
        days_remaining: 90,
        past_deadline: false,
        within_filing_window: true,
        deadline_warning: false
      });

      const response = await request(app)
        .get('/company/comp_123');
      
      expect(response.body.data.deadline_message).toBeUndefined();
    });

    it('should include filing_deadline in response', async () => {
      getDeadlineStatus.mockReturnValue({
        filing_year: 2025,
        deadline: '2025-05-01T00:00:00.000Z',
        days_remaining: 30,
        past_deadline: false,
        within_filing_window: true,
        deadline_warning: true
      });

      const response = await request(app)
        .get('/company/comp_123');
      
      expect(response.body.data.filing_deadline).toBe('2025-05-01T00:00:00.000Z');
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      getDeadlineStatus.mockReturnValue({
        filing_year: 2025,
        deadline: '2025-05-01T00:00:00.000Z',
        days_remaining: 60,
        past_deadline: false,
        within_filing_window: true,
        deadline_warning: false
      });
    });

    it('should return company data for valid ID', async () => {
      const response = await request(app)
        .get('/company/comp_123');
      
      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('comp_123');
    });

    it('should include standard envelope format', async () => {
      const response = await request(app)
        .get('/company/comp_123');
      
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('error');
    });
  });
});
