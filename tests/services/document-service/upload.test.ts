/**
 * Document Service Unit Tests
 * 
 * Tests for document upload functionality per acceptance criteria:
 * - Valid upload
 * - Invalid type rejection
 * - Oversized file rejection
 */

import {
  validateFile,
  validateMimeType,
  isAllowedFileType,
  getAllowedExtensions,
} from '../../../src/services/document-service/validators/file-validator';
import {
  DocumentService,
  createTestDocumentService,
} from '../../../src/services/document-service';
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  UploadedFile,
} from '../../../src/services/document-service/types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock uploaded file for testing
 */
function createMockFile(options: {
  filename?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
}): UploadedFile {
  const content = options.buffer || Buffer.from('test file content');
  return {
    fieldname: 'file',
    originalname: options.filename || 'test.pdf',
    encoding: '7bit',
    mimetype: options.mimetype || 'application/pdf',
    buffer: content,
    size: options.size ?? content.length,
  };
}

// ============================================================================
// File Validator Tests
// ============================================================================

describe('File Validator', () => {
  describe('validateFile', () => {
    it('should accept valid PDF file', () => {
      const file = createMockFile({
        filename: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      });

      const result = validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid DOCX file', () => {
      const file = createMockFile({
        filename: 'document.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 2048,
      });

      const result = validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid CSV file', () => {
      const file = createMockFile({
        filename: 'data.csv',
        mimetype: 'text/csv',
        size: 512,
      });

      const result = validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid Markdown file', () => {
      const file = createMockFile({
        filename: 'readme.md',
        mimetype: 'text/markdown',
        size: 256,
      });

      const result = validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept Markdown file with text/plain MIME type', () => {
      const file = createMockFile({
        filename: 'readme.md',
        mimetype: 'text/plain',
        size: 256,
      });

      const result = validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid MIME type (executable)', () => {
      const file = createMockFile({
        filename: 'malware.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
      });

      const result = validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_MIME_TYPE');
      expect(result.error?.message).toContain('not allowed');
    });

    it('should reject invalid MIME type (image)', () => {
      const file = createMockFile({
        filename: 'image.png',
        mimetype: 'image/png',
        size: 1024,
      });

      const result = validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_MIME_TYPE');
    });

    it('should reject invalid MIME type (JavaScript)', () => {
      const file = createMockFile({
        filename: 'script.js',
        mimetype: 'application/javascript',
        size: 512,
      });

      const result = validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_MIME_TYPE');
    });

    it('should reject oversized file (> 20MB)', () => {
      const file = createMockFile({
        filename: 'huge.pdf',
        mimetype: 'application/pdf',
        size: 25 * 1024 * 1024, // 25MB
        buffer: Buffer.alloc(25 * 1024 * 1024),
      });

      const result = validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('FILE_TOO_LARGE');
      expect(result.error?.message).toContain('exceeds maximum');
    });

    it('should accept file at exactly 20MB', () => {
      const file = createMockFile({
        filename: 'max-size.pdf',
        mimetype: 'application/pdf',
        size: MAX_FILE_SIZE_BYTES,
        buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES),
      });

      const result = validateFile(file);

      expect(result.valid).toBe(true);
    });

    it('should reject file 1 byte over 20MB', () => {
      const file = createMockFile({
        filename: 'too-big.pdf',
        mimetype: 'application/pdf',
        size: MAX_FILE_SIZE_BYTES + 1,
        buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES + 1),
      });

      const result = validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('FILE_TOO_LARGE');
    });

    it('should reject empty file', () => {
      const file = createMockFile({
        filename: 'empty.pdf',
        mimetype: 'application/pdf',
        size: 0,
        buffer: Buffer.alloc(0),
      });

      const result = validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('EMPTY_FILE');
    });

    it('should reject null file', () => {
      const result = validateFile(null as any);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('EMPTY_FILE');
    });

    it('should accept custom max file size', () => {
      const file = createMockFile({
        filename: 'small.pdf',
        mimetype: 'application/pdf',
        size: 2 * 1024 * 1024, // 2MB
        buffer: Buffer.alloc(2 * 1024 * 1024),
      });

      // Reject with 1MB limit
      const result1 = validateFile(file, 1 * 1024 * 1024);
      expect(result1.valid).toBe(false);
      expect(result1.error?.code).toBe('FILE_TOO_LARGE');

      // Accept with 5MB limit
      const result2 = validateFile(file, 5 * 1024 * 1024);
      expect(result2.valid).toBe(true);
    });
  });

  describe('validateMimeType', () => {
    it('should validate PDF MIME type', () => {
      const result = validateMimeType('application/pdf', 'test.pdf');
      expect(result.valid).toBe(true);
    });

    it('should validate DOCX MIME type', () => {
      const result = validateMimeType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'test.docx'
      );
      expect(result.valid).toBe(true);
    });

    it('should validate CSV MIME type', () => {
      const result = validateMimeType('text/csv', 'test.csv');
      expect(result.valid).toBe(true);
    });

    it('should handle MIME type with charset parameter', () => {
      const result = validateMimeType('text/csv; charset=utf-8', 'test.csv');
      expect(result.valid).toBe(true);
    });

    it('should handle uppercase MIME type', () => {
      const result = validateMimeType('APPLICATION/PDF', 'test.pdf');
      expect(result.valid).toBe(true);
    });

    it('should reject MIME type/extension mismatch', () => {
      const result = validateMimeType('application/pdf', 'test.docx');
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_MIME_TYPE');
      expect(result.error?.message).toContain('does not match');
    });
  });

  describe('isAllowedFileType', () => {
    it('should return true for PDF', () => {
      expect(isAllowedFileType('application/pdf')).toBe(true);
    });

    it('should return true for DOCX', () => {
      expect(isAllowedFileType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )).toBe(true);
    });

    it('should return true for CSV', () => {
      expect(isAllowedFileType('text/csv')).toBe(true);
    });

    it('should return true for Markdown', () => {
      expect(isAllowedFileType('text/markdown')).toBe(true);
    });

    it('should return false for image', () => {
      expect(isAllowedFileType('image/png')).toBe(false);
    });

    it('should return false for executable', () => {
      expect(isAllowedFileType('application/x-msdownload')).toBe(false);
    });
  });

  describe('getAllowedExtensions', () => {
    it('should return all allowed extensions', () => {
      const extensions = getAllowedExtensions();
      
      expect(extensions).toContain('.pdf');
      expect(extensions).toContain('.docx');
      expect(extensions).toContain('.csv');
      expect(extensions).toContain('.md');
      expect(extensions).toContain('.markdown');
    });
  });
});

