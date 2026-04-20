/**
 * Review Form Types
 * Defines types for extracted fields with confidence scoring
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ExtractedField {
  field_id: string;
  field_name: string;
  extracted_value: string;
  confidence: number;
  sunbiz_value?: string;
  resolved: boolean;
  accepted_value?: string;
}

export interface ReviewData {
  id: string;
  company_id: string;
  entity_name: ExtractedField;
  registered_agent: ExtractedField;
  principal_address: ExtractedField;
  mailing_address: ExtractedField;
  officers: OfficerField[];
  status: 'pending_review' | 'approved' | 'submitted';
  created_at: string;
  updated_at: string;
}

export interface OfficerField {
  field_id: string;
  title: string;
  name: ExtractedField;
  address: ExtractedField;
}

export interface FieldUpdate {
  field_id: string;
  accepted_value: string;
  resolved: boolean;
}

/**
 * Get confidence level category from numeric score
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.90) return 'high';
  if (confidence >= 0.75) return 'medium';
  return 'low';
}

/**
 * Get CSS class for confidence level
 */
export function getConfidenceColor(confidence: number): string {
  const level = getConfidenceLevel(confidence);
  switch (level) {
    case 'high':
      return 'bg-green-100 border-green-500 text-green-800';
    case 'medium':
      return 'bg-yellow-100 border-yellow-500 text-yellow-800';
    case 'low':
      return 'bg-red-100 border-red-500 text-red-800';
  }
}

/**
 * Check if all required fields are resolved (red fields must be resolved)
 */
export function areAllRedFieldsResolved(data: ReviewData): boolean {
  const fields = [
    data.entity_name,
    data.registered_agent,
    data.principal_address,
    data.mailing_address,
    ...data.officers.flatMap(o => [o.name, o.address])
  ];
  
  return fields.every(field => {
    if (field.confidence < 0.75) {
      return field.resolved;
    }
    return true;
  });
}

/**
 * Count unresolved low-confidence fields
 */
export function countUnresolvedRedFields(data: ReviewData): number {
  const fields = [
    data.entity_name,
    data.registered_agent,
    data.principal_address,
    data.mailing_address,
    ...data.officers.flatMap(o => [o.name, o.address])
  ];
  
  return fields.filter(field => field.confidence < 0.75 && !field.resolved).length;
}
