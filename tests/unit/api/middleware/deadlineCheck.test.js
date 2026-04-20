/**
 * Unit tests for deadline check middleware
 * 
 * Tests:
 * - Before deadline: request passes through
 * - After May 1: returns 422 Unprocessable Entity
 */

const { enforceDeadline, createDeadlineEnforcer } = require('../../../../src/api/middleware/deadlineCheck');

describe('Deadline Check Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('enforceDeadline', () => {
    it('should be a function', () => {
      expect(typeof enforceDeadline).toBe('function');
    });
  });

  describe('createDeadlineEnforcer', () => {
    it('should call next() when before deadline (allowed)', () => {
      // March 15, 2025 - well before deadline
      const dateProvider = () => new Date(2025, 2, 15, 12, 0, 0);
      const middleware = createDeadlineEnforcer(dateProvider);
      
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should call next() on April 30 (last day - allowed)', () => {
      // April 30, 2025 - last day to file
      const dateProvider = () => new Date(2025, 3, 30, 23, 59, 59);
      const middleware = createDeadlineEnforcer(dateProvider);
      
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 422 on May 1 (blocked)', () => {
      // May 1, 2025 - deadline has passed
      const dateProvider = () => new Date(2025, 4, 1, 0, 0, 0);
      const middleware = createDeadlineEnforcer(dateProvider);
      
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should return 422 after May 1 (blocked)', () => {
      // May 15, 2025 - clearly past deadline
      const dateProvider = () => new Date(2025, 4, 15, 12, 0, 0);
      const middleware = createDeadlineEnforcer(dateProvider);
      
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(422);
    });

    it('should include error code FILING_DEADLINE_PASSED', () => {
      const dateProvider = () => new Date(2025, 4, 15, 12, 0, 0);
      const middleware = createDeadlineEnforcer(dateProvider);
      
      middleware(mockReq, mockRes, mockNext);
      
      const jsonResponse = mockRes.json.mock.calls[0][0];
      expect(jsonResponse.error.code).toBe('FILING_DEADLINE_PASSED');
    });

    it('should include deadline details in error response', () => {
      const dateProvider = () => new Date(2025, 4, 10, 12, 0, 0);
      const middleware = createDeadlineEnforcer(dateProvider);
      
      middleware(mockReq, mockRes, mockNext);
      
      const jsonResponse = mockRes.json.mock.calls[0][0];
      expect(jsonResponse.status).toBe('error');
      expect(jsonResponse.error.details).toHaveProperty('deadline');
      expect(jsonResponse.error.details).toHaveProperty('filing_year', 2025);
      expect(jsonResponse.error.details).toHaveProperty('days_past_deadline');
    });

    it('should include clear message about filing window', () => {
      const dateProvider = () => new Date(2025, 4, 10, 12, 0, 0);
      const middleware = createDeadlineEnforcer(dateProvider);
      
      middleware(mockReq, mockRes, mockNext);
      
      const jsonResponse = mockRes.json.mock.calls[0][0];
      expect(jsonResponse.error.message).toContain('January 1 - May 1');
      expect(jsonResponse.error.message).toContain('closed');
    });
  });
});
