/**
 * Unit tests for error handling middleware
 * Tests the centralized error handling that ensures all errors
 * are returned in the standard { status, data, error } envelope
 */

const errorHandler = require('../../../../src/api/middleware/errorHandler');

describe('errorHandler middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      path: '/test',
      requestId: 'test-request-id'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false
    };
    mockNext = jest.fn();
  });

  it('should return 500 status for generic errors', () => {
    const error = new Error('Something went wrong');
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });

  it('should use error.statusCode if provided', () => {
    const error = new Error('Not found');
    error.statusCode = 404;
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(404);
  });

  it('should return standard envelope format with status, data, error', () => {
    const error = new Error('Test error message');
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        data: null,
        error: expect.objectContaining({
          message: 'Test error message'
        })
      })
    );
  });

  it('should include requestId in error response', () => {
    const error = new Error('Test error');
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          requestId: 'test-request-id'
        })
      })
    );
  });

  it('should not expose stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    const error = new Error('Production error');
    errorHandler(error, mockReq, mockRes, mockNext);
    
    const response = mockRes.json.mock.calls[0][0];
    expect(response.error.stack).toBeUndefined();
    
    process.env.NODE_ENV = originalEnv;
  });

  it('should include stack trace in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    const error = new Error('Development error');
    errorHandler(error, mockReq, mockRes, mockNext);
    
    const response = mockRes.json.mock.calls[0][0];
    expect(response.error.stack).toBeDefined();
    
    process.env.NODE_ENV = originalEnv;
  });

  it('should call next() if headers already sent', () => {
    mockRes.headersSent = true;
    const error = new Error('Test error');
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockNext).toHaveBeenCalledWith(error);
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  it('should handle validation errors with 400 status', () => {
    const error = new Error('Validation failed');
    error.name = 'ValidationError';
    error.statusCode = 400;
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });
});
