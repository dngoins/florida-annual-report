/**
 * Unit tests for request logging middleware
 * Tests request ID generation and logging functionality
 */

const requestLogger = require('../../../../src/api/middleware/requestLogger');

describe('requestLogger middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      path: '/test',
      headers: {}
    };
    mockRes = {
      setHeader: jest.fn(),
      on: jest.fn()
    };
    mockNext = jest.fn();
  });

  describe('addRequestId', () => {
    it('should add a requestId to the request object', () => {
      requestLogger.addRequestId(mockReq, mockRes, mockNext);
      
      expect(mockReq.requestId).toBeDefined();
      expect(typeof mockReq.requestId).toBe('string');
    });

    it('should generate unique requestIds', () => {
      const req1 = { headers: {} };
      const req2 = { headers: {} };
      const res = { setHeader: jest.fn(), on: jest.fn() };
      
      requestLogger.addRequestId(req1, res, mockNext);
      requestLogger.addRequestId(req2, res, mockNext);
      
      expect(req1.requestId).not.toBe(req2.requestId);
    });

    it('should use existing X-Request-ID header if provided', () => {
      const existingId = 'existing-request-id-123';
      mockReq.headers['x-request-id'] = existingId;
      
      requestLogger.addRequestId(mockReq, mockRes, mockNext);
      
      expect(mockReq.requestId).toBe(existingId);
    });

    it('should set X-Request-ID response header', () => {
      requestLogger.addRequestId(mockReq, mockRes, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        mockReq.requestId
      );
    });

    it('should call next()', () => {
      requestLogger.addRequestId(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('logRequest', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockReq.requestId = 'test-request-id';
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log request method and path', () => {
      requestLogger.logRequest(mockReq, mockRes, mockNext);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GET')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('/test')
      );
    });

    it('should include requestId in log', () => {
      requestLogger.logRequest(mockReq, mockRes, mockNext);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('test-request-id')
      );
    });

    it('should call next()', () => {
      requestLogger.logRequest(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
