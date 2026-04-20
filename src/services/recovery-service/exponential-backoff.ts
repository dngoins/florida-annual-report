/**
 * Exponential Backoff Calculator
 * 
 * Calculates retry delays with exponential growth and optional jitter
 * Per CONSTITUTION.md Principle III: Fail-Safe Automation
 */

import { BackoffConfig } from './types';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1000,    // 1 second
  maxDelayMs: 30000,    // 30 seconds max
  multiplier: 2,        // Double each retry
  jitterFactor: 0.25,   // ±25% jitter
};

// ============================================================================
// Backoff Calculator
// ============================================================================

/**
 * Calculate the delay before the next retry attempt
 * 
 * Uses exponential backoff: delay = baseDelay * multiplier^(retryCount-1)
 * 
 * @param retryCount - The retry attempt number (1-based)
 * @param config - Backoff configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoff(
  retryCount: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): number {
  // Validate retry count
  if (retryCount < 1) {
    throw new Error('Retry count must be >= 1');
  }

  // Calculate base exponential delay
  // For retry 1: baseDelay * 2^0 = baseDelay
  // For retry 2: baseDelay * 2^1 = baseDelay * 2
  // For retry 3: baseDelay * 2^2 = baseDelay * 4
  const exponentialDelay = config.baseDelayMs * Math.pow(config.multiplier, retryCount - 1);

  // Apply jitter if configured
  let delay = exponentialDelay;
  if (config.jitterFactor > 0) {
    delay = applyJitter(exponentialDelay, config.jitterFactor);
  }

  // Cap at maximum delay
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Apply jitter to a delay value
 * Jitter adds randomness to prevent thundering herd problems
 * 
 * @param delay - Base delay in milliseconds
 * @param factor - Jitter factor (0-1), e.g., 0.25 = ±25%
 * @returns Jittered delay
 */
export function applyJitter(delay: number, factor: number): number {
  // Random value between -factor and +factor
  const jitter = factor * (Math.random() * 2 - 1);
  return Math.round(delay * (1 + jitter));
}

/**
 * Calculate all delays for a given number of retries
 * Useful for estimating total wait time
 * 
 * @param maxRetries - Maximum number of retries
 * @param config - Backoff configuration
 * @returns Array of delays (without jitter for predictability)
 */
export function calculateAllDelays(
  maxRetries: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): number[] {
  const delays: number[] = [];
  const configWithoutJitter = { ...config, jitterFactor: 0 };
  
  for (let i = 1; i <= maxRetries; i++) {
    delays.push(calculateBackoff(i, configWithoutJitter));
  }
  
  return delays;
}

/**
 * Estimate total wait time for all retries
 * 
 * @param maxRetries - Maximum number of retries
 * @param config - Backoff configuration
 * @returns Total wait time in milliseconds (without jitter)
 */
export function estimateTotalWaitTime(
  maxRetries: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): number {
  return calculateAllDelays(maxRetries, config).reduce((sum, delay) => sum + delay, 0);
}

/**
 * Sleep for a calculated backoff duration
 * 
 * @param retryCount - The retry attempt number
 * @param config - Backoff configuration
 * @returns Promise that resolves after the delay
 */
export async function backoffSleep(
  retryCount: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): Promise<number> {
  const delay = calculateBackoff(retryCount, config);
  await sleep(delay);
  return delay;
}

/**
 * Simple sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Re-export types
export { BackoffConfig };
