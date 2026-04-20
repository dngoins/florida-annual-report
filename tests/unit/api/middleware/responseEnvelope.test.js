/**
 * Unit tests for response envelope middleware
 * Tests that all responses follow the { status, data, error } convention
 */

const responseEnvelope = require('../../../../src/api/middleware/responseEnvelope');

describe('responseEnvelope middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      requestId: 'test-request-id'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  it('should add success method to response object', () => {
    responseEnvelope(mockReq, mockRes, mockNext);
    
    expect(typeof mockRes.success).toBe('function');
  });

  it('should add error method to response object', () => {
    responseEnvelope(mockReq, mockRes, mockNext);
    
    expect(typeof mockRes.error).toBe('function');
  });

  it('should call next()', () => {
    responseEnvelope(mockReq, mockRes, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
  });

  describe('res.success()', () => {
    beforeEach(() => {
      responseEnvelope(mockReq, mockRes, mockNext);
    });

    it('should return standard envelope with status "success"', () => {
      mockRes.success({ foo: 'bar' });
      
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        data: { foo: 'bar' },
        error: null
      });
    });

    it('should default to 200 status code', () => {
      mockRes.success({ foo: 'bar' });
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should accept custom status code', () => {
      mockRes.success({ id: '123' }, 201);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should handle null data', () => {
      mockRes.success(null);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        data: null,
        error: null
      });
    });

    it('should handle array data', () => {
      mockRes.success([1, 2, 3]);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        data: [1, 2, 3],
        error: null
      });
    });
  });

  describe('res.error()', () => {
    beforeEach(() => {
      responseEnvelope(mockReq, mockRes, mockNext);
    });

    it('should return standard envelope with status "error"', () => {
      mockRes.error('Something went wrong');
      
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        data: null,
        error: {
          message: 'Something went wrong',
          requestId: 'test-request-id'
        }
      });
    });

    it('should default to 400 status code', () => {
      mockRes.error('Bad request');
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should accept custom status code', () => {
      mockRes.error('Not found', 404);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should include additional error details if provided', () => {
      mockRes.error('Validation failed', 400, { fields: ['email'] });
      
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        data: null,
        error: {
          message: 'Validation failed',
          requestId: 'test-request-id',
          fields: ['email']
        }
      });
    });
  });
});
