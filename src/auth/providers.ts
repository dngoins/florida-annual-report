/**
 * OAuth2 Provider Configuration
 * 
 * Configures Google and Microsoft OAuth2 providers per architecture.md
 * and CONSTITUTION.md Principle VII: Security by Default.
 */

import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import type { OAuthConfig } from 'next-auth/providers/oauth';

/**
 * Provider-specific user profile mapping
 */
export interface ProviderProfile {
  id: string;
  email: string;
  name?: string;
  image?: string;
  emailVerified?: boolean;
}

/**
 * Google OAuth2 Provider Configuration
 * 
 * Required environment variables:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 */
export function getGoogleProvider(): OAuthConfig<any> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
    );
  }

  return GoogleProvider({
    clientId,
    clientSecret,
    authorization: {
      params: {
        prompt: 'consent',
        access_type: 'offline',
        response_type: 'code',
        scope: 'openid email profile',
      },
    },
    profile(profile): ProviderProfile {
      return {
        id: profile.sub,
        email: profile.email,
        name: profile.name,
        image: profile.picture,
        emailVerified: profile.email_verified,
      };
    },
  });
}

/**
 * Microsoft Azure AD OAuth2 Provider Configuration
 * 
 * Required environment variables:
 * - AZURE_AD_CLIENT_ID
 * - AZURE_AD_CLIENT_SECRET
 * - AZURE_AD_TENANT_ID
 */
export function getMicrosoftProvider(): OAuthConfig<any> {
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  const tenantId = process.env.AZURE_AD_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error(
      'Microsoft Azure AD OAuth not configured. Set AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID environment variables.'
    );
  }

  return AzureADProvider({
    clientId,
    clientSecret,
    tenantId,
    authorization: {
      params: {
        scope: 'openid email profile User.Read',
      },
    },
    profile(profile): ProviderProfile {
      return {
        id: profile.sub || profile.oid,
        email: profile.email || profile.preferred_username,
        name: profile.name,
        image: null, // Azure AD doesn't return image in basic profile
        emailVerified: true, // Azure AD emails are verified
      };
    },
  });
}

/**
 * Get all configured OAuth providers
 * 
 * Only returns providers that have credentials configured.
 * This allows the app to start even if only one provider is set up.
 */
export function getConfiguredProviders(): OAuthConfig<any>[] {
  const providers: OAuthConfig<any>[] = [];

  // Try Google
  try {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      providers.push(getGoogleProvider());
    }
  } catch (error) {
    console.warn('[Auth] Google provider not configured:', error);
  }

  // Try Microsoft
  try {
    if (
      process.env.AZURE_AD_CLIENT_ID &&
      process.env.AZURE_AD_CLIENT_SECRET &&
      process.env.AZURE_AD_TENANT_ID
    ) {
      providers.push(getMicrosoftProvider());
    }
  } catch (error) {
    console.warn('[Auth] Microsoft provider not configured:', error);
  }

  if (providers.length === 0) {
    console.warn(
      '[Auth] No OAuth providers configured. Set environment variables for at least one provider.'
    );
  }

  return providers;
}

/**
 * Supported provider names
 */
export const SUPPORTED_PROVIDERS = ['google', 'azure-ad'] as const;
export type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];

/**
 * Check if a provider is supported
 */
export function isSupportedProvider(provider: string): provider is SupportedProvider {
  return SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: SupportedProvider): string {
  const displayNames: Record<SupportedProvider, string> = {
    google: 'Google',
    'azure-ad': 'Microsoft',
  };
  return displayNames[provider] ?? provider;
}
