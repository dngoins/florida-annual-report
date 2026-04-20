'use client';

/**
 * ConfidenceField Component
 * Displays an extracted field with confidence-based color coding
 * Supports inline editing for low/medium confidence fields
 */

import React, { useState, useRef, useEffect } from 'react';
import { ExtractedField, getConfidenceLevel, getConfidenceColor } from '@/types/review';

interface ConfidenceFieldProps {
  field: ExtractedField;
  onUpdate: (fieldId: string, value: string) => void;
  showLabel?: boolean;
}

export function ConfidenceField({ 
  field, 
  onUpdate, 
  showLabel = true 
}: ConfidenceFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(field.accepted_value || field.extracted_value);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const confidenceLevel = getConfidenceLevel(field.confidence);
  const colorClasses = getConfidenceColor(field.confidence);
  const isEditable = confidenceLevel !== 'high';
  const confidencePercent = Math.round(field.confidence * 100);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleAccept = () => {
    onUpdate(field.field_id, field.extracted_value);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue !== field.extracted_value) {
      onUpdate(field.field_id, editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setEditValue(field.extracted_value);
      setIsEditing(false);
    }
  };

  return (
    <div
      data-testid={`confidence-field-${field.field_id}`}
      className={`p-4 rounded-lg border-l-4 ${colorClasses} transition-all duration-200`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {showLabel && (
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.field_name}
            </label>
          )}
          
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={field.extracted_value}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label={`Edit ${field.field_name}`}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium">
                {field.resolved ? (field.accepted_value || field.extracted_value) : field.extracted_value}
              </span>
              {field.resolved && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-600 text-white">
                  ✓ Resolved
                </span>
              )}
            </div>
          )}
          
          <div className="mt-1 text-sm text-gray-500">
            Confidence: {confidencePercent}%
          </div>
        </div>
        
        {isEditable && !isEditing && !field.resolved && (
          <div className="flex gap-2 ml-4">
            <button
              onClick={handleAccept}
              className="px-3 py-1 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
              aria-label="Accept extracted value"
            >
              Accept
            </button>
            <button
              onClick={handleEdit}
              className="px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              aria-label="Edit field value"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
