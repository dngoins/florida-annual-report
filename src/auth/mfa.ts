/**
 * Multi-Factor Authentication (TOTP)
 * 
 * Implements MFA per CONSTITUTION.md Principle VII and risk-compliance.md:
 * - TOTP via authenticator app (Google Authenticator, Authy, etc.)
 * - Backup codes for recovery
 * - Required for admin and preparer roles
 */

import * as crypto from 'crypto';

/**
 * TOTP Configuration
 */
export const TOTP_CONFIG = {
  issuer: 'Florida Annual Report',
  algorithm: 'SHA1',
  digits: 6,
  period: 30, // seconds
  window: 1, // Allow 1 period before/after for clock drift
};

/**
 * Backup codes configuration
 */
export const BACKUP_CODES_CONFIG = {
  count: 10,
  length: 8,
};

export interface MFASetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MFAVerificationResult {
  valid: boolean;
  usedBackupCode?: boolean;
  remainingBackupCodes?: number;
}

/**
 * Generate a random base32 secret for TOTP
 */
export function generateTOTPSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Base32 encoding (RFC 4648)
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * Base32 decoding
 */
function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanedInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of cleanedInput) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(output);
}

/**
 * Generate TOTP code for a given secret and time
 */
export function generateTOTP(secret: string, time?: number): string {
  const currentTime = time ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(currentTime / TOTP_CONFIG.period);
  
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const secretBuffer = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', secretBuffer);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = code % Math.pow(10, TOTP_CONFIG.digits);
  return otp.toString().padStart(TOTP_CONFIG.digits, '0');
}

/**
 * Verify a TOTP code
 */
export function verifyTOTP(secret: string, code: string): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Check current period and adjacent periods (for clock drift)
  for (let i = -TOTP_CONFIG.window; i <= TOTP_CONFIG.window; i++) {
    const checkTime = currentTime + i * TOTP_CONFIG.period;
    const expectedCode = generateTOTP(secret, checkTime);
    
    if (timingSafeEqual(code, expectedCode)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate backup codes for account recovery
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < BACKUP_CODES_CONFIG.count; i++) {
    const code = crypto.randomBytes(BACKUP_CODES_CONFIG.length / 2).toString('hex');
    // Format as XXXX-XXXX for readability
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
    codes.push(formatted);
  }
  
  return codes;
}

/**
 * Hash backup codes for secure storage
 */
export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.replace('-', '')).digest('hex');
}

/**
 * Verify a backup code against stored hashes
 */
export function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): { valid: boolean; usedIndex: number } {
  const inputHash = hashBackupCode(code);
  
  const usedIndex = hashedCodes.findIndex((hash) => 
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(inputHash))
  );
  
  return {
    valid: usedIndex !== -1,
    usedIndex,
  };
}

/**
 * Generate QR code URL for authenticator app setup
 */
export function generateQRCodeURL(
  secret: string,
  userEmail: string
): string {
  const issuer = encodeURIComponent(TOTP_CONFIG.issuer);
  const account = encodeURIComponent(userEmail);
  
  return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=${TOTP_CONFIG.algorithm}&digits=${TOTP_CONFIG.digits}&period=${TOTP_CONFIG.period}`;
}

/**
 * Setup MFA for a user - generates secret, QR code URL, and backup codes
 */
export function setupMFA(userEmail: string): MFASetup {
  const secret = generateTOTPSecret();
  const qrCodeUrl = generateQRCodeURL(secret, userEmail);
  const backupCodes = generateBackupCodes();
  
  return {
    secret,
    qrCodeUrl,
    backupCodes,
  };
}

/**
 * Verify MFA code (TOTP or backup code)
 */
export function verifyMFA(
  code: string,
  totpSecret: string,
  hashedBackupCodes: string[]
): MFAVerificationResult {
  // First try TOTP
  if (verifyTOTP(totpSecret, code)) {
    return {
      valid: true,
      usedBackupCode: false,
    };
  }
  
  // Then try backup codes
  const backupResult = verifyBackupCode(code, hashedBackupCodes);
  if (backupResult.valid) {
    return {
      valid: true,
      usedBackupCode: true,
      remainingBackupCodes: hashedBackupCodes.length - 1,
    };
  }
  
  return {
    valid: false,
  };
}