// ============================================================================
// Document Service Tests
// ============================================================================

describe('DocumentService', () => {
  let documentService: DocumentService;

  beforeEach(() => {
    documentService = createTestDocumentService();
  });

  describe('uploadDocument', () => {
    it('should successfully upload a valid PDF', async () => {
      const file = {
        fieldname: 'file',
        originalname: 'test-document.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('PDF content'),
        size: 11,
      } as Express.Multer.File;

      const result = await documentService.uploadDocument(file, 'user-123');

      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
      expect(result.data?.document_id).toBeDefined();
      expect(result.data?.status).toBe('processing');
    });

    it('should successfully upload a valid DOCX', async () => {
      const file = {
        fieldname: 'file',
        originalname: 'report.docx',
        encoding: '7bit',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('DOCX content'),
        size: 12,
      } as Express.Multer.File;

      const result = await documentService.uploadDocument(file, 'user-456');

      expect(result.status).toBe('success');
      expect(result.data?.status).toBe('processing');
    });

    it('should successfully upload a valid CSV', async () => {
      const file = {
        fieldname: 'file',
        originalname: 'data.csv',
        encoding: '7bit',
        mimetype: 'text/csv',
        buffer: Buffer.from('col1,col2\nval1,val2'),
        size: 20,
      } as Express.Multer.File;

      const result = await documentService.uploadDocument(file, 'user-789');

      expect(result.status).toBe('success');
      expect(result.data?.status).toBe('processing');
    });

    it('should successfully upload a valid Markdown file', async () => {
      const file = {
        fieldname: 'file',
        originalname: 'readme.md',
        encoding: '7bit',
        mimetype: 'text/markdown',
        buffer: Buffer.from('# Hello World'),
        size: 13,
      } as Express.Multer.File;

      const result = await documentService.uploadDocument(file, 'user-101');

      expect(result.status).toBe('success');
      expect(result.data?.status).toBe('processing');
    });

    it('should reject invalid file type', async () => {
      const file = {
        fieldname: 'file',
        originalname: 'image.png',
        encoding: '7bit',
        mimetype: 'image/png',
        buffer: Buffer.from('PNG content'),
        size: 11,
      } as Express.Multer.File;

      const result = await documentService.uploadDocument(file, 'user-123');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('INVALID_MIME_TYPE');
    });

    it('should reject oversized file', async () => {
      const largeBuffer = Buffer.alloc(25 * 1024 * 1024); // 25MB
      const file = {
        fieldname: 'file',
        originalname: 'large.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: largeBuffer,
        size: largeBuffer.length,
      } as Express.Multer.File;

      const result = await documentService.uploadDocument(file, 'user-123');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('FILE_TOO_LARGE');
    });

    it('should reject empty file', async () => {
      const file = {
        fieldname: 'file',
        originalname: 'empty.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.alloc(0),
        size: 0,
      } as Express.Multer.File;

      const result = await documentService.uploadDocument(file, 'user-123');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('EMPTY_FILE');
    });

    it('should generate unique document IDs', async () => {
      const file1 = {
        fieldname: 'file',
        originalname: 'doc1.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('content 1'),
        size: 9,
      } as Express.Multer.File;

      const file2 = {
        fieldname: 'file',
        originalname: 'doc2.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('content 2'),
        size: 9,
      } as Express.Multer.File;

      const result1 = await documentService.uploadDocument(file1, 'user-123');
      const result2 = await documentService.uploadDocument(file2, 'user-123');

      expect(result1.data?.document_id).not.toBe(result2.data?.document_id);
    });
  });

  describe('getDocument', () => {
    it('should return uploaded document by ID', async () => {
      // First upload a document
      const file = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
        size: 12,
      } as Express.Multer.File;

      const uploadResult = await documentService.uploadDocument(file, 'user-123');
      expect(uploadResult.status).toBe('success');
      
      const documentId = uploadResult.data!.document_id;

      // Then retrieve it
      const getResult = await documentService.getDocument(documentId);

      expect(getResult.status).toBe('success');
      expect(getResult.data?.id).toBe(documentId);
      expect(getResult.data?.original_filename).toBe('test.pdf');
      expect(getResult.data?.status).toBe('processing');
    });

    it('should return error for non-existent document', async () => {
      const result = await documentService.getDocument('non-existent-id');

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('DOCUMENT_NOT_FOUND');
    });
  });
});

// ============================================================================
// MIME Type Constants Tests
// ============================================================================

describe('MIME Type Constants', () => {
  it('should include PDF MIME type', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
  });

  it('should include DOCX MIME type', () => {
    expect(ALLOWED_MIME_TYPES).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('should include CSV MIME type', () => {
    expect(ALLOWED_MIME_TYPES).toContain('text/csv');
  });

  it('should include Markdown MIME types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('text/markdown');
    expect(ALLOWED_MIME_TYPES).toContain('text/x-markdown');
  });

  it('should have exactly 6 allowed MIME types', () => {
    // PDF, DOCX, CSV, text/markdown, text/x-markdown, text/plain
    expect(ALLOWED_MIME_TYPES.length).toBe(6);
  });
});

describe('File Size Constants', () => {
  it('should have max file size of 20MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024);
  });
});
