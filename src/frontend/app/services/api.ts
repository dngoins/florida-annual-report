// API Service for Dashboard and Audit Log

import { CompaniesResponse, AuditLogResponse } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function fetchCompanies(page: number = 1, pageSize: number = 10): Promise<CompaniesResponse> {
  const response = await fetch(
    `${API_BASE_URL}/companies?page=${page}&page_size=${pageSize}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch companies: ${response.statusText}`);
  }
  
  return response.json();
}

export async function fetchAuditLog(
  companyId: string, 
  page: number = 1, 
  pageSize: number = 20
): Promise<AuditLogResponse> {
  const response = await fetch(
    `${API_BASE_URL}/audit/${companyId}?page=${page}&page_size=${pageSize}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch audit log: ${response.statusText}`);
  }
  
  return response.json();
}

// Calculate days until deadline (May 1)
export function getDaysUntilDeadline(deadlineDate?: string): number {
  const deadline = deadlineDate ? new Date(deadlineDate) : new Date(new Date().getFullYear(), 4, 1); // May 1
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  
  const diffTime = deadline.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}
