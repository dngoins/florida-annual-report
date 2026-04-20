/**
 * Unit Tests for Confidence Scoring Module
 * 
 * Tests the weighted confidence calculation:
 * - Rule-based patterns: 40%
 * - NER model confidence: 40%
 * - LLM certainty signal: 20%
 * 
 * Per docs/reference/document-extraction.md
 */

import {
  calculateWeightedConfidence,
  evaluateFieldConfidence,
  CONFIDENCE_WEIGHTS,
  CONFIDENCE_THRESHOLD,
} from '../../../src/services/validation-service/confidence-scoring';

describe('Confidence Scoring Module', () => {
  describe('CONFIDENCE_WEIGHTS', () => {
    it('should have weights that sum to 1.0', () => {
      const totalWeight = 
        CONFIDENCE_WEIGHTS.ruleBased +
        CONFIDENCE_WEIGHTS.nerModel +
        CONFIDENCE_WEIGHTS.llmSignal;
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    it('should have correct individual weights per spec', () => {
      expect(CONFIDENCE_WEIGHTS.ruleBased).toBe(0.4);
      expect(CONFIDENCE_WEIGHTS.nerModel).toBe(0.4);
      expect(CONFIDENCE_WEIGHTS.llmSignal).toBe(0.2);
    });
  });

  describe('CONFIDENCE_THRESHOLD', () => {
    it('should be 0.75 per spec', () => {
      expect(CONFIDENCE_THRESHOLD).toBe(0.75);
    });
  });

  describe('calculateWeightedConfidence', () => {
    it('should calculate weighted average correctly with all scores', () => {
      const result = calculateWeightedConfidence({
        ruleBased: 1.0,
        nerModel: 1.0,
        llmSignal: 1.0,
      });
      expect(result).toBeCloseTo(1.0, 5);
    });

    it('should calculate weighted average correctly with mixed scores', () => {
      // 0.8 * 0.4 + 0.9 * 0.4 + 0.7 * 0.2 = 0.32 + 0.36 + 0.14 = 0.82
      const result = calculateWeightedConfidence({
        ruleBased: 0.8,
        nerModel: 0.9,
        llmSignal: 0.7,
      });
      expect(result).toBeCloseTo(0.82, 5);
    });

    it('should calculate correctly with zero scores', () => {
      const result = calculateWeightedConfidence({
        ruleBased: 0,
        nerModel: 0,
        llmSignal: 0,
      });
      expect(result).toBe(0);
    });

    it('should handle edge case with only rule-based score', () => {
      // 1.0 * 0.4 + 0 * 0.4 + 0 * 0.2 = 0.4
      const result = calculateWeightedConfidence({
        ruleBased: 1.0,
        nerModel: 0,
        llmSignal: 0,
      });
      expect(result).toBeCloseTo(0.4, 5);
    });

    it('should clamp scores above 1.0', () => {
      const result = calculateWeightedConfidence({
        ruleBased: 1.5,
        nerModel: 1.2,
        llmSignal: 1.1,
      });
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('should clamp scores below 0', () => {
      const result = calculateWeightedConfidence({
        ruleBased: -0.5,
        nerModel: 0.5,
        llmSignal: 0.5,
      });
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('evaluateFieldConfidence', () => {
    it('should return needs_review when score is below threshold', () => {
      const result = evaluateFieldConfidence({
        fieldName: 'entity_name',
        value: 'Test Corp',
        scores: {
          ruleBased: 0.5,
          nerModel: 0.6,
          llmSignal: 0.4,
        },
      });

      expect(result.status).toBe('needs_review');
      expect(result.fieldName).toBe('entity_name');
      expect(result.meetsThreshold).toBe(false);
      expect(result.weightedConfidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    });

    it('should return validated when score meets threshold', () => {
      const result = evaluateFieldConfidence({
        fieldName: 'entity_name',
        value: 'Test Corp',
        scores: {
          ruleBased: 0.9,
          nerModel: 0.95,
          llmSignal: 0.85,
        },
      });

      expect(result.status).toBe('validated');
      expect(result.meetsThreshold).toBe(true);
      expect(result.weightedConfidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    });

    it('should return validated at exactly threshold', () => {
      // Need scores that produce exactly 0.75
      // 0.75 * 0.4 + 0.75 * 0.4 + 0.75 * 0.2 = 0.3 + 0.3 + 0.15 = 0.75
      const result = evaluateFieldConfidence({
        fieldName: 'test_field',
        value: 'test',
        scores: {
          ruleBased: 0.75,
          nerModel: 0.75,
          llmSignal: 0.75,
        },
      });

      expect(result.status).toBe('validated');
      expect(result.meetsThreshold).toBe(true);
    });

    it('should return needs_review just below threshold', () => {
      const result = evaluateFieldConfidence({
        fieldName: 'test_field',
        value: 'test',
        scores: {
          ruleBased: 0.74,
          nerModel: 0.74,
          llmSignal: 0.74,
        },
      });

      expect(result.status).toBe('needs_review');
      expect(result.meetsThreshold).toBe(false);
    });

    it('should include all component scores in result', () => {
      const scores = {
        ruleBased: 0.8,
        nerModel: 0.9,
        llmSignal: 0.7,
      };

      const result = evaluateFieldConfidence({
        fieldName: 'test_field',
        value: 'test',
        scores,
      });

      expect(result.componentScores).toEqual(scores);
    });

    it('should preserve original value in result', () => {
      const result = evaluateFieldConfidence({
        fieldName: 'entity_name',
        value: 'Florida Test Corp LLC',
        scores: {
          ruleBased: 0.9,
          nerModel: 0.9,
          llmSignal: 0.9,
        },
      });

      expect(result.value).toBe('Florida Test Corp LLC');
    });

    it('should handle custom threshold via options', () => {
      const result = evaluateFieldConfidence({
        fieldName: 'test_field',
        value: 'test',
        scores: {
          ruleBased: 0.7,
          nerModel: 0.7,
          llmSignal: 0.7,
        },
        threshold: 0.6, // Lower threshold
      });

      expect(result.status).toBe('validated');
      expect(result.meetsThreshold).toBe(true);
    });
  });
});
