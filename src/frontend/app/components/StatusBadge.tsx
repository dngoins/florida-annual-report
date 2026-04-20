'use client';

import { FilingStatus } from '../types';

interface StatusBadgeProps {
  status: FilingStatus;
}

const STATUS_STYLES: Record<FilingStatus, { bg: string; text: string; label: string }> = {
  pending: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    label: 'Pending',
  },
  in_progress: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    label: 'In Progress',
  },
  needs_review: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    label: 'Needs Review',
  },
  submitted: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    label: 'Submitted',
  },
  confirmed: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    label: 'Confirmed',
  },
  manual_required: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    label: 'Manual Required',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
