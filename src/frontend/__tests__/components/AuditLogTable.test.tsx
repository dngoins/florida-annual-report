import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuditLogTable } from '../../app/components/AuditLogTable';
import { AuditLogEntry } from '../../app/types';

describe('AuditLogTable', () => {
  const mockEntries: AuditLogEntry[] = [
    {
      id: '1',
      company_id: 'c1',
      actor: 'system',
      action: 'Filing Created',
      timestamp: '2024-03-15T10:30:00Z',
      payload_before: null,
      payload_after: { status: 'pending', name: 'Acme Corp' },
    },
    {
      id: '2',
      company_id: 'c1',
      actor: 'user@example.com',
      action: 'Status Updated',
      timestamp: '2024-03-16T14:45:00Z',
      payload_before: { status: 'pending' },
      payload_after: { status: 'in_progress' },
    },
  ];

  test('renders empty state when no entries', () => {
    render(<AuditLogTable entries={[]} />);
    expect(screen.getByTestId('audit-log-empty')).toHaveTextContent('No audit log entries found');
  });

  test('renders table with entries', () => {
    render(<AuditLogTable entries={mockEntries} />);
    expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();
  });

  test('renders actor names', () => {
    render(<AuditLogTable entries={mockEntries} />);
    expect(screen.getByText('system')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  test('renders action descriptions', () => {
    render(<AuditLogTable entries={mockEntries} />);
    expect(screen.getByText('Filing Created')).toBeInTheDocument();
    expect(screen.getByText('Status Updated')).toBeInTheDocument();
  });

  test('renders table headers', () => {
    render(<AuditLogTable entries={mockEntries} />);
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Actor')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Payload Diff')).toBeInTheDocument();
  });

  test('renders entry rows with correct test ids', () => {
    render(<AuditLogTable entries={mockEntries} />);
    expect(screen.getByTestId('audit-entry-1')).toBeInTheDocument();
    expect(screen.getByTestId('audit-entry-2')).toBeInTheDocument();
  });
});
