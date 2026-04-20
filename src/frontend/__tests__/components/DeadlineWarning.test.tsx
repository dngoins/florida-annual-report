import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DeadlineWarning } from '../../app/components/DeadlineWarning';

// Mock the current date
const mockDate = (dateString: string) => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(dateString));
};

afterEach(() => {
  jest.useRealTimers();
});

describe('DeadlineWarning', () => {
  test('does not render when more than 30 days until deadline', () => {
    mockDate('2024-03-01'); // 61 days before May 1
    const { container } = render(<DeadlineWarning deadlineDate="2024-05-01" />);
    expect(container.firstChild).toBeNull();
  });

  test('renders warning when 30 days or less until deadline', () => {
    mockDate('2024-04-05'); // 26 days before May 1
    render(<DeadlineWarning deadlineDate="2024-05-01" />);
    expect(screen.getByTestId('deadline-warning')).toBeInTheDocument();
    expect(screen.getByTestId('deadline-warning')).toHaveTextContent('day(s) remaining');
  });

  test('renders yellow warning when 8-30 days remaining', () => {
    mockDate('2024-04-10'); // 21 days before May 1
    render(<DeadlineWarning deadlineDate="2024-05-01" />);
    const warning = screen.getByTestId('deadline-warning');
    expect(warning).toHaveClass('bg-yellow-100');
    expect(warning).toHaveTextContent('REMINDER');
  });

  test('renders urgent red warning when 7 days or less', () => {
    mockDate('2024-04-25'); // 6 days before May 1
    render(<DeadlineWarning deadlineDate="2024-05-01" />);
    const warning = screen.getByTestId('deadline-warning');
    expect(warning).toHaveClass('bg-red-100');
    expect(warning).toHaveTextContent('URGENT');
  });

  test('renders deadline today message', () => {
    mockDate('2024-05-01'); // Deadline day
    render(<DeadlineWarning deadlineDate="2024-05-01" />);
    const warning = screen.getByTestId('deadline-warning');
    expect(warning).toHaveClass('bg-red-100');
    expect(warning).toHaveTextContent('DEADLINE TODAY');
  });

  test('renders past due message when deadline passed', () => {
    mockDate('2024-05-03'); // 2 days after May 1
    render(<DeadlineWarning deadlineDate="2024-05-01" />);
    const warning = screen.getByTestId('deadline-warning');
    expect(warning).toHaveClass('bg-red-100');
    expect(warning).toHaveTextContent('DEADLINE PASSED');
  });

  test('has correct role for accessibility', () => {
    mockDate('2024-04-15');
    render(<DeadlineWarning deadlineDate="2024-05-01" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
