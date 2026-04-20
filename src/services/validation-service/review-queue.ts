/**
 * Human Review Queue Module
 * 
 * Manages fields that require human review due to low confidence scores.
 * Per docs/reference/product-requirements.md:
 * - Fields below threshold are flagged for review
 * - Submission blocked until manually confirmed/corrected
 * - All corrections logged in audit trail
 */

import { randomUUID } from 'crypto';
import { ComponentScores } from './confidence-scoring';

// ============================================================================
// Types
// ============================================================================

export type ReviewStatus = 'pending' | 'accepted' | 'rejected';

export interface ReviewQueueItem {
  id: string;
  documentId: string;
  filingId: string;
  fieldName: string;
  extractedValue: string | any;
  confidence: number;
  componentScores: ComponentScores;
  status: ReviewStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  correctedValue?: string | any;
  finalValue?: string | any;
  rejectionReason?: string;
}

export interface AddToQueueInput {
  documentId: string;
  filingId: string;
  fieldName: string;
  extractedValue: string | any;
  confidence: number;
  componentScores: ComponentScores;
}

export interface ReviewDecision {
  action: 'accept' | 'reject';
  correctedValue?: string | any;
  reviewerId: string;
  reason?: string;
}

export interface AuditEntry {
  id: string;
  itemId: string;
  action: 'created' | 'reviewed';
  timestamp: string;
  reviewerId?: string;
  previousStatus?: ReviewStatus;
  newStatus?: ReviewStatus;
  correctedValue?: string | any;
  reason?: string;
}

export interface GetReviewsOptions {
  filingId?: string;
  status?: ReviewStatus;
  documentId?: string;
}

// ============================================================================
// Review Queue Class
// ============================================================================

export class ReviewQueue {
  private items: Map<string, ReviewQueueItem> = new Map();
  private auditLog: AuditEntry[] = [];

  /**
   * Add a field to the review queue
   */
  addToQueue(input: AddToQueueInput): ReviewQueueItem {
    const id = randomUUID();
    const now = new Date().toISOString();

    const item: ReviewQueueItem = {
      id,
      documentId: input.documentId,
      filingId: input.filingId,
      fieldName: input.fieldName,
      extractedValue: input.extractedValue,
      confidence: input.confidence,
      componentScores: { ...input.componentScores },
      status: 'pending',
      createdAt: now,
    };

    this.items.set(id, item);

    // Log creation in audit trail
    this.auditLog.push({
      id: randomUUID(),
      itemId: id,
      action: 'created',
      timestamp: now,
      newStatus: 'pending',
    });

    return { ...item };
  }

  /**
   * Get all pending reviews, optionally filtered
   */
  getPendingReviews(options?: GetReviewsOptions): ReviewQueueItem[] {
    let results = Array.from(this.items.values())
      .filter(item => item.status === 'pending');

    if (options?.filingId) {
      results = results.filter(item => item.filingId === options.filingId);
    }

    if (options?.documentId) {
      results = results.filter(item => item.documentId === options.documentId);
    }

    return results.map(item => ({ ...item }));
  }

  /**
   * Get all reviews (any status), optionally filtered
   */
  getAllReviews(options?: GetReviewsOptions): ReviewQueueItem[] {
    let results = Array.from(this.items.values());

    if (options?.filingId) {
      results = results.filter(item => item.filingId === options.filingId);
    }

    if (options?.documentId) {
      results = results.filter(item => item.documentId === options.documentId);
    }

    if (options?.status) {
      results = results.filter(item => item.status === options.status);
    }

    return results.map(item => ({ ...item }));
  }

  /**
   * Get a specific review item by ID
   */
  getItem(id: string): ReviewQueueItem | null {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  /**
   * Review a field (accept or reject)
   */
  reviewField(itemId: string, decision: ReviewDecision): ReviewQueueItem {
    const item = this.items.get(itemId);

    if (!item) {
      throw new Error('Review item not found');
    }

    if (item.status !== 'pending') {
      throw new Error('Item has already been reviewed');
    }

    if (!decision.reviewerId || decision.reviewerId.trim() === '') {
      throw new Error('Reviewer ID is required');
    }

    const now = new Date().toISOString();
    const previousStatus = item.status;

    if (decision.action === 'accept') {
      item.status = 'accepted';
      item.reviewedAt = now;
      item.reviewedBy = decision.reviewerId;
      
      if (decision.correctedValue !== undefined) {
        item.correctedValue = decision.correctedValue;
        item.finalValue = decision.correctedValue;
      } else {
        item.finalValue = item.extractedValue;
      }
    } else {
      item.status = 'rejected';
      item.reviewedAt = now;
      item.reviewedBy = decision.reviewerId;
      item.rejectionReason = decision.reason;
    }

    // Log review in audit trail
    this.auditLog.push({
      id: randomUUID(),
      itemId,
      action: 'reviewed',
      timestamp: now,
      reviewerId: decision.reviewerId,
      previousStatus,
      newStatus: item.status,
      correctedValue: decision.correctedValue,
      reason: decision.reason,
    });

    return { ...item };
  }

  /**
   * Check if a filing has any unresolved fields
   * Unresolved = pending OR rejected
   */
  hasUnresolvedFields(filingId: string): boolean {
    const filingItems = Array.from(this.items.values())
      .filter(item => item.filingId === filingId);

    // If no items in queue for this filing, there are no unresolved fields
    if (filingItems.length === 0) {
      return false;
    }

    // Check for any pending or rejected items
    return filingItems.some(item => 
      item.status === 'pending' || item.status === 'rejected'
    );
  }

  /**
   * Get count of unresolved fields for a filing
   */
  getUnresolvedCount(filingId: string): number {
    return Array.from(this.items.values())
      .filter(item => 
        item.filingId === filingId && 
        (item.status === 'pending' || item.status === 'rejected')
      )
      .length;
  }

  /**
   * Get the audit trail for a specific item
   */
  getAuditTrail(itemId: string): AuditEntry[] {
    return this.auditLog
      .filter(entry => entry.itemId === itemId)
      .map(entry => ({ ...entry }));
  }

  /**
   * Get all audit entries for a filing
   */
  getFilingAuditTrail(filingId: string): AuditEntry[] {
    const filingItemIds = new Set(
      Array.from(this.items.values())
        .filter(item => item.filingId === filingId)
        .map(item => item.id)
    );

    return this.auditLog
      .filter(entry => filingItemIds.has(entry.itemId))
      .map(entry => ({ ...entry }));
  }

  /**
   * Get resolved field values for a filing
   * Returns a map of field names to their final values (for accepted fields)
   */
  getResolvedValues(filingId: string): Record<string, any> {
    const resolved: Record<string, any> = {};

    Array.from(this.items.values())
      .filter(item => item.filingId === filingId && item.status === 'accepted')
      .forEach(item => {
        resolved[item.fieldName] = item.finalValue;
      });

    return resolved;
  }

  /**
   * Clear all items (for testing)
   */
  clear(): void {
    this.items.clear();
    this.auditLog = [];
  }
}

// ============================================================================
// Default Export - Singleton Instance
// ============================================================================

// Export a singleton instance for use across the service
export const reviewQueue = new ReviewQueue();
