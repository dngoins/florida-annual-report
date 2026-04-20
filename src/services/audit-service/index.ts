/**
 * Audit Service
 * 
 * Provides append-only audit logging per CONSTITUTION.md Principle IV.
 * 
 * CRITICAL CONSTRAINTS:
 * - Append-only: NO UPDATE or DELETE operations permitted
 * - Write-ahead logging: Audit record MUST be written BEFORE action completes
 * - All records are immutable once created
 * 
 * @module services/audit-service
 */

import {
  AuditLogEntry,
  CreateAuditEntryInput,
  AuditQueryOptions,
  AuditActionType,
  isValidActionType,
} from './types';

// ============================================================================
// Audit Repository Interface (Append-Only by Design)
// ============================================================================

/**
 * Repository interface for audit log persistence.
 * 
 * INTENTIONALLY OMITS update() and delete() methods.
 * This is by design - audit logs are immutable per CONSTITUTION.md.
 */
export interface IAuditRepository {
  /**
   * Insert a new audit log entry.
   * This is the ONLY write operation permitted.
   */
  insert(entry: AuditLogEntry): Promise<AuditLogEntry>;
  
  /**
   * Query audit entries by company ID with optional filters.
   * Read-only operation.
   */
  findByCompanyId(options: AuditQueryOptions): Promise<{
    entries: AuditLogEntry[];
    total_count: number;
  }>;
  
  /**
   * Get a single audit entry by ID.
   * Read-only operation.
   */
  findById(id: string): Promise<AuditLogEntry | null>;
}

// ============================================================================
// Audit Service Implementation
// ============================================================================

export class AuditService {
  constructor(private readonly repository: IAuditRepository) {}

  /**
   * Create a new audit log entry.
   * This is the ONLY way to write to the audit log.
   * 
   * @param input - The audit entry data
   * @returns The created audit entry with generated ID and timestamp
   * @throws Error if action type is invalid
   */
  async createEntry(input: CreateAuditEntryInput): Promise<AuditLogEntry> {
    // Validate action type
    if (!isValidActionType(input.action)) {
      throw new Error(
        `Invalid action type: ${input.action}. ` +
        `Must be one of: UPLOAD, EXTRACT, VALIDATE, REVIEW, RECONCILE, SUBMIT, CONFIRM, ERROR`
      );
    }

    // Generate audit entry with ID and timestamp
    const entry: AuditLogEntry = {
      id: this.generateId(),
      entity_id: input.entity_id,
      action: input.action,
      actor: input.actor,
      payload: input.payload || {},
      timestamp: new Date().toISOString(),
      company_id: input.company_id || input.entity_id,
    };

    // Write-ahead: Insert MUST succeed before returning
    return this.repository.insert(entry);
  }

  /**
   * Get audit history for a company.
   * 
   * @param options - Query options (company_id required)
   * @returns Paginated audit entries
   */
  async getHistory(options: AuditQueryOptions): Promise<{
    entries: AuditLogEntry[];
    total_count: number;
    page: number;
    page_size: number;
  }> {
    const page = options.page || 1;
    const pageSize = options.page_size || 50;

    const result = await this.repository.findByCompanyId({
      ...options,
      page,
      page_size: pageSize,
    });

    return {
      entries: result.entries,
      total_count: result.total_count,
      page,
      page_size: pageSize,
    };
  }

  /**
   * Get a single audit entry by ID.
   * 
   * @param id - The audit entry ID
   * @returns The audit entry or null if not found
   */
  async getEntry(id: string): Promise<AuditLogEntry | null> {
    return this.repository.findById(id);
  }

  /**
   * Generate a unique audit entry ID.
   */
  private generateId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `audit_${timestamp}_${random}`;
  }
}

// ============================================================================
// In-Memory Repository (for testing)
// ============================================================================

/**
 * In-memory implementation of IAuditRepository for testing.
 * Note: Does NOT expose update or delete methods.
 */
export class InMemoryAuditRepository implements IAuditRepository {
  private entries: AuditLogEntry[] = [];

  async insert(entry: AuditLogEntry): Promise<AuditLogEntry> {
    this.entries.push({ ...entry });
    return entry;
  }

  async findByCompanyId(options: AuditQueryOptions): Promise<{
    entries: AuditLogEntry[];
    total_count: number;
  }> {
    let filtered = this.entries.filter(e => e.company_id === options.company_id);

    // Apply optional filters
    if (options.action) {
      filtered = filtered.filter(e => e.action === options.action);
    }
    if (options.actor) {
      filtered = filtered.filter(e => e.actor === options.actor);
    }
    if (options.start_date) {
      filtered = filtered.filter(e => e.timestamp >= options.start_date!);
    }
    if (options.end_date) {
      filtered = filtered.filter(e => e.timestamp <= options.end_date!);
    }

    // Sort by timestamp (oldest first for audit trail)
    filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Paginate
    const page = options.page || 1;
    const pageSize = options.page_size || 50;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return {
      entries: paged,
      total_count: filtered.length,
    };
  }

  async findById(id: string): Promise<AuditLogEntry | null> {
    return this.entries.find(e => e.id === id) || null;
  }

  // Test helper: get all entries (for verification)
  getAllEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  // Test helper: reset (only for test cleanup)
  reset(): void {
    this.entries = [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export * from './types';
