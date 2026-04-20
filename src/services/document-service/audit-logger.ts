/**
 * Audit Logger for Document Service
 * 
 * Append-only audit logging per CLAUDE.md requirements.
 * All document operations are logged for compliance.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DocumentAuditEntry } from './types';

/**
 * AuditLogger provides append-only logging for compliance
 */
export class AuditLogger {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  /**
   * Initialize the audit logger
   * Creates the log directory if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.promises.mkdir(this.logPath, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize audit log directory:', error);
      throw error;
    }
  }

  /**
   * Log a document upload event
   * 
   * @param documentId - ID of the uploaded document
   * @param userId - User who uploaded the document
   * @param details - Additional details about the upload
   */
  async logDocumentUpload(
    documentId: string,
    userId: string,
    details: {
      filename: string;
      mimeType: string;
      fileSizeBytes: number;
      blobPath: string;
    }
  ): Promise<void> {
    const entry: DocumentAuditEntry = {
      timestamp: new Date(),
      action: 'DOCUMENT_UPLOADED',
      document_id: documentId,
      user_id: userId,
      details,
    };

    await this.appendLog(entry);
  }

  /**
   * Log a document deletion event
   * 
   * @param documentId - ID of the deleted document
   * @param userId - User who deleted the document
   * @param details - Additional details
   */
  async logDocumentDeletion(
    documentId: string,
    userId: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    const entry: DocumentAuditEntry = {
      timestamp: new Date(),
      action: 'DOCUMENT_DELETED',
      document_id: documentId,
      user_id: userId,
      details,
    };

    await this.appendLog(entry);
  }

  /**
   * Log a document processing event
   * 
   * @param documentId - ID of the processed document
   * @param userId - User context
   * @param details - Processing details
   */
  async logDocumentProcessed(
    documentId: string,
    userId: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    const entry: DocumentAuditEntry = {
      timestamp: new Date(),
      action: 'DOCUMENT_PROCESSED',
      document_id: documentId,
      user_id: userId,
      details,
    };

    await this.appendLog(entry);
  }

  /**
   * Append a log entry to the daily log file
   * Uses append-only writes per compliance requirements
   * 
   * @param entry - Audit log entry to append
   */
  private async appendLog(entry: DocumentAuditEntry): Promise<void> {
    try {
      // Use date-based log files for organization
      const dateStr = entry.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      const logFile = path.join(this.logPath, `document-audit-${dateStr}.jsonl`);
      
      // Append JSON Lines format (one JSON object per line)
      const logLine = JSON.stringify(entry) + '\n';
      
      await fs.promises.appendFile(logFile, logLine, { encoding: 'utf8' });
    } catch (error) {
      // Log to console but don't throw - audit logging shouldn't break uploads
      console.error('Failed to write audit log:', error);
    }
  }
}

/**
 * Create a mock audit logger for testing
 */
export function createMockAuditLogger(): AuditLogger {
  const logs: DocumentAuditEntry[] = [];
  
  const mockLogger = {
    initialize: async () => {},
    logDocumentUpload: async (
      documentId: string,
      userId: string,
      details: any
    ) => {
      logs.push({
        timestamp: new Date(),
        action: 'DOCUMENT_UPLOADED',
        document_id: documentId,
        user_id: userId,
        details,
      });
    },
    logDocumentDeletion: async (
      documentId: string,
      userId: string,
      details: any = {}
    ) => {
      logs.push({
        timestamp: new Date(),
        action: 'DOCUMENT_DELETED',
        document_id: documentId,
        user_id: userId,
        details,
      });
    },
    logDocumentProcessed: async (
      documentId: string,
      userId: string,
      details: any = {}
    ) => {
      logs.push({
        timestamp: new Date(),
        action: 'DOCUMENT_PROCESSED',
        document_id: documentId,
        user_id: userId,
        details,
      });
    },
    getLogs: () => logs,
  };
  
  return mockLogger as unknown as AuditLogger;
}
