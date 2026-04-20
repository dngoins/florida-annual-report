'use client';

/**
 * ReconciliationDiff Component
 * Shows side-by-side comparison of Sunbiz current value vs extracted value
 */

import React from 'react';
import { ExtractedField } from '@/types/review';

interface ReconciliationDiffProps {
  field: ExtractedField;
}

/**
 * Simple diff highlighting - highlights character differences
 */
function highlightDifferences(str1: string, str2: string): { 
  highlighted1: React.ReactNode; 
  highlighted2: React.ReactNode;
} {
  if (!str1 || !str2) {
    return { 
      highlighted1: str1 || '', 
      highlighted2: str2 || '' 
    };
  }

  const words1 = str1.split(' ');
  const words2 = str2.split(' ');

  const highlighted1 = words1.map((word, i) => {
    const isDifferent = !words2.includes(word);
    return (
      <span 
        key={i} 
        className={isDifferent ? 'bg-red-200 px-0.5 rounded' : ''}
      >
        {word}{i < words1.length - 1 ? ' ' : ''}
      </span>
    );
  });

  const highlighted2 = words2.map((word, i) => {
    const isDifferent = !words1.includes(word);
    return (
      <span 
        key={i} 
        className={isDifferent ? 'bg-green-200 px-0.5 rounded' : ''}
      >
        {word}{i < words2.length - 1 ? ' ' : ''}
      </span>
    );
  });

  return { highlighted1, highlighted2 };
}

export function ReconciliationDiff({ field }: ReconciliationDiffProps) {
  const hasSunbizValue = field.sunbiz_value !== undefined && field.sunbiz_value !== null;
  const valuesMatch = hasSunbizValue && field.sunbiz_value === field.extracted_value;

  const { highlighted1, highlighted2 } = hasSunbizValue 
    ? highlightDifferences(field.sunbiz_value!, field.extracted_value)
    : { highlighted1: null, highlighted2: field.extracted_value };

  return (
    <div 
      data-testid="diff-panel" 
      className="bg-gray-50 rounded-lg p-4 border border-gray-200"
    >
      <h4 className="text-sm font-semibold text-gray-700 mb-3">
        Reconciliation: {field.field_name}
      </h4>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Sunbiz Current Value */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Sunbiz Current
          </div>
          <div className="p-3 bg-white rounded border border-gray-200 min-h-[60px]">
            {hasSunbizValue ? (
              <span className="text-gray-800">{highlighted1}</span>
            ) : (
              <span className="text-gray-400 italic">No Sunbiz data available</span>
            )}
          </div>
        </div>

        {/* Extracted Value */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Extracted Value
          </div>
          <div className="p-3 bg-white rounded border border-gray-200 min-h-[60px]">
            <span className="text-gray-800">{highlighted2}</span>
          </div>
        </div>
      </div>

      {/* Match Status */}
      <div className="mt-3">
        {valuesMatch ? (
          <span className="inline-flex items-center text-sm text-green-600">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Values match
          </span>
        ) : hasSunbizValue ? (
          <span className="inline-flex items-center text-sm text-yellow-600">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Values differ - review required
          </span>
        ) : null}
      </div>
    </div>
  );
}
