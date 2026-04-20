'use client';

interface PayloadDiffProps {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function PayloadDiff({ before, after }: PayloadDiffProps) {
  if (!before && !after) {
    return <span className="text-gray-400 text-sm">No payload data</span>;
  }
  
  // Get all unique keys
  const allKeys = new Set<string>();
  if (before) Object.keys(before).forEach(key => allKeys.add(key));
  if (after) Object.keys(after).forEach(key => allKeys.add(key));
  
  const changes: { key: string; type: 'added' | 'removed' | 'changed' | 'unchanged'; oldValue?: unknown; newValue?: unknown }[] = [];
  
  allKeys.forEach(key => {
    const oldValue = before?.[key];
    const newValue = after?.[key];
    
    if (oldValue === undefined && newValue !== undefined) {
      changes.push({ key, type: 'added', newValue });
    } else if (oldValue !== undefined && newValue === undefined) {
      changes.push({ key, type: 'removed', oldValue });
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ key, type: 'changed', oldValue, newValue });
    }
  });
  
  if (changes.length === 0) {
    return <span className="text-gray-400 text-sm">No changes</span>;
  }
  
  const formatValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  
  return (
    <div data-testid="payload-diff" className="text-sm font-mono bg-gray-50 p-2 rounded max-w-md overflow-auto">
      {changes.map(({ key, type, oldValue, newValue }) => (
        <div key={key} className="mb-1">
          {type === 'added' && (
            <span className="text-green-700">
              + {key}: {formatValue(newValue)}
            </span>
          )}
          {type === 'removed' && (
            <span className="text-red-700">
              - {key}: {formatValue(oldValue)}
            </span>
          )}
          {type === 'changed' && (
            <div>
              <span className="text-red-700">- {key}: {formatValue(oldValue)}</span>
              <br />
              <span className="text-green-700">+ {key}: {formatValue(newValue)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
