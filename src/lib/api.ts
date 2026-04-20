/**
 * API Client for Review Operations
 * Handles communication with backend for review workflow
 */

import { ReviewData, FieldUpdate } from '@/types/review';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Fetch review data by ID
 */
export async function getReviewData(reviewId: string): Promise<ReviewData> {
  const response = await fetch(`${API_BASE}/company/${reviewId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch review data: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Update a single field in the review queue
 */
export async function updateField(update: FieldUpdate): Promise<void> {
  const response = await fetch(`${API_BASE}/review-queue/${update.field_id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accepted_value: update.accepted_value,
      resolved: update.resolved,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update field: ${response.statusText}`);
  }
}

/**
 * Submit the review for final processing
 */
export async function submitReview(reviewId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/review/${reviewId}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to submit review: ${response.statusText}`);
  }
}

/**
 * Auto-save field on blur
 */
export async function autoSaveField(
  fieldId: string, 
  value: string
): Promise<void> {
  await updateField({
    field_id: fieldId,
    accepted_value: value,
    resolved: true,
  });
}
