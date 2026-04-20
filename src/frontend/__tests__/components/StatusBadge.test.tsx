/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBadge } from '../../app/components/StatusBadge';
import { FilingStatus } from '../../app/types';

describe('StatusBadge', () => {
  const statuses: { status: FilingStatus; label: string; colorClass: string }[] = [
    { status: 'pending', label: 'Pending', colorClass: 'bg-gray-100' },
    { status: 'in_progress', label: 'In Progress', colorClass: 'bg-blue-100' },
    { status: 'needs_review', label: 'Needs Review', colorClass: 'bg-yellow-100' },
    { status: 'submitted', label: 'Submitted', colorClass: 'bg-purple-100' },
    { status: 'confirmed', label: 'Confirmed', colorClass: 'bg-green-100' },
    { status: 'manual_required', label: 'Manual Required', colorClass: 'bg-red-100' },
  ];

  test.each(statuses)('renders $status badge with correct label "$label"', ({ status, label }) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent(label);
  });

  test.each(statuses)('renders $status badge with correct color class', ({ status, colorClass }) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByTestId('status-badge')).toHaveClass(colorClass);
  });

  test('renders with correct base styling', () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveClass('rounded-full', 'text-xs', 'font-medium');
  });
});
