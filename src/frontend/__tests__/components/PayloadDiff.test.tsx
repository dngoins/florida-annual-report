/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PayloadDiff } from '../../app/components/PayloadDiff';

describe('PayloadDiff', () => {
  test('renders "No payload data" when both before and after are null', () => {
    render(<PayloadDiff before={null} after={null} />);
    expect(screen.getByText('No payload data')).toBeInTheDocument();
  });

  test('renders "No changes" when before and after are identical', () => {
    const payload = { status: 'pending', name: 'Test' };
    render(<PayloadDiff before={payload} after={payload} />);
    expect(screen.getByText('No changes')).toBeInTheDocument();
  });

  test('renders added fields in green', () => {
    render(
      <PayloadDiff
        before={null}
        after={{ status: 'pending', name: 'Acme Corp' }}
      />
    );
    const diff = screen.getByTestId('payload-diff');
    expect(diff).toHaveTextContent('+ status: pending');
    expect(diff).toHaveTextContent('+ name: Acme Corp');
  });

  test('renders removed fields in red', () => {
    render(
      <PayloadDiff
        before={{ old_field: 'value' }}
        after={{}}
      />
    );
    const diff = screen.getByTestId('payload-diff');
    expect(diff).toHaveTextContent('- old_field: value');
  });

  test('renders changed fields showing both old and new values', () => {
    render(
      <PayloadDiff
        before={{ status: 'pending' }}
        after={{ status: 'in_progress' }}
      />
    );
    const diff = screen.getByTestId('payload-diff');
    expect(diff).toHaveTextContent('- status: pending');
    expect(diff).toHaveTextContent('+ status: in_progress');
  });

  test('handles object values by stringifying them', () => {
    render(
      <PayloadDiff
        before={null}
        after={{ data: { nested: 'value' } }}
      />
    );
    const diff = screen.getByTestId('payload-diff');
    expect(diff).toHaveTextContent('{"nested":"value"}');
  });

  test('handles null values correctly', () => {
    render(
      <PayloadDiff
        before={{ field: null }}
        after={{ field: 'value' }}
      />
    );
    const diff = screen.getByTestId('payload-diff');
    expect(diff).toHaveTextContent('- field: null');
    expect(diff).toHaveTextContent('+ field: value');
  });
});
