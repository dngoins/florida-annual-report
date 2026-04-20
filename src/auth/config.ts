/**
 * NextAuth.js Configuration
 * 
 * Implements OAuth2 authentication per CONSTITUTION.md Principle VII
 * with JWT tokens (1-hour expiry) and refresh token rotation.
 */

import type { NextAuthOptions, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { getConfiguredProviders } from './providers';
import { Role, isValidRole, requiresMFA, ROLES } from './roles';
import { logLoginSuccess, logLoginFailure, logTokenRefresh, logLogout } from './audit';

/**
 * JWT token configuration
 */
export const JWT_CONFIG = {
  maxAge: 60 * 60, // 1 hour in seconds
  updateAge: 5 * 60, // Refresh token if older than 5 minutes
};

/**
 * Extended session type with role and MFA status
 */
export interface ExtendedSession extends Session {
  user: {
    id: string;
    email: string;
    name?: string;
    image?: string;
    role: Role;
    mfaVerified: boolean;
    mfaRequired: boolean;
  };
  accessToken?: string;
  error?: string;
}

/**
 * Extended JWT type with custom claims
 */
export interface ExtendedJWT extends JWT {
  role: Role;
  mfaVerified: boolean;
  mfaRequired: boolean;
  provider: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  error?: string;
}

/**
 * Get user's role from database
 * 
 * In production, this would query your user database.
 * Default role is 'read-only' for new users.
 */
async function getUserRole(userId: string, email: string): Promise<Role> {
  // TODO: Replace with actual database lookup
  // For now, return read-only as default safe role
  // Admin users should be assigned via database/admin panel
  
  // Example: Check if user is in admin list (from env for bootstrap)
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) ?? [];
  if (adminEmails.includes(email)) {
    return 'admin';
  }
  
  return 'read-only';
}

/**
 * Check if user has completed MFA setup and verification
 * 
 * In production, this would check the user's MFA status in the database.
 */
async function checkUserMFAStatus(userId: string): Promise<{ setup: boolean; verified: boolean }> {
  // TODO: Replace with actual database lookup
  // For now, assume MFA is not set up
  return { setup: false, verified: false };
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(token: ExtendedJWT): Promise<ExtendedJWT> {
  try {
    // For Google OAuth
    if (token.provider === 'google' && token.refreshToken) {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
        }),
      });

      const refreshedTokens = await response.json();

      if (!response.ok) {
        throw new Error(refreshedTokens.error || 'Failed to refresh token');
      }

      // Log token refresh
      await logTokenRefresh(token.sub!, token.email!);

      return {
        ...token,
        accessToken: refreshedTokens.access_token,
        accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
        refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      };
    }

    // For Azure AD
    if (token.provider === 'azure-ad' && token.refreshToken) {
      const response = await fetch(
        `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.AZURE_AD_CLIENT_ID!,
            client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken,
            scope: 'openid email profile User.Read',
          }),
        }
      );

      const refreshedTokens = await response.json();

      if (!response.ok) {
        throw new Error(refreshedTokens.error || 'Failed to refresh token');
      }

      // Log token refresh
      await logTokenRefresh(token.sub!, token.email!);

      return {
        ...token,
        accessToken: refreshedTokens.access_token,
        accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
        refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      };
    }

    // No refresh token available, return as-is
    return token;
  } catch (error) {
    console.error('[Auth] Error refreshing access token:', error);
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

/**
 * NextAuth.js configuration
 */
export const authOptions: NextAuthOptions = {
  providers: getConfiguredProviders(),
  
  session: {
    strategy: 'jwt',
    maxAge: JWT_CONFIG.maxAge,
    updateAge: JWT_CONFIG.updateAge,
  },

  jwt: {
    maxAge: JWT_CONFIG.maxAge,
  },

  pages: {
    signIn: '/login',
    signOut: '/logout',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
  },

  callbacks: {
    /**
     * Sign-in callback - validate user and log event
     */
    async signIn({ user, account, profile }) {
      if (!user.email) {
        await logLoginFailure('unknown', account?.provider ?? 'unknown', 'No email provided');
        return false;
      }

      // Log successful sign-in
      await logLoginSuccess(
        user.id ?? 'unknown',
        user.email,
        account?.provider ?? 'unknown'
      );

      return true;
    },

    /**
     * JWT callback - add custom claims to token
     */
    async jwt({ token, user, account, trigger }): Promise<ExtendedJWT> {
      const extendedToken = token as ExtendedJWT;

      // Initial sign-in
      if (account && user) {
        const role = await getUserRole(user.id!, user.email!);
        const mfaStatus = await checkUserMFAStatus(user.id!);

        return {
          ...extendedToken,
          sub: user.id,
          email: user.email,
          name: user.name,
          picture: user.image,
          role,
          mfaVerified: mfaStatus.verified,
          mfaRequired: requiresMFA(role),
          provider: account.provider,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + JWT_CONFIG.maxAge * 1000,
        };
      }

      // Handle MFA verification update
      if (trigger === 'update' && token.sub) {
        const mfaStatus = await checkUserMFAStatus(token.sub);
        return {
          ...extendedToken,
          mfaVerified: mfaStatus.verified,
        };
      }

      // Return previous token if still valid
      if (extendedToken.accessTokenExpires && Date.now() < extendedToken.accessTokenExpires) {
        return extendedToken;
      }

      // Access token expired, try to refresh
      return refreshAccessToken(extendedToken);
    },

    /**
     * Session callback - expose claims to client
     */
    async session({ session, token }): Promise<ExtendedSession> {
      const extendedToken = token as ExtendedJWT;

      return {
        ...session,
        user: {
          id: extendedToken.sub!,
          email: extendedToken.email!,
          name: extendedToken.name ?? undefined,
          image: extendedToken.picture ?? undefined,
          role: extendedToken.role,
          mfaVerified: extendedToken.mfaVerified,
          mfaRequired: extendedToken.mfaRequired,
        },
        accessToken: extendedToken.accessToken,
        error: extendedToken.error,
      };
    },
  },

  events: {
    /**
     * Sign-out event - log to audit
     */
    async signOut({ token }) {
      if (token?.sub && token?.email) {
        await logLogout(token.sub as string, token.email as string);
      }
    },
  },

  // Security settings
  debug: process.env.NODE_ENV === 'development',
  
  // CSRF protection is enabled by default
  // Cookies are secure in production (HTTPS only)
};

/**
 * Export auth handler for API routes
 */
export default authOptions;
