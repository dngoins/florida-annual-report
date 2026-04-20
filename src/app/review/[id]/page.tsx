'use client';

/**
 * Review Page - /review/:id
 * Displays extracted fields for review with confidence highlighting
 */

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReviewForm } from '@/components/ReviewForm';
import { ReviewData } from '@/types/review';
import { getReviewData, submitReview } from '@/lib/api';

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params.id as string;

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const reviewData = await getReviewData(reviewId);
        setData(reviewData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load review data');
      } finally {
        setLoading(false);
      }
    }

    if (reviewId) {
      fetchData();
    }
  }, [reviewId]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      await submitReview(reviewId);
      // Navigate to success page or dashboard
      router.push(`/review/${reviewId}/success`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review');
      setSubmitting(false);
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading review data...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">Error Loading Review</h2>
          <p className="mt-2 text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No Data State
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Review Not Found</h2>
          <p className="mt-2 text-gray-600">The requested review could not be found.</p>
        </div>
      </div>
    );
  }

  // Main Content
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 max-w-4xl mx-auto">
          <ol className="flex items-center space-x-2 text-sm text-gray-500">
            <li>
              <a href="/" className="hover:text-blue-600">Dashboard</a>
            </li>
            <li>/</li>
            <li>
              <a href="/reviews" className="hover:text-blue-600">Reviews</a>
            </li>
            <li>/</li>
            <li className="text-gray-900 font-medium">Review #{reviewId}</li>
          </ol>
        </nav>

        {/* Submitting Overlay */}
        {submitting && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-700">Submitting review...</p>
            </div>
          </div>
        )}

        {/* Review Form */}
        <ReviewForm data={data} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
