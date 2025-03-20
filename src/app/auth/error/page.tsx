'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ErrorMessage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="text-center py-12">
      <h1 className="text-3xl font-bold text-red-600 mb-4">Access Denied</h1>
      <p className="text-lg mb-6">
        {error === 'AccessDenied' 
          ? 'Your email is not authorized to access this application.'
          : 'An error occurred during authentication.'}
      </p>
      <Link 
        href="/"
        className="text-blue-600 hover:text-blue-800 underline"
      >
        Return to Home
      </Link>
    </div>
  );
}

function LoadingError() {
  return (
    <div className="text-center py-12 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-64 mx-auto mb-4"></div>
      <div className="h-6 bg-gray-200 rounded w-96 mx-auto mb-6"></div>
      <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
    </div>
  );
}

export default function AuthError() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <Suspense fallback={<LoadingError />}>
          <ErrorMessage />
        </Suspense>
      </div>
    </main>
  );
} 