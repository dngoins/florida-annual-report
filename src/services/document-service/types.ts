/**
 * Document Service Type Definitions
 * 
 * Type definitions for document upload and storage operations.
 * See: docs/reference/api-contracts.md and docs/reference/data-model.md
 */

// ============================================================================
// File Types and Validation
// ============================================================================

/**
 * Allowed file MIME types for upload
 * Per spec: PDF, DOCX, CSV, Markdown
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'text/csv',
  'text/markdown',
  'text/x-markdown',
  'text/plain', // Sometimes markdown files are detected as plain text
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

/**
 * File extension to MIME type mapping
 */
export const EXTENSION_MIME_MAP: Record<string, AllowedMimeType[]> = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.csv': ['text/csv', 'text/plain'],
  '.md': ['text/markdown', 'text/x-markdown', 'text/plain'],
  '.markdown': ['text/markdown', 'text/x-markdown', 'text/plain'],
};

/**
 * Maximum file size in bytes (20MB)
 */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Standard API response envelope
 * Per CLAUDE.md: All REST responses use { status, data, error }
 */
export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Document upload response data
 * Per api-contracts.md: POST /documents returns { document_id, status }
 */
export interface DocumentUploadResponse {
  document_id: string;
  status: 'processing';
}

/**
 * Document metadata stored in database
 */
export interface DocumentMetadata {
  id: string;
  company_id?: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  blob_url: string;
  blob_path: string;
  status: DocumentStatus;
  uploaded_by: string;
  uploaded_at: Date;
  processed_at?: Date;
}

/**
 * Document processing status
 */
export type DocumentStatus = 
  | 'processing'   // Initial upload, queued for extraction
  | 'extracted'    // Data extraction complete
  | 'failed'       // Processing failed
  | 'archived';    // Retained for compliance

// ============================================================================
// Validation Types
// ============================================================================

/**
 * File validation result
 */
export interface FileValidationResult {
  valid: boolean;
  error?: {
    code: 'INVALID_MIME_TYPE' | 'FILE_TOO_LARGE' | 'EMPTY_FILE' | 'VALIDATION_ERROR';
    message: string;
  };
}

/**
 * Uploaded file info from multer
 */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Blob storage upload result
 */
export interface BlobUploadResult {
  success: boolean;
  blobUrl?: string;
  blobPath?: string;
  error?: string;
}

// ============================================================================
// Database Types
// ============================================================================

/**
 * Document record for database insertion
 */
export interface DocumentRecord {
  id: string;
  company_id: string | null;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  blob_url: string;
  blob_path: string;
  status: DocumentStatus;
  uploaded_by: string;
  uploaded_at: Date;
}

// ============================================================================
// Audit Types
// ============================================================================

/**
 * Audit log entry for document operations
 */
export interface DocumentAuditEntry {
  timestamp: Date;
  action: 'DOCUMENT_UPLOADED' | 'DOCUMENT_DELETED' | 'DOCUMENT_PROCESSED';
  document_id: string;
  user_id: string;
  details: Record<string, unknown>;
}
