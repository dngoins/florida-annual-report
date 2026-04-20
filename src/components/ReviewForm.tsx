'use client';

/**
 * ReviewForm Component
 * Main form for reviewing extracted fields with confidence highlighting
 * Blocks submission until all low-confidence (red) fields are resolved
 */

import React, { useState, useCallback } from 'react';
import { ReviewData, ExtractedField, areAllRedFieldsResolved, countUnresolvedRedFields } from '@/types/review';
import { ConfidenceField } from './ConfidenceField';
import { ReconciliationDiff } from './ReconciliationDiff';
import { autoSaveField } from '@/lib/api';

interface ReviewFormProps {
  data: ReviewData;
  onSubmit: () => void;
}

export function ReviewForm({ data: initialData, onSubmit }: ReviewFormProps) {
  const [data, setData] = useState<ReviewData>(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canSubmit = areAllRedFieldsResolved(data);
  const unresolvedCount = countUnresolvedRedFields(data);

  // Update a field and auto-save
  const handleFieldUpdate = useCallback(async (fieldId: string, value: string) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Optimistic update
      setData(prev => {
        const updateField = (field: ExtractedField): ExtractedField => {
          if (field.field_id === fieldId) {
            return { ...field, accepted_value: value, resolved: true };
          }
          return field;
        };

        return {
          ...prev,
          entity_name: updateField(prev.entity_name),
          registered_agent: updateField(prev.registered_agent),
          principal_address: updateField(prev.principal_address),
          mailing_address: updateField(prev.mailing_address),
          officers: prev.officers.map(officer => ({
            ...officer,
            name: updateField(officer.name),
            address: updateField(officer.address),
          })),
        };
      });

      // Auto-save to server
      await autoSaveField(fieldId, value);
    } catch (error) {
      setSaveError('Failed to save changes. Please try again.');
      console.error('Auto-save error:', error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Get all fields that need reconciliation review
  const getReconciliationFields = (): ExtractedField[] => {
    return [
      data.entity_name,
      data.registered_agent,
      data.principal_address,
      data.mailing_address,
      ...data.officers.flatMap(o => [o.name, o.address])
    ].filter(field => 
      field.sunbiz_value && field.sunbiz_value !== field.extracted_value
    );
  };

  const reconciliationFields = getReconciliationFields();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Review Extracted Data</h1>
        <p className="mt-2 text-gray-600">
          Review and verify the extracted information before submission.
        </p>
        
        {/* Status Banner */}
        {unresolvedCount > 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-red-700 font-medium">
                {unresolvedCount} field(s) require attention
              </span>
            </div>
            <p className="mt-1 text-sm text-red-600">
              Please review and resolve all red-highlighted fields before submitting.
            </p>
          </div>
        )}

        {/* Saving Indicator */}
        {isSaving && (
          <div className="mt-4 p-2 bg-blue-50 text-blue-700 rounded text-sm">
            Saving changes...
          </div>
        )}

        {/* Error Message */}
        {saveError && (
          <div className="mt-4 p-2 bg-red-50 text-red-700 rounded text-sm">
            {saveError}
          </div>
        )}
      </div>

      {/* Main Form Fields */}
      <div className="space-y-6">
        {/* Entity Information */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
            Entity Information
          </h2>
          <div className="space-y-4">
            <ConfidenceField
              field={data.entity_name}
              onUpdate={handleFieldUpdate}
            />
            <ConfidenceField
              field={data.registered_agent}
              onUpdate={handleFieldUpdate}
            />
          </div>
        </section>

        {/* Addresses */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
            Addresses
          </h2>
          <div className="space-y-4">
            <ConfidenceField
              field={data.principal_address}
              onUpdate={handleFieldUpdate}
            />
            <ConfidenceField
              field={data.mailing_address}
              onUpdate={handleFieldUpdate}
            />
          </div>
        </section>

        {/* Officers */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
            Officers
          </h2>
          {data.officers.map((officer, index) => (
            <div key={officer.field_id} className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-md font-medium text-gray-700 mb-3">
                {officer.title}
              </h3>
              <div className="space-y-4">
                <ConfidenceField
                  field={officer.name}
                  onUpdate={handleFieldUpdate}
                />
                <ConfidenceField
                  field={officer.address}
                  onUpdate={handleFieldUpdate}
                />
              </div>
            </div>
          ))}
        </section>

        {/* Reconciliation Diff Panel */}
        {reconciliationFields.length > 0 && (
          <section data-testid="reconciliation-panel">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
              Reconciliation Review
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              The following fields differ from current Sunbiz records:
            </p>
            <div className="space-y-4">
              {reconciliationFields.map(field => (
                <ReconciliationDiff key={field.field_id} field={field} />
              ))}
            </div>
          </section>
        )}

        {/* Submit Section */}
        <section className="pt-6 border-t">
          <div className="flex items-center justify-between">
            <div>
              {!canSubmit && (
                <p className="text-sm text-gray-500">
                  Resolve all red-highlighted fields to enable submission
                </p>
              )}
            </div>
            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              className={`px-6 py-3 rounded-lg font-medium text-white transition-colors ${
                canSubmit
                  ? 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
              aria-label="Submit review"
            >
              Submit Review
            </button>
          </div>
        </section>
      </div>

      {/* Confidence Legend */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Confidence Legend</h3>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border-l-4 border-green-500 rounded"></div>
            <span>High (≥90%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border-l-4 border-yellow-500 rounded"></div>
            <span>Medium (75-89%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border-l-4 border-red-500 rounded"></div>
            <span>Low (&lt;75%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
