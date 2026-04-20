'use client';

import { getDaysUntilDeadline } from '../services/api';

interface DeadlineWarningProps {
  deadlineDate?: string;
}

export function DeadlineWarning({ deadlineDate }: DeadlineWarningProps) {
  const daysRemaining = getDaysUntilDeadline(deadlineDate);
  
  // Only show warning if less than 30 days remaining
  if (daysRemaining > 30) {
    return null;
  }
  
  const isUrgent = daysRemaining <= 7;
  const isPastDue = daysRemaining < 0;
  
  let message: string;
  let bgColor: string;
  let borderColor: string;
  let textColor: string;
  
  if (isPastDue) {
    message = `⚠️ DEADLINE PASSED: Filing was due ${Math.abs(daysRemaining)} day(s) ago!`;
    bgColor = 'bg-red-100';
    borderColor = 'border-red-500';
    textColor = 'text-red-800';
  } else if (daysRemaining === 0) {
    message = '⚠️ DEADLINE TODAY: Filing is due today!';
    bgColor = 'bg-red-100';
    borderColor = 'border-red-500';
    textColor = 'text-red-800';
  } else if (isUrgent) {
    message = `⚠️ URGENT: Only ${daysRemaining} day(s) remaining until May 1 deadline!`;
    bgColor = 'bg-red-100';
    borderColor = 'border-red-500';
    textColor = 'text-red-800';
  } else {
    message = `⏰ REMINDER: ${daysRemaining} day(s) remaining until May 1 deadline.`;
    bgColor = 'bg-yellow-100';
    borderColor = 'border-yellow-500';
    textColor = 'text-yellow-800';
  }
  
  return (
    <div
      data-testid="deadline-warning"
      className={`${bgColor} ${borderColor} ${textColor} border-l-4 p-4 mb-4 rounded-r`}
      role="alert"
    >
      <p className="font-medium">{message}</p>
    </div>
  );
}
