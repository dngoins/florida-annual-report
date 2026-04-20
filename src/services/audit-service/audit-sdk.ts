/**
 * Audit SDK
 * 
 * Internal helper for other services to log audit entries.
 * Provides convenience methods for each action type.
 * 
 * Usage:
 *   const auditSdk = new AuditSdk(auditService);
 *   await auditSdk.logUpload(entityId, actor, { filename: 'report.pdf' });
 * 
 * Write-Ahead Pattern:
 *   await auditSdk.withAuditLog('SUBMIT', entityId, actor, async () => {
 *     // Your action code here - audit is logged BEFORE this runs
 *   });
 * 
 * @module services/audit-service/audit-sdk
 */

import { AuditService } from './index';
import { AuditActionType, AuditLogEntry, CreateAuditEntryInput } from './types';

export class AuditSdk {
  constructor(private readonly auditService: AuditService) {}

  // ============================================================================
  // Generic Log Method
  // ============================================================================

  /**
   * Log an audit entry with the specified action type.
   */
  async log(
    action: AuditActionType,
    entityId: string,
    actor: string,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    const input: CreateAuditEntryInput = {
      entity_id: entityId,
      action,
      actor,
      payload,
      company_id: companyId,
    };
    return this.auditService.createEntry(input);
  }

  // ============================================================================
  // Convenience Methods for Each Action Type
  // ============================================================================

  /**
   * Log a document upload action.
   */
  async logUpload(
    entityId: string,
    actor: string,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    return this.log('UPLOAD', entityId, actor, payload, companyId);
  }

  /**
   * Log a data extraction action.
   */
  async logExtract(
    entityId: string,
    actor: string,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    return this.log('EXTRACT', entityId, actor, payload, companyId);
  }

  /**
   * Log a validation action.
   */
  async logValidate(
    entityId: string,
    actor: string,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    return this.log('VALIDATE', entityId, actor, payload, companyId);
  }

  /**
   * Log a user review action.
   */
  async logReview(
    entityId: string,
    actor: string,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    return this.log('REVIEW', entityId, actor, payload, companyId);
  }

  /**
   * Log a data reconciliation action.
   */
  async logReconcile(
    entityId: string,
    actor: string,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    return this.log('RECONCILE', entityId, actor, payload, companyId);
  }

  /**
   * Log a submission action.
   */
  async logSubmit(
    entityId: string,
    actor: string,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    return this.log('SUBMIT', entityId, actor, payload, companyId);
  }

  /**
   * Log a confirmation action.
   */
  async logConfirm(
    entityId: string,
    actor: string,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    return this.log('CONFIRM', entityId, actor, payload, companyId);
  }

  /**
   * Log an error action.
   */
  async logError(
    entityId: string,
    actor: string,
    error: Error | string,
    additionalPayload?: Record<string, unknown>,
    companyId?: string
  ): Promise<AuditLogEntry> {
    const errorPayload = {
      error_message: error instanceof Error ? error.message : error,
      error_stack: error instanceof Error ? error.stack : undefined,
      ...additionalPayload,
    };
    return this.log('ERROR', entityId, actor, errorPayload, companyId);
  }

  // ============================================================================
  // Write-Ahead Logging Pattern
  // ============================================================================

  /**
   * Execute an action with write-ahead audit logging.
   * 
   * The audit entry is logged BEFORE the action executes.
   * If the action fails, an ERROR audit entry is also logged.
   * 
   * @param action - The audit action type
   * @param entityId - The entity being acted upon
   * @param actor - Who is performing the action
   * @param fn - The async function to execute
   * @param payload - Additional context for the audit entry
   * @param companyId - Optional company ID (defaults to entityId)
   * @returns The result of the action function
   */
  async withAuditLog<T>(
    action: AuditActionType,
    entityId: string,
    actor: string,
    fn: () => Promise<T>,
    payload?: Record<string, unknown>,
    companyId?: string
  ): Promise<T> {
    // Write-ahead: Log BEFORE executing the action
    await this.log(action, entityId, actor, {
      ...payload,
      status: 'started',
    }, companyId);

    try {
      // Execute the action
      const result = await fn();

      // Log success (optional - the initial log already captured the intent)
      // Uncomment if you want explicit completion logging:
      // await this.log(action, entityId, actor, {
      //   ...payload,
      //   status: 'completed',
      // }, companyId);

      return result;
    } catch (error) {
      // Log the error
      await this.logError(
        entityId,
        actor,
        error instanceof Error ? error : new Error(String(error)),
        {
          original_action: action,
          ...payload,
        },
        companyId
      );
      throw error;
    }
  }

  // ============================================================================
  // Query Methods (delegated to service)
  // ============================================================================

  /**
   * Get audit history for a company.
   */
  async getHistory(companyId: string, options?: {
    action?: AuditActionType;
    actor?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }) {
    return this.auditService.getHistory({
      company_id: companyId,
      ...options,
    });
  }
}

// ============================================================================
// Factory function for easy instantiation
// ============================================================================

/**
 * Create an AuditSdk instance connected to the given service.
 */
export function createAuditSdk(auditService: AuditService): AuditSdk {
  return new AuditSdk(auditService);
}
