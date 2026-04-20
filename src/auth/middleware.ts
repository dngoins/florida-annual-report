/**
 * Authentication and Authorization Middleware
 * 
 * Implements role enforcement per CONSTITUTION.md Principle VII:
 * - JWT token validation
 * - Role-based access control
 * - MFA verification for protected roles
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { hasPermission, requiresMFA, Role, isValidRole } from './roles';
import { logPermissionDenied } from './audit';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  role: Role;
  mfaVerified: boolean;
  provider: string;
}

export interface AuthMiddlewareOptions {
  requiredRole?: Role;
  requiredPermission?: {
    resource: string;
    action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'submit';
  };
  requireMFA?: boolean;
}

/**
 * Extract client IP from request headers
 */
function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Create unauthorized response
 */
function unauthorized(message: string): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized', message },
    { status: 401 }
  );
}

/**
 * Create forbidden response
 */
function forbidden(message: string): NextResponse {
  return NextResponse.json(
    { error: 'Forbidden', message },
    { status: 403 }
  );
}

/**
 * Authentication middleware factory
 * 
 * Usage:
 * ```
 * export const GET = withAuth({ requiredPermission: { resource: 'reports', action: 'read' } })(handler);
 * ```
 */
export function withAuth(options: AuthMiddlewareOptions = {}) {
  return function <T extends (request: NextRequest, context: { user: AuthenticatedUser }) => Promise<NextResponse>>(
    handler: T
  ) {
    return async function (request: NextRequest): Promise<NextResponse> {
      try {
        // Get JWT token from session
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET,
        });

        if (!token) {
          return unauthorized('Authentication required');
        }

        // Validate user data in token
        if (!token.sub || !token.email || !token.role) {
          return unauthorized('Invalid token: missing required claims');
        }

        // Validate role
        const role = token.role as string;
        if (!isValidRole(role)) {
          return unauthorized(`Invalid role: ${role}`);
        }

        const user: AuthenticatedUser = {
          id: token.sub,
          email: token.email as string,
          name: token.name as string | undefined,
          role: role as Role,
          mfaVerified: token.mfaVerified as boolean ?? false,
          provider: token.provider as string ?? 'unknown',
        };

        // Check MFA requirement
        const mfaRequired = options.requireMFA ?? requiresMFA(user.role);
        if (mfaRequired && !user.mfaVerified) {
          return forbidden('MFA verification required for this role');
        }

        // Check role requirement
        if (options.requiredRole && user.role !== options.requiredRole) {
          const clientIP = getClientIP(request);
          await logPermissionDenied(
            user.id,
            user.email,
            user.role,
            'role',
            options.requiredRole,
            clientIP
          );
          return forbidden(`Role '${options.requiredRole}' required`);
        }

        // Check permission requirement
        if (options.requiredPermission) {
          const { resource, action } = options.requiredPermission;
          if (!hasPermission(user.role, resource, action)) {
            const clientIP = getClientIP(request);
            await logPermissionDenied(
              user.id,
              user.email,
              user.role,
              resource,
              action,
              clientIP
            );
            return forbidden(
              `Permission denied: '${action}' on '${resource}' requires higher privileges`
            );
          }
        }

        // Call the actual handler with authenticated user
        return handler(request, { user });
      } catch (error) {
        console.error('[Auth Middleware] Error:', error);
        return unauthorized('Authentication failed');
      }
    };
  };
}

/**
 * Convenience middleware for admin-only routes
 */
export function adminOnly() {
  return withAuth({ requiredRole: 'admin' });
}

/**
 * Convenience middleware for preparer routes (create/edit reports)
 */
export function preparerOrAbove() {
  return withAuth({
    requiredPermission: { resource: 'reports', action: 'create' },
  });
}

/**
 * Convenience middleware for reviewer routes (approve reports)
 */
export function reviewerOrAbove() {
  return withAuth({
    requiredPermission: { resource: 'reports', action: 'approve' },
  });
}

/**
 * Convenience middleware for any authenticated user
 */
export function authenticated() {
  return withAuth({});
}

/**
 * Route matcher for Next.js middleware config
 * Returns paths that should be protected by auth
 */
export const protectedRoutes = [
  '/api/reports/:path*',
  '/api/submissions/:path*',
  '/api/companies/:path*',
  '/api/users/:path*',
  '/api/settings/:path*',
  '/dashboard/:path*',
];

/**
 * Public routes that don't require authentication
 */
export const publicRoutes = [
  '/api/auth/:path*',
  '/api/health',
  '/login',
  '/register',
  '/',
];

/**
 * Check if a path matches any pattern in a list
 */
export function matchesRoute(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const regexPattern = pattern
      .replace(/\//g, '\\/')
      .replace(/:path\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(pathname);
  });
}

/**
 * Next.js middleware function for edge runtime
 */
export async function authMiddleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (matchesRoute(pathname, publicRoutes)) {
    return NextResponse.next();
  }

  // Check protected routes
  if (matchesRoute(pathname, protectedRoutes)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      // Redirect to login for browser requests, 401 for API
      if (pathname.startsWith('/api/')) {
        return unauthorized('Authentication required');
      }
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}
