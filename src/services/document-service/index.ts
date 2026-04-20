/**
 * Document Service API Handler
 * 
 * Express-compatible HTTP handlers for document upload endpoints.
 * See: docs/reference/api-contracts.md
 * 
 * Endpoints:
 * - POST /documents - Upload a document for processing
 * - GET /documents/:id - Get document status
 */

import { Request, Response, Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

import {
  ApiResponse,
  DocumentUploadResponse,
  DocumentRecord,
  MAX_FILE_SIZE_BYTES,
} from './types';
import { validateFile } from './validators/file-validator';
import { BlobStorageClient, createMockBlobStorageClient } from './storage/blob-storage';
import { DocumentRepository, createMockDocumentRepository } from './database/document-repository';
import { AuditLogger, createMockAuditLogger } from './audit-logger';
import { DocumentServiceConfig, loadConfig, createTestConfig } from './config';

// ============================================================================
// API Response Helpers
// ============================================================================

/**
 * Standard API response envelope
 * Per CLAUDE.md: All REST responses use { status, data, error }
 */
function sendResponse<T>(
  res: Response,
  statusCode: number,
  body: ApiResponse<T>
): void {
  res.status(statusCode).json(body);
}

// ============================================================================
// Document Service Class
// ============================================================================

/**
 * DocumentService handles file uploads, storage, and metadata management
 */
export class DocumentService {
  private blobStorage: BlobStorageClient;
  private repository: DocumentRepository;
  private auditLogger: AuditLogger;
  private config: DocumentServiceConfig;

  constructor(
    config: DocumentServiceConfig,
    blobStorage?: BlobStorageClient,
    repository?: DocumentRepository,
    auditLogger?: AuditLogger
  ) {
    this.config = config;
    this.blobStorage = blobStorage || new BlobStorageClient(config.azure);
    this.repository = repository || new DocumentRepository(config.database);
    this.auditLogger = auditLogger || new AuditLogger(config.audit.logPath);
  }

  /**
   * Initialize all dependencies
   */
  async initialize(): Promise<void> {
    await this.blobStorage.initialize();
    await this.repository.initialize();
    await this.auditLogger.initialize();
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.repository.close();
  }

  /**
   * Handle document upload
   * 
   * @param file - Uploaded file from multer
   * @param userId - User ID from authenticated session
   * @returns Upload response with document_id and status
   */
  async uploadDocument(
    file: Express.Multer.File,
    userId: string
  ): Promise<ApiResponse<DocumentUploadResponse>> {
    // Validate the file
    const validation = validateFile({
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    }, this.config.upload.maxFileSizeBytes);

    if (!validation.valid) {
      return {
        status: 'error',
        error: {
          code: validation.error!.code,
          message: validation.error!.message,
        },
      };
    }

    // Generate document ID
    const documentId = uuidv4();

    // Upload to blob storage
    const blobResult = await this.blobStorage.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype
    );

    if (!blobResult.success) {
      return {
        status: 'error',
        error: {
          code: 'STORAGE_ERROR',
          message: blobResult.error || 'Failed to upload file to storage',
        },
      };
    }

    // Create document record
    const documentRecord: DocumentRecord = {
      id: documentId,
      company_id: null, // Will be linked after extraction
      original_filename: file.originalname,
      mime_type: file.mimetype,
      file_size_bytes: file.size,
      blob_url: blobResult.blobUrl!,
      blob_path: blobResult.blobPath!,
      status: 'processing',
      uploaded_by: userId,
      uploaded_at: new Date(),
    };

    try {
      await this.repository.createDocument(documentRecord);
    } catch (error) {
      // Cleanup blob if database insert fails
      await this.blobStorage.deleteFile(blobResult.blobPath!);
      return {
        status: 'error',
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to save document metadata',
        },
      };
    }

    // Log the upload for audit
    await this.auditLogger.logDocumentUpload(documentId, userId, {
      filename: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      blobPath: blobResult.blobPath!,
    });

    return {
      status: 'success',
      data: {
        document_id: documentId,
        status: 'processing',
      },
    };
  }

  /**
   * Get document status by ID
   * 
   * @param documentId - Document ID to retrieve
   * @returns Document metadata or error
   */
  async getDocument(documentId: string): Promise<ApiResponse<DocumentRecord>> {
    try {
      const document = await this.repository.getDocument(documentId);
      
      if (!document) {
        return {
          status: 'error',
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: `Document with ID '${documentId}' not found`,
          },
        };
      }

      return {
        status: 'success',
        data: document,
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve document',
        },
      };
    }
  }
}

