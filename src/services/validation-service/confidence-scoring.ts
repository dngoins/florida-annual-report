/**
 * Confidence Scoring Module
 * 
 * Implements weighted confidence calculation for extracted fields.
 * Per docs/reference/document-extraction.md:
 * - Rule-based patterns (regex/keyword proximity): 40%
 * - NER model confidence: 40%
 * - LLM certainty signal: 20%
 * 
 * Threshold: 0.75 (configurable)
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Confidence weights per spec
 * These MUST sum to 1.0
 */
export const CONFIDENCE_WEIGHTS = {
  ruleBased: 0.4,
  nerModel: 0.4,
  llmSignal: 0.2,
} as const;

/**
 * Default confidence threshold
 * Fields below this require human review
 */
export const CONFIDENCE_THRESHOLD = 0.75;

// ============================================================================
// Types
// ============================================================================

export interface ComponentScores {
  /** Rule-based pattern matching score (0-1) */
  ruleBased: number;
  /** NER model confidence score (0-1) */
  nerModel: number;
  /** LLM certainty signal (0-1) */
  llmSignal: number;
}

export interface FieldConfidenceInput {
  fieldName: string;
  value: string | any;
  scores: ComponentScores;
  /** Optional custom threshold (defaults to CONFIDENCE_THRESHOLD) */
  threshold?: number;
}

export interface FieldConfidenceResult {
  fieldName: string;
  value: string | any;
  weightedConfidence: number;
  componentScores: ComponentScores;
  meetsThreshold: boolean;
  status: 'validated' | 'needs_review';
  threshold: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate weighted confidence score from component scores
 * 
 * Formula: 
 *   score = (ruleBased * 0.4) + (nerModel * 0.4) + (llmSignal * 0.2)
 * 
 * @param scores - Component confidence scores
 * @returns Weighted confidence score between 0 and 1
 */
export function calculateWeightedConfidence(scores: ComponentScores): number {
  // Clamp all input scores to valid range [0, 1]
  const ruleBased = clamp(scores.ruleBased, 0, 1);
  const nerModel = clamp(scores.nerModel, 0, 1);
  const llmSignal = clamp(scores.llmSignal, 0, 1);

  // Calculate weighted average
  const weighted = 
    (ruleBased * CONFIDENCE_WEIGHTS.ruleBased) +
    (nerModel * CONFIDENCE_WEIGHTS.nerModel) +
    (llmSignal * CONFIDENCE_WEIGHTS.llmSignal);

  // Ensure result is in valid range (should be, but be safe)
  return clamp(weighted, 0, 1);
}

/**
 * Evaluate a single field's confidence and determine if it needs review
 * 
 * @param input - Field data with component scores
 * @returns Evaluation result with status
 */
export function evaluateFieldConfidence(input: FieldConfidenceInput): FieldConfidenceResult {
  const threshold = input.threshold ?? CONFIDENCE_THRESHOLD;
  const weightedConfidence = calculateWeightedConfidence(input.scores);
  const meetsThreshold = weightedConfidence >= threshold;

  return {
    fieldName: input.fieldName,
    value: input.value,
    weightedConfidence,
    componentScores: { ...input.scores },
    meetsThreshold,
    status: meetsThreshold ? 'validated' : 'needs_review',
    threshold,
  };
}

/**
 * Evaluate multiple fields at once
 * 
 * @param fields - Map of field names to their values and scores
 * @param threshold - Optional custom threshold
 * @returns Map of field names to evaluation results
 */
export function evaluateAllFields(
  fields: Record<string, { value: any; scores: ComponentScores }>,
  threshold?: number
): Record<string, FieldConfidenceResult> {
  const results: Record<string, FieldConfidenceResult> = {};

  for (const [fieldName, field] of Object.entries(fields)) {
    results[fieldName] = evaluateFieldConfidence({
      fieldName,
      value: field.value,
      scores: field.scores,
      threshold,
    });
  }

  return results;
}

/**
 * Generate a validation summary from evaluated fields
 */
export function generateValidationSummary(
  evaluatedFields: Record<string, FieldConfidenceResult>
): {
  totalFields: number;
  validatedFields: number;
  needsReviewFields: number;
  averageConfidence: number;
  lowestConfidence: { fieldName: string; confidence: number } | null;
} {
  const fields = Object.values(evaluatedFields);
  const totalFields = fields.length;

  if (totalFields === 0) {
    return {
      totalFields: 0,
      validatedFields: 0,
      needsReviewFields: 0,
      averageConfidence: 0,
      lowestConfidence: null,
    };
  }

  const validatedFields = fields.filter(f => f.status === 'validated').length;
  const needsReviewFields = fields.filter(f => f.status === 'needs_review').length;
  
  const totalConfidence = fields.reduce((sum, f) => sum + f.weightedConfidence, 0);
  const averageConfidence = totalConfidence / totalFields;

  const lowestField = fields.reduce((lowest, current) => 
    current.weightedConfidence < lowest.weightedConfidence ? current : lowest
  );

  return {
    totalFields,
    validatedFields,
    needsReviewFields,
    averageConfidence,
    lowestConfidence: {
      fieldName: lowestField.fieldName,
      confidence: lowestField.weightedConfidence,
    },
  };
}
