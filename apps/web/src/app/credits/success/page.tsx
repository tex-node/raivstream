'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Status = 'verifying' | 'success' | 'error';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reference = searchParams.get('reference') ?? searchParams.get('trxref');
    if (!reference) {
      setError('No payment reference found');
      setStatus('error');
      return;
    }

    fetch(`/api/paystack/verify?reference=${reference}`)
      .then((r) => r.json())
      .then((data: { success?: boolean; credits?: number; error?: string }) => {
        if (data.success && data.credits) {
          setCredits(data.credits);
          setStatus('success');
        } else {
          setError(data.error ?? 'Verification failed');
          setStatus('error');
        }
      })
      .catch(() => {
        setError('Network error during verification');
        setStatus('error');
      });
  }, [searchParams]);

  if (status === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 border-4 border-white/20 border-t-pink-500 rounded-full animate-spin" />
        <p className="text-white/60 text-sm">Verifying your payment…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Credits added!</h1>
          <p className="text-white/50 text-sm mt-2">
            <span className="text-white font-semibold text-lg">{credits?.toLocaleString()}</span> credits
            have been added to your balance.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => router.push('/generate')}
            className="w-full py-3.5 bg-pink-500 hover:bg-pink-600 rounded-2xl font-semibold text-sm transition-colors"
          >
            Start Generating
          </button>
          <button
            onClick={() => router.push('/credits')}
            className="w-full py-3 border border-white/10 hover:border-white/20 rounded-2xl text-white/60 hover:text-white text-sm transition-colors"
          >
            View Balance
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Payment issue</h1>
        <p className="text-white/50 text-sm mt-2">{error}</p>
      </div>
      <button
        onClick={() => router.push('/credits')}
        className="px-8 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-sm font-semibold transition-colors"
      >
        Back to Credits
      </button>
    </div>
  );
}

export default function CreditSuccessPage() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <Suspense fallback={
        <div className="w-10 h-10 border-4 border-white/20 border-t-pink-500 rounded-full animate-spin" />
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
