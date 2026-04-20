/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompaniesTable } from '../../app/components/CompaniesTable';
import { Company } from '../../app/types';

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

describe('CompaniesTable', () => {
  const mockCompanies: Company[] = [
    {
      id: '1',
      name: 'Acme Corp',
      document_number: 'P12345678',
      filing_status: 'pending',
      deadline: '2024-05-01',
      last_action: 'Created',
      last_action_date: '2024-03-15',
    },
    {
      id: '2',
      name: 'Tech Inc',
      document_number: 'P87654321',
      filing_status: 'confirmed',
      deadline: '2024-05-01',
      last_action: 'Submitted',
      last_action_date: '2024-04-01',
    },
  ];

  test('renders empty state when no companies', () => {
    render(<CompaniesTable companies={[]} />);
    expect(screen.getByTestId('companies-table-empty')).toHaveTextContent('No companies found');
  });

  test('renders table with companies', () => {
    render(<CompaniesTable companies={mockCompanies} />);
    expect(screen.getByTestId('companies-table')).toBeInTheDocument();
  });

  test('renders company names', () => {
    render(<CompaniesTable companies={mockCompanies} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Tech Inc')).toBeInTheDocument();
  });

  test('renders document numbers', () => {
    render(<CompaniesTable companies={mockCompanies} />);
    expect(screen.getByText('P12345678')).toBeInTheDocument();
    expect(screen.getByText('P87654321')).toBeInTheDocument();
  });

  test('renders status badges', () => {
    render(<CompaniesTable companies={mockCompanies} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  test('renders last action info', () => {
    render(<CompaniesTable companies={mockCompanies} />);
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  test('renders audit log links', () => {
    render(<CompaniesTable companies={mockCompanies} />);
    const links = screen.getAllByText('View Audit Log');
    expect(links).toHaveLength(2);
    expect(links[0].closest('a')).toHaveAttribute('href', '/audit/1');
    expect(links[1].closest('a')).toHaveAttribute('href', '/audit/2');
  });

  test('renders table headers', () => {
    render(<CompaniesTable companies={mockCompanies} />);
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Document #')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Deadline')).toBeInTheDocument();
    expect(screen.getByText('Last Action')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