// ============================================================================
// Express Router Factory
// ============================================================================

/**
 * Create an Express router for the document service
 * 
 * @param documentService - Initialized DocumentService instance
 * @returns Express Router
 */
export function createDocumentRouter(documentService: DocumentService): Router {
  const router = Router();

  // Configure multer for memory storage with size limit
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
    },
  });

  /**
   * POST /documents
   * 
   * Upload a document for processing.
   * 
   * Request: multipart/form-data with 'file' field
   * 
   * Response:
   * {
   *   status: "success" | "error",
   *   data?: { document_id: string, status: "processing" },
   *   error?: { code: string, message: string }
   * }
   */
  router.post('/documents', upload.single('file'), async (req: Request, res: Response) => {
    try {
      // Check if file was provided
      if (!req.file) {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'MISSING_FILE',
            message: 'No file provided in request. Use "file" field in multipart/form-data.',
          },
        });
      }

      // Get user ID from authenticated session
      const userId = (req as any).user?.id || 'anonymous';

      const result = await documentService.uploadDocument(req.file, userId);

      if (result.status === 'success') {
        return sendResponse(res, 200, result);
      } else {
        // Map error codes to HTTP status codes
        const statusCode = mapErrorToStatusCode(result.error?.code);
        return sendResponse(res, statusCode, result);
      }
    } catch (error) {
      // Handle multer file size error
      if ((error as any).code === 'LIMIT_FILE_SIZE') {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size exceeds maximum allowed size (${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)`,
          },
        });
      }

      console.error('POST /documents error:', error);
      return sendResponse(res, 500, {
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  });

  /**
   * GET /documents/:id
   * 
   * Get document status and metadata.
   * 
   * Response:
   * {
   *   status: "success" | "error",
   *   data?: DocumentRecord,
   *   error?: { code: string, message: string }
   * }
   */
  router.get('/documents/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!id) {
        return sendResponse(res, 400, {
          status: 'error',
          error: {
            code: 'INVALID_REQUEST',
            message: 'Document ID is required',
          },
        });
      }

      const result = await documentService.getDocument(id);

      if (result.status === 'success') {
        return sendResponse(res, 200, result);
      } else {
        const statusCode = result.error?.code === 'DOCUMENT_NOT_FOUND' ? 404 : 500;
        return sendResponse(res, statusCode, result);
      }
    } catch (error) {
      console.error('GET /documents/:id error:', error);
      return sendResponse(res, 500, {
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  });

  return router;
}

// ============================================================================
// Error Code Mapping
// ============================================================================

function mapErrorToStatusCode(errorCode: string | undefined): number {
  switch (errorCode) {
    case 'INVALID_MIME_TYPE':
    case 'FILE_TOO_LARGE':
    case 'EMPTY_FILE':
    case 'MISSING_FILE':
    case 'INVALID_REQUEST':
      return 400; // Bad Request
    case 'DOCUMENT_NOT_FOUND':
      return 404; // Not Found
    case 'STORAGE_ERROR':
    case 'DATABASE_ERROR':
      return 500; // Internal Server Error
    default:
      return 500;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a DocumentService with real dependencies
 */
export async function createDocumentService(): Promise<DocumentService> {
  const config = loadConfig();
  const service = new DocumentService(config);
  await service.initialize();
  return service;
}

/**
 * Create a DocumentService with mock dependencies for testing
 */
export function createTestDocumentService(): DocumentService {
  const config = createTestConfig();
  const mockBlobStorage = createMockBlobStorageClient();
  const mockRepository = createMockDocumentRepository();
  const mockAuditLogger = createMockAuditLogger();
  
  return new DocumentService(config, mockBlobStorage, mockRepository, mockAuditLogger);
}

// ============================================================================
// Module Exports
// ============================================================================

export { DocumentServiceConfig, loadConfig, createTestConfig } from './config';
export { validateFile, validateMimeType, isAllowedFileType } from './validators/file-validator';
export { BlobStorageClient, createMockBlobStorageClient } from './storage/blob-storage';
export { DocumentRepository, createMockDocumentRepository } from './database/document-repository';
export { AuditLogger, createMockAuditLogger } from './audit-logger';
export * from './types';
