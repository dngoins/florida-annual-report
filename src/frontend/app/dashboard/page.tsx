'use client';

import { useState, useEffect } from 'react';
import { Company, CompaniesResponse } from '../types';
import { fetchCompanies } from '../services/api';
import { CompaniesTable, DeadlineWarning, Pagination } from '../components';

export default function DashboardPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  useEffect(() => {
    async function loadCompanies() {
      setLoading(true);
      setError(null);
      
      try {
        const response: CompaniesResponse = await fetchCompanies(currentPage);
        setCompanies(response.companies);
        setTotalPages(response.total_pages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load companies');
      } finally {
        setLoading(false);
      }
    }
    
    loadCompanies();
  }, [currentPage]);
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  return (
    <div data-testid="dashboard-page">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Filing Status Dashboard</h2>
        <p className="text-gray-600">Overview of all company filings and their current status.</p>
      </div>
      
      <DeadlineWarning />
      
      {loading && (
        <div data-testid="loading-indicator" className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading companies...</p>
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
            <CompaniesTable companies={companies} />
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
