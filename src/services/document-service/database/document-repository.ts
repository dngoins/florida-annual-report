/**
 * Document Repository
 * 
 * Database operations for document metadata storage.
 * Per data-model.md: Store metadata in filings/documents table
 */

import * as sql from 'mssql';
import { DocumentRecord, DocumentStatus, DocumentServiceConfig } from '../types';

/**
 * DocumentRepository handles all database operations for documents
 */
export class DocumentRepository {
  private pool: sql.ConnectionPool | null = null;
  private config: DocumentServiceConfig['database'];

  constructor(config: DocumentServiceConfig['database']) {
    this.config = config;
  }

  /**
   * Initialize database connection pool
   */
  async initialize(): Promise<void> {
    try {
      this.pool = await sql.connect({
        server: this.config.server,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        port: this.config.port,
        options: {
          encrypt: this.config.encrypt,
          trustServerCertificate: !this.config.encrypt,
        },
      });
    } catch (error) {
      console.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  /**
   * Insert a new document record
   * 
   * @param document - Document record to insert
   * @returns The inserted document ID
   */
  async createDocument(document: DocumentRecord): Promise<string> {
    if (!this.pool) {
      throw new Error('Database connection not initialized');
    }

    try {
      const request = this.pool.request();
      
      request.input('id', sql.UniqueIdentifier, document.id);
      request.input('company_id', sql.UniqueIdentifier, document.company_id);
      request.input('original_filename', sql.NVarChar(255), document.original_filename);
      request.input('mime_type', sql.NVarChar(100), document.mime_type);
      request.input('file_size_bytes', sql.BigInt, document.file_size_bytes);
      request.input('blob_url', sql.NVarChar(500), document.blob_url);
      request.input('blob_path', sql.NVarChar(500), document.blob_path);
      request.input('status', sql.NVarChar(50), document.status);
      request.input('uploaded_by', sql.NVarChar(100), document.uploaded_by);
      request.input('uploaded_at', sql.DateTime2, document.uploaded_at);

      await request.query(`
        INSERT INTO documents (
          id, company_id, original_filename, mime_type, file_size_bytes,
          blob_url, blob_path, status, uploaded_by, uploaded_at
        )
        VALUES (
          @id, @company_id, @original_filename, @mime_type, @file_size_bytes,
          @blob_url, @blob_path, @status, @uploaded_by, @uploaded_at
        )
      `);

      return document.id;
    } catch (error) {
      console.error('Failed to create document record:', error);
      throw error;
    }
  }

  /**
   * Get a document by ID
   * 
   * @param documentId - Document ID to retrieve
   * @returns Document record or null if not found
   */
  async getDocument(documentId: string): Promise<DocumentRecord | null> {
    if (!this.pool) {
      throw new Error('Database connection not initialized');
    }

    try {
      const request = this.pool.request();
      request.input('id', sql.UniqueIdentifier, documentId);

      const result = await request.query<DocumentRecord>(`
        SELECT id, company_id, original_filename, mime_type, file_size_bytes,
               blob_url, blob_path, status, uploaded_by, uploaded_at
        FROM documents
        WHERE id = @id
      `);

      return result.recordset[0] || null;
    } catch (error) {
      console.error('Failed to get document:', error);
      throw error;
    }
  }

  /**
   * Update document status
   * 
   * @param documentId - Document ID to update
   * @param status - New status
   * @param processedAt - Optional processed timestamp
   */
  async updateDocumentStatus(
    documentId: string,
    status: DocumentStatus,
    processedAt?: Date
  ): Promise<void> {
    if (!this.pool) {
      throw new Error('Database connection not initialized');
    }

    try {
      const request = this.pool.request();
      request.input('id', sql.UniqueIdentifier, documentId);
      request.input('status', sql.NVarChar(50), status);
      request.input('processed_at', sql.DateTime2, processedAt || null);

      await request.query(`
        UPDATE documents
        SET status = @status, processed_at = @processed_at
        WHERE id = @id
      `);
    } catch (error) {
      console.error('Failed to update document status:', error);
      throw error;
    }
  }

  /**
   * Link a document to a company
   * 
   * @param documentId - Document ID
   * @param companyId - Company ID to link
   */
  async linkToCompany(documentId: string, companyId: string): Promise<void> {
    if (!this.pool) {
      throw new Error('Database connection not initialized');
    }

    try {
      const request = this.pool.request();
      request.input('id', sql.UniqueIdentifier, documentId);
      request.input('company_id', sql.UniqueIdentifier, companyId);

      await request.query(`
        UPDATE documents
        SET company_id = @company_id
        WHERE id = @id
      `);
    } catch (error) {
      console.error('Failed to link document to company:', error);
      throw error;
    }
  }

  /**
   * Delete a document record
   * 
   * @param documentId - Document ID to delete
   * @returns True if deletion was successful
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    if (!this.pool) {
      throw new Error('Database connection not initialized');
    }

    try {
      const request = this.pool.request();
      request.input('id', sql.UniqueIdentifier, documentId);

      const result = await request.query(`
        DELETE FROM documents
        WHERE id = @id
      `);

      return (result.rowsAffected[0] ?? 0) > 0;
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }
}

/**
 * Create a mock document repository for testing
 */
export function createMockDocumentRepository(): DocumentRepository {
  const documents = new Map<string, DocumentRecord>();
  
  const mockRepo = {
    initialize: async () => {},
    close: async () => {},
    createDocument: async (document: DocumentRecord): Promise<string> => {
      documents.set(document.id, document);
      return document.id;
    },
    getDocument: async (documentId: string): Promise<DocumentRecord | null> => {
      return documents.get(documentId) || null;
    },
    updateDocumentStatus: async (
      documentId: string,
      status: DocumentStatus,
      processedAt?: Date
    ): Promise<void> => {
      const doc = documents.get(documentId);
      if (doc) {
        doc.status = status;
        if (processedAt) {
          (doc as any).processed_at = processedAt;
        }
      }
    },
    linkToCompany: async (documentId: string, companyId: string): Promise<void> => {
      const doc = documents.get(documentId);
      if (doc) {
        doc.company_id = companyId;
      }
    },
    deleteDocument: async (documentId: string): Promise<boolean> => {
      return documents.delete(documentId);
    },
  };
  
  return mockRepo as unknown as DocumentRepository;
}
