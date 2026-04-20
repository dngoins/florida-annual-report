/**
 * Unit Tests for Auth Middleware
 * 
 * Tests authentication and authorization middleware.
 */

import {
  matchesRoute,
  protectedRoutes,
  publicRoutes,
} from '../../../src/auth/middleware';

describe('Auth Middleware Module', () => {
  describe('Route Matching', () => {
    describe('matchesRoute', () => {
      it('should match exact routes', () => {
        expect(matchesRoute('/login', ['/login'])).toBe(true);
        expect(matchesRoute('/api/health', ['/api/health'])).toBe(true);
      });

      it('should match wildcard routes', () => {
        expect(matchesRoute('/api/reports/123', ['/api/reports/:path*'])).toBe(true);
        expect(matchesRoute('/api/reports/123/details', ['/api/reports/:path*'])).toBe(true);
        expect(matchesRoute('/dashboard/overview', ['/dashboard/:path*'])).toBe(true);
      });

      it('should not match non-matching routes', () => {
        expect(matchesRoute('/api/other', ['/api/reports/:path*'])).toBe(false);
        expect(matchesRoute('/login', ['/register'])).toBe(false);
      });

      it('should match any pattern in the list', () => {
        const patterns = ['/login', '/register', '/api/health'];
        expect(matchesRoute('/login', patterns)).toBe(true);
        expect(matchesRoute('/register', patterns)).toBe(true);
        expect(matchesRoute('/api/health', patterns)).toBe(true);
        expect(matchesRoute('/other', patterns)).toBe(false);
      });
    });

    describe('protectedRoutes', () => {
      it('should include API routes that need protection', () => {
        expect(protectedRoutes).toContain('/api/reports/:path*');
        expect(protectedRoutes).toContain('/api/submissions/:path*');
        expect(protectedRoutes).toContain('/api/companies/:path*');
        expect(protectedRoutes).toContain('/api/users/:path*');
        expect(protectedRoutes).toContain('/api/settings/:path*');
      });

      it('should include dashboard routes', () => {
        expect(protectedRoutes).toContain('/dashboard/:path*');
      });
    });

    describe('publicRoutes', () => {
      it('should include auth routes', () => {
        expect(publicRoutes).toContain('/api/auth/:path*');
      });

      it('should include health check', () => {
        expect(publicRoutes).toContain('/api/health');
      });

      it('should include login and register pages', () => {
        expect(publicRoutes).toContain('/login');
        expect(publicRoutes).toContain('/register');
      });

      it('should include home page', () => {
        expect(publicRoutes).toContain('/');
      });
    });
  });

  describe('Route Classification', () => {
    it('should correctly classify protected API routes', () => {
      const testCases = [
        { path: '/api/reports/123', shouldBeProtected: true },
        { path: '/api/submissions/456', shouldBeProtected: true },
        { path: '/api/companies/789', shouldBeProtected: true },
        { path: '/api/users/abc', shouldBeProtected: true },
        { path: '/api/settings/config', shouldBeProtected: true },
        { path: '/dashboard/overview', shouldBeProtected: true },
      ];

      testCases.forEach(({ path, shouldBeProtected }) => {
        const isProtected = matchesRoute(path, protectedRoutes);
        expect(isProtected).toBe(shouldBeProtected);
      });
    });

    it('should correctly classify public routes', () => {
      const testCases = [
        { path: '/api/auth/signin', shouldBePublic: true },
        { path: '/api/auth/signout', shouldBePublic: true },
        { path: '/api/health', shouldBePublic: true },
        { path: '/login', shouldBePublic: true },
        { path: '/register', shouldBePublic: true },
        { path: '/', shouldBePublic: true },
      ];

      testCases.forEach(({ path, shouldBePublic }) => {
        const isPublic = matchesRoute(path, publicRoutes);
        expect(isPublic).toBe(shouldBePublic);
      });
    });

    it('should not expose protected routes as public', () => {
      const testCases = [
        '/api/reports/123',
        '/api/submissions/456',
        '/api/users/abc',
        '/dashboard/settings',
      ];

      testCases.forEach((path) => {
        const isPublic = matchesRoute(path, publicRoutes);
        expect(isPublic).toBe(false);
      });
    });
  });
});

// Note: Full middleware testing requires mocking NextAuth and NextRequest
// These tests cover the route matching logic which is the core of the middleware
// Integration tests would test the full middleware with mocked auth
describe('Auth Middleware Integration Points', () => {
  it('should export withAuth factory function', async () => {
    const { withAuth } = await import('../../../src/auth/middleware');
    expect(typeof withAuth).toBe('function');
  });

  it('should export convenience middleware functions', async () => {
    const { 
      adminOnly, 
      preparerOrAbove, 
      reviewerOrAbove, 
      authenticated 
    } = await import('../../../src/auth/middleware');
    
    expect(typeof adminOnly).toBe('function');
    expect(typeof preparerOrAbove).toBe('function');
    expect(typeof reviewerOrAbove).toBe('function');
    expect(typeof authenticated).toBe('function');
  });

  it('should export authMiddleware for Next.js edge runtime', async () => {
    const { authMiddleware } = await import('../../../src/auth/middleware');
    expect(typeof authMiddleware).toBe('function');
  });
});
