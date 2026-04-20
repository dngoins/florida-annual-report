/**
 * Unit Tests for MFA (TOTP) Module
 * 
 * Tests TOTP generation, verification, and backup codes.
 */

import {
  TOTP_CONFIG,
  BACKUP_CODES_CONFIG,
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  generateQRCodeURL,
  setupMFA,
  verifyMFA,
} from '../../../src/auth/mfa';

describe('MFA Module', () => {
  describe('TOTP Configuration', () => {
    it('should have correct default configuration', () => {
      expect(TOTP_CONFIG.issuer).toBe('Florida Annual Report');
      expect(TOTP_CONFIG.algorithm).toBe('SHA1');
      expect(TOTP_CONFIG.digits).toBe(6);
      expect(TOTP_CONFIG.period).toBe(30);
      expect(TOTP_CONFIG.window).toBe(1);
    });

    it('should have correct backup codes configuration', () => {
      expect(BACKUP_CODES_CONFIG.count).toBe(10);
      expect(BACKUP_CODES_CONFIG.length).toBe(8);
    });
  });

  describe('generateTOTPSecret', () => {
    it('should generate a base32-encoded secret', () => {
      const secret = generateTOTPSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      // Base32 only uses A-Z and 2-7
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('should generate unique secrets', () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 100; i++) {
        secrets.add(generateTOTPSecret());
      }
      expect(secrets.size).toBe(100);
    });

    it('should generate secrets of appropriate length', () => {
      const secret = generateTOTPSecret();
      // 20 bytes encoded in base32 = 32 characters
      expect(secret.length).toBe(32);
    });
  });

  describe('generateTOTP', () => {
    const testSecret = 'JBSWY3DPEHPK3PXP'; // Standard test secret

    it('should generate a 6-digit code', () => {
      const code = generateTOTP(testSecret);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate consistent codes for same time', () => {
      const time = 1234567890;
      const code1 = generateTOTP(testSecret, time);
      const code2 = generateTOTP(testSecret, time);
      expect(code1).toBe(code2);
    });

    it('should generate different codes for different times', () => {
      const time1 = 1234567890;
      const time2 = time1 + 30; // Next period
      const code1 = generateTOTP(testSecret, time1);
      const code2 = generateTOTP(testSecret, time2);
      expect(code1).not.toBe(code2);
    });

    it('should generate same code within same 30-second period', () => {
      const time1 = 1234567890;
      const time2 = time1 + 15; // Same period
      const code1 = generateTOTP(testSecret, time1);
      const code2 = generateTOTP(testSecret, time2);
      expect(code1).toBe(code2);
    });
  });

  describe('verifyTOTP', () => {
    it('should verify a valid current code', () => {
      const secret = generateTOTPSecret();
      const code = generateTOTP(secret);
      expect(verifyTOTP(secret, code)).toBe(true);
    });

    it('should reject an invalid code', () => {
      const secret = generateTOTPSecret();
      expect(verifyTOTP(secret, '000000')).toBe(false);
      expect(verifyTOTP(secret, '123456')).toBe(false);
    });

    it('should accept codes within the window period', () => {
      const secret = generateTOTPSecret();
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Generate code for previous period
      const prevCode = generateTOTP(secret, currentTime - 30);
      // Should still be valid due to window
      expect(verifyTOTP(secret, prevCode)).toBe(true);
    });

    it('should reject codes outside the window period', () => {
      const secret = generateTOTPSecret();
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Generate code for much older period (outside window)
      const oldCode = generateTOTP(secret, currentTime - 90);
      expect(verifyTOTP(secret, oldCode)).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate the configured number of backup codes', () => {
      const codes = generateBackupCodes();
      expect(codes.length).toBe(BACKUP_CODES_CONFIG.count);
    });

    it('should generate codes in XXXX-XXXX format', () => {
      const codes = generateBackupCodes();
      codes.forEach((code) => {
        expect(code).toMatch(/^[a-f0-9]{4}-[a-f0-9]{4}$/);
      });
    });

    it('should generate unique codes', () => {
      const codes = generateBackupCodes();
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should generate different codes each time', () => {
      const codes1 = generateBackupCodes();
      const codes2 = generateBackupCodes();
      const allCodes = new Set([...codes1, ...codes2]);
      expect(allCodes.size).toBe(codes1.length + codes2.length);
    });
  });

  describe('hashBackupCode', () => {
    it('should return a SHA-256 hash', () => {
      const hash = hashBackupCode('abcd-efgh');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes', () => {
      const hash1 = hashBackupCode('abcd-efgh');
      const hash2 = hashBackupCode('abcd-efgh');
      expect(hash1).toBe(hash2);
    });

    it('should handle codes with or without dashes', () => {
      const hash1 = hashBackupCode('abcd-efgh');
      const hash2 = hashBackupCode('abcdefgh');
      expect(hash1).toBe(hash2);
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify a valid backup code', () => {
      const codes = generateBackupCodes();
      const hashedCodes = codes.map(hashBackupCode);
      
      const result = verifyBackupCode(codes[0], hashedCodes);
      expect(result.valid).toBe(true);
      expect(result.usedIndex).toBe(0);
    });

    it('should return index of used code', () => {
      const codes = generateBackupCodes();
      const hashedCodes = codes.map(hashBackupCode);
      
      const result = verifyBackupCode(codes[5], hashedCodes);
      expect(result.valid).toBe(true);
      expect(result.usedIndex).toBe(5);
    });

    it('should reject an invalid backup code', () => {
      const codes = generateBackupCodes();
      const hashedCodes = codes.map(hashBackupCode);
      
      const result = verifyBackupCode('xxxx-xxxx', hashedCodes);
      expect(result.valid).toBe(false);
      expect(result.usedIndex).toBe(-1);
    });
  });

  describe('generateQRCodeURL', () => {
    it('should generate a valid otpauth URL', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const email = 'user@example.com';
      const url = generateQRCodeURL(secret, email);
      
      expect(url).toContain('otpauth://totp/');
      expect(url).toContain(secret);
      expect(url).toContain(encodeURIComponent(email));
      expect(url).toContain('issuer=');
    });

    it('should include correct parameters', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const email = 'test@test.com';
      const url = generateQRCodeURL(secret, email);
      
      expect(url).toContain('algorithm=SHA1');
      expect(url).toContain('digits=6');
      expect(url).toContain('period=30');
    });

    it('should properly encode special characters in email', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const email = 'user+tag@example.com';
      const url = generateQRCodeURL(secret, email);
      
      expect(url).toContain(encodeURIComponent(email));
    });
  });

  describe('setupMFA', () => {
    it('should return secret, QR code URL, and backup codes', () => {
      const setup = setupMFA('user@example.com');
      
      expect(setup.secret).toBeDefined();
      expect(setup.qrCodeUrl).toBeDefined();
      expect(setup.backupCodes).toBeDefined();
      expect(setup.backupCodes.length).toBe(BACKUP_CODES_CONFIG.count);
    });

    it('should generate a valid secret', () => {
      const setup = setupMFA('user@example.com');
      expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('should generate a valid QR code URL', () => {
      const email = 'user@example.com';
      const setup = setupMFA(email);
      expect(setup.qrCodeUrl).toContain('otpauth://totp/');
      expect(setup.qrCodeUrl).toContain(setup.secret);
    });
  });

  describe('verifyMFA', () => {
    it('should verify valid TOTP code', () => {
      const setup = setupMFA('user@example.com');
      const code = generateTOTP(setup.secret);
      const hashedBackupCodes = setup.backupCodes.map(hashBackupCode);
      
      const result = verifyMFA(code, setup.secret, hashedBackupCodes);
      expect(result.valid).toBe(true);
      expect(result.usedBackupCode).toBe(false);
    });

    it('should verify valid backup code', () => {
      const setup = setupMFA('user@example.com');
      const hashedBackupCodes = setup.backupCodes.map(hashBackupCode);
      
      const result = verifyMFA(setup.backupCodes[0], setup.secret, hashedBackupCodes);
      expect(result.valid).toBe(true);
      expect(result.usedBackupCode).toBe(true);
      expect(result.remainingBackupCodes).toBe(BACKUP_CODES_CONFIG.count - 1);
    });

    it('should reject invalid code', () => {
      const setup = setupMFA('user@example.com');
      const hashedBackupCodes = setup.backupCodes.map(hashBackupCode);
      
      const result = verifyMFA('000000', setup.secret, hashedBackupCodes);
      expect(result.valid).toBe(false);
    });
  });
});
