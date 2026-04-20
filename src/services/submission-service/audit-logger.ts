/**
 * Audit Logger Module
 * 
 * Provides immutable, append-only audit logging per CONSTITUTION.md Principle IV.
 * All actions are logged BEFORE they complete (write-ahead pattern).
 * 
 * Critical Requirements:
 * - Append-only: no updates or deletes permitted
 * - Every record includes: user_id, action_type, entity_id, timestamp, before_state, after_state
 * - Audit records written BEFORE action completes
 */

import { AuditLogEntry, AuditActionType } from './types';

// ============================================================================
// Audit Logger Interface
// ============================================================================

export interface IAuditLogger {
  /**
   * Log an audit entry. This MUST be called BEFORE the action completes.
   * @throws Error if logging fails - action must not proceed
   */
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry>;
  
  /**
   * Retrieve audit entries for an entity (for debugging/compliance review)
   */
  getEntriesForEntity(entityType: string, entityId: string): Promise<AuditLogEntry[]>;
}

// ============================================================================
// Database Audit Logger Implementation
// ============================================================================

export class DatabaseAuditLogger implements IAuditLogger {
  private readonly tableName = 'audit_logs';
  
  constructor(
    private readonly dbClient: DatabaseClient
  ) {}

  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    // Write-ahead: log MUST succeed before returning
    await this.dbClient.insert(this.tableName, fullEntry);
    
    return fullEntry;
  }

  async getEntriesForEntity(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.dbClient.query(
      `SELECT * FROM ${this.tableName} WHERE entity_type = ? AND entity_id = ? ORDER BY timestamp ASC`,
      [entityType, entityId]
    );
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ============================================================================
// File-based Audit Logger (for testing/local dev)
// ============================================================================

export class FileAuditLogger implements IAuditLogger {
  private readonly entries: AuditLogEntry[] = [];
  
  constructor(
    private readonly auditLogPath: string
  ) {}

  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    // Append-only write
    this.entries.push(fullEntry);
    await this.appendToFile(fullEntry);
    
    return fullEntry;
  }

  async getEntriesForEntity(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.entries.filter(
      e => e.entity_type === entityType && e.entity_id === entityId
    );
  }

  private async appendToFile(entry: AuditLogEntry): Promise<void> {
    const fs = await import('fs/promises');
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.auditLogPath, line, 'utf-8');
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ============================================================================
// In-Memory Audit Logger (for unit testing)
// ============================================================================

export class InMemoryAuditLogger implements IAuditLogger {
  private readonly entries: AuditLogEntry[] = [];

  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: `audit_${this.entries.length + 1}`,
      timestamp: new Date().toISOString(),
    };

    this.entries.push(fullEntry);
    return fullEntry;
  }

  async getEntriesForEntity(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.entries.filter(
      e => e.entity_type === entityType && e.entity_id === entityId
    );
  }

  // Test helper: get all entries
  getAllEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  // Test helper: clear entries (only for test reset, not production use)
  clear(): void {
    this.entries.length = 0;
  }
}

// ============================================================================
// Audit Helper Functions
// ============================================================================

/**
 * Create a submission initiation audit entry
 */
export function createSubmissionInitiatedEntry(
  userId: string,
  submissionId: string,
  companyId: string,
  filingId: string,
  userApproved: boolean
): Omit<AuditLogEntry, 'id' | 'timestamp'> {
  return {
    user_id: userId,
    action_type: 'submission_initiated',
    entity_type: 'submission',
    entity_id: submissionId,
    before_state: undefined,
    after_state: {
      status: 'in_progress',
      user_approved: userApproved,
    },
    metadata: {
      company_id: companyId,
      filing_id: filingId,
    },
  };
}

/**
 * Create a CAPTCHA detected audit entry
 */
export function createCaptchaDetectedEntry(
  userId: string,
  submissionId: string
): Omit<AuditLogEntry, 'id' | 'timestamp'> {
  return {
    user_id: userId,
    action_type: 'captcha_detected',
    entity_type: 'submission',
    entity_id: submissionId,
    before_state: { status: 'in_progress' },
    after_state: { status: 'awaiting_captcha' },
    metadata: {
      message: 'Automation paused - CAPTCHA detected, user notification sent',
    },
  };
}

/**
 * Create a payment detected audit entry
 */
export function createPaymentDetectedEntry(
  userId: string,
  submissionId: string
): Omit<AuditLogEntry, 'id' | 'timestamp'> {
  return {
    user_id: userId,
    action_type: 'payment_detected',
    entity_type: 'submission',
    entity_id: submissionId,
    before_state: { status: 'in_progress' },
    after_state: { status: 'awaiting_payment' },
    metadata: {
      message: 'Automation paused - Payment page detected, user notification sent',
    },
  };
}

/**
 * Create a submission completed audit entry
 */
export function createSubmissionCompletedEntry(
  userId: string,
  submissionId: string,
  confirmationNumber: string
): Omit<AuditLogEntry, 'id' | 'timestamp'> {
  return {
    user_id: userId,
    action_type: 'submission_completed',
    entity_type: 'submission',
    entity_id: submissionId,
    before_state: { status: 'in_progress' },
    after_state: {
      status: 'confirmed',
      confirmation_number: confirmationNumber,
    },
    metadata: {
      message: 'Annual report submission confirmed by Sunbiz',
    },
  };
}

/**
 * Create a submission failed audit entry
 */
export function createSubmissionFailedEntry(
  userId: string,
  submissionId: string,
  errorCode: string,
  errorMessage: string,
  retryCount: number
): Omit<AuditLogEntry, 'id' | 'timestamp'> {
  return {
    user_id: userId,
    action_type: 'submission_failed',
    entity_type: 'submission',
    entity_id: submissionId,
    before_state: { status: 'in_progress' },
    after_state: {
      status: 'failed',
      error_code: errorCode,
      error_message: errorMessage,
    },
    metadata: {
      retry_count: retryCount,
      message: `Submission failed: ${errorMessage}`,
    },
  };
}

/**
 * Create a manual escalation audit entry
 */
export function createManualEscalationEntry(
  userId: string,
  submissionId: string,
  reason: string
): Omit<AuditLogEntry, 'id' | 'timestamp'> {
  return {
    user_id: userId,
    action_type: 'manual_escalation',
    entity_type: 'submission',
    entity_id: submissionId,
    before_state: { status: 'failed' },
    after_state: { status: 'manual_escalation' },
    metadata: {
      reason,
      message: 'Submission escalated to manual mode after retry exhaustion',
    },
  };
}

// ============================================================================
// Database Client Interface (to be implemented by infra layer)
// ============================================================================

export interface DatabaseClient {
  insert(table: string, data: Record<string, unknown>): Promise<void>;
  query<T>(sql: string, params: unknown[]): Promise<T[]>;
}
