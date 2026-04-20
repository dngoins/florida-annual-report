/**
 * File Validator
 * 
 * Validates uploaded files for MIME type, file size, and content.
 * Per spec: Accept PDF, DOCX, CSV, Markdown; reject all others with 400.
 * Max file size: 20MB
 */

import * as path from 'path';
import {
  ALLOWED_MIME_TYPES,
  EXTENSION_MIME_MAP,
  MAX_FILE_SIZE_BYTES,
  FileValidationResult,
  UploadedFile,
} from '../types';

/**
 * Validate an uploaded file
 * 
 * Checks:
 * 1. File is not empty
 * 2. File size is within limit (20MB)
 * 3. MIME type is allowed (PDF, DOCX, CSV, Markdown)
 * 4. File extension matches MIME type
 * 
 * @param file - The uploaded file to validate
 * @param maxSizeBytes - Maximum allowed file size (default: 20MB)
 * @returns Validation result with error details if invalid
 */
export function validateFile(
  file: UploadedFile,
  maxSizeBytes: number = MAX_FILE_SIZE_BYTES
): FileValidationResult {
  // Check for empty file
  if (!file || !file.buffer || file.size === 0) {
    return {
      valid: false,
      error: {
        code: 'EMPTY_FILE',
        message: 'File is empty or missing',
      },
    };
  }

  // Check file size
  if (file.size > maxSizeBytes) {
    const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File size (${fileSizeMB}MB) exceeds maximum allowed size (${maxSizeMB}MB)`,
      },
    };
  }

  // Check MIME type
  const mimeValidation = validateMimeType(file.mimetype, file.originalname);
  if (!mimeValidation.valid) {
    return mimeValidation;
  }

  return { valid: true };
}

/**
 * Validate MIME type against allowed types
 * Also validates that file extension matches the MIME type
 * 
 * @param mimeType - The MIME type to validate
 * @param filename - Original filename to check extension
 * @returns Validation result
 */
export function validateMimeType(
  mimeType: string,
  filename: string
): FileValidationResult {
  // Normalize MIME type (lowercase, no parameters)
  const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim();
  
  // Check if MIME type is in allowed list
  const isAllowedMime = ALLOWED_MIME_TYPES.includes(normalizedMimeType as any);
  
  if (!isAllowedMime) {
    return {
      valid: false,
      error: {
        code: 'INVALID_MIME_TYPE',
        message: `File type '${normalizedMimeType}' is not allowed. Accepted types: PDF, DOCX, CSV, Markdown`,
      },
    };
  }

  // Get file extension and validate it matches MIME type
  const ext = path.extname(filename).toLowerCase();
  const allowedMimesForExt = EXTENSION_MIME_MAP[ext];
  
  // If extension is recognized, verify MIME type matches
  if (allowedMimesForExt && !allowedMimesForExt.includes(normalizedMimeType as any)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_MIME_TYPE',
        message: `File extension '${ext}' does not match content type '${normalizedMimeType}'`,
      },
    };
  }

  // Handle case where extension is not recognized but MIME type is valid
  // This allows files with unusual extensions but valid MIME types
  if (!allowedMimesForExt && ext) {
    // For security, we'll still allow it if MIME type is valid
    // But log a warning in production
    console.warn(`Unrecognized extension '${ext}' with valid MIME type '${normalizedMimeType}'`);
  }

  return { valid: true };
}

/**
 * Get human-readable file type from MIME type
 * 
 * @param mimeType - The MIME type
 * @returns Human-readable file type name
 */
export function getFileTypeName(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document (DOCX)',
    'text/csv': 'CSV',
    'text/markdown': 'Markdown',
    'text/x-markdown': 'Markdown',
    'text/plain': 'Plain Text',
  };
  
  return mimeMap[mimeType.toLowerCase()] || 'Unknown';
}

/**
 * Check if a file type is allowed for upload
 * 
 * @param mimeType - The MIME type to check
 * @returns True if the MIME type is allowed
 */
export function isAllowedFileType(mimeType: string): boolean {
  const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim();
  return ALLOWED_MIME_TYPES.includes(normalizedMimeType as any);
}

/**
 * Get list of allowed file extensions
 * 
 * @returns Array of allowed file extensions
 */
export function getAllowedExtensions(): string[] {
  return Object.keys(EXTENSION_MIME_MAP);
}
