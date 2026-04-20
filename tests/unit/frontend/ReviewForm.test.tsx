/** @jest-environment jsdom */
/**
 * Review Form Component Tests
 * TDD tests for review form UI with confidence highlighting
 */

import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewForm } from '@/components/ReviewForm';
import { ConfidenceField } from '@/components/ConfidenceField';
import { ReconciliationDiff } from '@/components/ReconciliationDiff';
import { 
  getConfidenceLevel, 
  getConfidenceColor, 
  areAllRedFieldsResolved,
  countUnresolvedRedFields,
  ReviewData,
  ExtractedField 
} from '@/types/review';

// Mock API
jest.mock('@/lib/api', () => ({
  getReviewData: jest.fn(),
  updateField: jest.fn(),
  submitReview: jest.fn(),
  autoSaveField: jest.fn(),
}));

const mockField = (overrides: Partial<ExtractedField> = {}): ExtractedField => ({
  field_id: 'field-1',
  field_name: 'Entity Name',
  extracted_value: 'ACME Corp',
  confidence: 0.95,
  sunbiz_value: 'ACME Corporation',
  resolved: false,
  ...overrides,
});

const mockReviewData = (overrides: Partial<ReviewData> = {}): ReviewData => ({
  id: 'review-123',
  company_id: 'company-456',
  entity_name: mockField({ field_id: 'entity-name', field_name: 'Entity Name' }),
  registered_agent: mockField({ field_id: 'reg-agent', field_name: 'Registered Agent', confidence: 0.92 }),
  principal_address: mockField({ field_id: 'principal-addr', field_name: 'Principal Address', confidence: 0.80 }),
  mailing_address: mockField({ field_id: 'mailing-addr', field_name: 'Mailing Address', confidence: 0.70 }),
  officers: [
    {
      field_id: 'officer-1',
      title: 'President',
      name: mockField({ field_id: 'officer-1-name', field_name: 'Officer Name', confidence: 0.88 }),
      address: mockField({ field_id: 'officer-1-addr', field_name: 'Officer Address', confidence: 0.65 }),
    },
  ],
  status: 'pending_review',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  ...overrides,
});

// Unit Tests for Helper Functions
describe('getConfidenceLevel', () => {
  it('returns "high" for confidence >= 0.90', () => {
    expect(getConfidenceLevel(0.90)).toBe('high');
    expect(getConfidenceLevel(0.95)).toBe('high');
    expect(getConfidenceLevel(1.0)).toBe('high');
  });

  it('returns "medium" for confidence 0.75-0.89', () => {
    expect(getConfidenceLevel(0.75)).toBe('medium');
    expect(getConfidenceLevel(0.80)).toBe('medium');
    expect(getConfidenceLevel(0.89)).toBe('medium');
  });

  it('returns "low" for confidence < 0.75', () => {
    expect(getConfidenceLevel(0.74)).toBe('low');
    expect(getConfidenceLevel(0.50)).toBe('low');
    expect(getConfidenceLevel(0)).toBe('low');
  });
});

describe('getConfidenceColor', () => {
  it('returns green classes for high confidence', () => {
    const classes = getConfidenceColor(0.95);
    expect(classes).toContain('green');
  });

  it('returns yellow classes for medium confidence', () => {
    const classes = getConfidenceColor(0.80);
    expect(classes).toContain('yellow');
  });

  it('returns red classes for low confidence', () => {
    const classes = getConfidenceColor(0.60);
    expect(classes).toContain('red');
  });
});

describe('areAllRedFieldsResolved', () => {
  it('returns true when all red fields are resolved', () => {
    const data = mockReviewData({
      mailing_address: mockField({ confidence: 0.70, resolved: true }),
      officers: [
        {
          field_id: 'officer-1',
          title: 'President',
          name: mockField({ confidence: 0.88 }),
          address: mockField({ confidence: 0.65, resolved: true }),
        },
      ],
    });
    expect(areAllRedFieldsResolved(data)).toBe(true);
  });

  it('returns false when any red field is unresolved', () => {
    const data = mockReviewData({
      mailing_address: mockField({ confidence: 0.70, resolved: false }),
    });
    expect(areAllRedFieldsResolved(data)).toBe(false);
  });
});

describe('countUnresolvedRedFields', () => {
  it('counts unresolved red fields correctly', () => {
    const data = mockReviewData();
    // mailing_address (0.70) and officer address (0.65) are red and unresolved
    expect(countUnresolvedRedFields(data)).toBe(2);
  });
});

