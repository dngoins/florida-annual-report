// Dashboard and Audit Log Types

export type FilingStatus = 
  | 'pending' 
  | 'in_progress' 
  | 'needs_review' 
  | 'submitted' 
  | 'confirmed' 
  | 'manual_required';

export interface Company {
  id: string;
  name: string;
  document_number: string;
  filing_status: FilingStatus;
  deadline: string; // ISO date string
  last_action: string;
  last_action_date: string; // ISO date string
}

export interface CompaniesResponse {
  companies: Company[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AuditLogEntry {
  id: string;
  company_id: string;
  actor: string;
  action: string;
  timestamp: string; // ISO date string
  payload_before: Record<string, unknown> | null;
  payload_after: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogResponse {
  company_id: string;
  company_name: string;
  entries: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}
