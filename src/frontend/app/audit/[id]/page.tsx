'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AuditLogEntry, AuditLogResponse } from '../../types';
import { fetchAuditLog } from '../../services/api';
import { AuditLogTable, Pagination } from '../../components';

export default function AuditLogPage() {
  const params = useParams();
  const companyId = params.id as string;
  
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  useEffect(() => {
    async function loadAuditLog() {
      setLoading(true);
      setError(null);
      
      try {
        const response: AuditLogResponse = await fetchAuditLog(companyId, currentPage);
        setEntries(response.entries);
        setCompanyName(response.company_name);
        setTotalPages(response.total_pages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit log');
      } finally {
        setLoading(false);
      }
    }
    
    if (companyId) {
      loadAuditLog();
    }
  }, [companyId, currentPage]);
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  return (
    <div data-testid="audit-log-page">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
        >
          ← Back to Dashboard
        </Link>
        
        <h2 className="text-xl font-semibold text-gray-800 mt-2 mb-1">
          Audit Log {companyName && `- ${companyName}`}
        </h2>
        <p className="text-gray-600">
          Chronological record of all actions taken on this filing.
        </p>
        <p className="text-sm text-gray-500 mt-1">
          <em>This log is read-only and cannot be modified.</em>
        </p>
      </div>
      
      {loading && (
        <div data-testid="loading-indicator" className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading audit log...</p>
        </div>
      )}
      
      {error && (
        <div data-testid="error-message" className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {!loading && !error && (
        <>
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <AuditLogTable entries={entries} />
          </div>
          
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