// Component Tests
describe('ConfidenceField', () => {
  it('renders field with correct confidence color', () => {
    const field = mockField({ confidence: 0.95 });
    render(<ConfidenceField field={field} onUpdate={jest.fn()} />);
    
    const container = screen.getByTestId('confidence-field-field-1');
    expect(container.className).toContain('green');
  });

  it('renders yellow for medium confidence', () => {
    const field = mockField({ confidence: 0.80 });
    render(<ConfidenceField field={field} onUpdate={jest.fn()} />);
    
    const container = screen.getByTestId('confidence-field-field-1');
    expect(container.className).toContain('yellow');
  });

  it('renders red for low confidence', () => {
    const field = mockField({ confidence: 0.60 });
    render(<ConfidenceField field={field} onUpdate={jest.fn()} />);
    
    const container = screen.getByTestId('confidence-field-field-1');
    expect(container.className).toContain('red');
  });

  it('shows edit button for low/medium confidence fields', () => {
    const field = mockField({ confidence: 0.70 });
    render(<ConfidenceField field={field} onUpdate={jest.fn()} />);
    
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('shows accept button for low/medium confidence fields', () => {
    const field = mockField({ confidence: 0.70 });
    render(<ConfidenceField field={field} onUpdate={jest.fn()} />);
    
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
  });

  it('enables inline editing when edit button is clicked', async () => {
    const field = mockField({ confidence: 0.70 });
    render(<ConfidenceField field={field} onUpdate={jest.fn()} />);
    
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows original value as placeholder when editing', async () => {
    const field = mockField({ confidence: 0.70, extracted_value: 'Original Value' });
    render(<ConfidenceField field={field} onUpdate={jest.fn()} />);
    
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Original Value');
  });

  it('calls onUpdate on blur with auto-save', async () => {
    const onUpdate = jest.fn();
    const field = mockField({ confidence: 0.70 });
    render(<ConfidenceField field={field} onUpdate={onUpdate} />);
    
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'New Value');
    fireEvent.blur(input);
    
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('field-1', 'New Value');
    });
  });

  it('marks field as resolved when accept button is clicked', async () => {
    const onUpdate = jest.fn();
    const field = mockField({ confidence: 0.70, extracted_value: 'Extracted' });
    render(<ConfidenceField field={field} onUpdate={onUpdate} />);
    
    await userEvent.click(screen.getByRole('button', { name: /accept/i }));
    
    expect(onUpdate).toHaveBeenCalledWith('field-1', 'Extracted');
  });
});

describe('ReconciliationDiff', () => {
  it('renders both Sunbiz and extracted values', () => {
    const field = mockField({
      extracted_value: 'ACME Corp',
      sunbiz_value: 'ACME Corporation',
    });
    render(<ReconciliationDiff field={field} />);
    
    expect(screen.getByText(/ACME Corp/)).toBeInTheDocument();
    expect(screen.getByText(/ACME Corporation/)).toBeInTheDocument();
  });

  it('highlights differences between values', () => {
    const field = mockField({
      extracted_value: 'ACME Corp',
      sunbiz_value: 'ACME Corporation',
    });
    render(<ReconciliationDiff field={field} />);
    
    expect(screen.getByTestId('diff-panel')).toBeInTheDocument();
  });

  it('shows "No Sunbiz data" when sunbiz_value is missing', () => {
    const field = mockField({
      extracted_value: 'ACME Corp',
      sunbiz_value: undefined,
    });
    render(<ReconciliationDiff field={field} />);
    
    expect(screen.getByText(/no sunbiz data/i)).toBeInTheDocument();
  });
});

describe('ReviewForm', () => {
  const mockData = mockReviewData();

  it('renders all extracted fields', () => {
    render(<ReviewForm data={mockData} onSubmit={jest.fn()} />);
    
    expect(screen.getByText(/entity name/i)).toBeInTheDocument();
    expect(screen.getByText(/registered agent/i)).toBeInTheDocument();
    expect(screen.getByText(/principal address/i)).toBeInTheDocument();
    expect(screen.getByText(/mailing address/i)).toBeInTheDocument();
  });

  it('renders officer fields', () => {
    render(<ReviewForm data={mockData} onSubmit={jest.fn()} />);
    
    expect(screen.getByText(/president/i)).toBeInTheDocument();
  });

  it('disables submit button when red fields are unresolved', () => {
    render(<ReviewForm data={mockData} onSubmit={jest.fn()} />);
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when all red fields are resolved', () => {
    const resolvedData = mockReviewData({
      mailing_address: mockField({ confidence: 0.70, resolved: true }),
      officers: [
        {
          field_id: 'officer-1',
          title: 'President',
          name: mockField({ confidence: 0.88 }),
          address: mockField({ confidence: 0.65, resolved: true }),
        },
      ],
    });
    render(<ReviewForm data={resolvedData} onSubmit={jest.fn()} />);
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('shows count of unresolved red fields', () => {
    render(<ReviewForm data={mockData} onSubmit={jest.fn()} />);
    
    expect(screen.getByText(/2 field\(s\) require attention/i)).toBeInTheDocument();
  });

  it('shows reconciliation diff panel', () => {
    render(<ReviewForm data={mockData} onSubmit={jest.fn()} />);
    
    expect(screen.getByTestId('reconciliation-panel')).toBeInTheDocument();
  });

  it('calls onSubmit when form is submitted', async () => {
    const onSubmit = jest.fn();
    const resolvedData = mockReviewData({
      mailing_address: mockField({ confidence: 0.70, resolved: true }),
      officers: [
        {
          field_id: 'officer-1',
          title: 'President',
          name: mockField({ confidence: 0.88 }),
          address: mockField({ confidence: 0.65, resolved: true }),
        },
      ],
    });
    render(<ReviewForm data={resolvedData} onSubmit={onSubmit} />);
    
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    
    expect(onSubmit).toHaveBeenCalled();
  });
});
