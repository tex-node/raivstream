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
        <div className="w-14 h-14 rounded-full animate-spin" style={{ border: '4px solid rgba(233,233,237,0.15)', borderTopColor: 'var(--noc-magenta)' }} />
        <p className="text-sm" style={{ color: 'var(--noc-t5)' }}>Verifying your payment…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(79,139,214,0.15)' }}>
          <svg className="w-10 h-10" style={{ color: 'var(--noc-blue)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--noc-t1)' }}>Credits added!</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--noc-t6)' }}>
            <span className="font-semibold text-lg" style={{ color: 'var(--noc-t1)' }}>{credits?.toLocaleString()}</span> credits
            have been added to your balance.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => router.push('/generate')}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-colors hover:opacity-90"
            style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
          >
            Start Generating
          </button>
          <button
            onClick={() => router.push('/credits')}
            className="w-full py-3 rounded-2xl text-sm transition-colors text-[var(--noc-t5)] hover:text-[var(--noc-t1)]"
            style={{ border: '1px solid var(--noc-hairline)' }}
          >
            View Balance
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(227,93,93,0.15)' }}>
        <svg className="w-10 h-10" style={{ color: '#e35d5d' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--noc-t1)' }}>Payment issue</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--noc-t6)' }}>{error}</p>
      </div>
      <button
        onClick={() => router.push('/credits')}
        className="px-8 py-3.5 rounded-2xl text-sm font-semibold transition-colors"
        style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)', color: 'var(--noc-t1)' }}
      >
        Back to Credits
      </button>
    </div>
  );
}

export default function CreditSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--noc-page)', color: 'var(--noc-t1)' }}>
      <Suspense fallback={
        <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '4px solid rgba(233,233,237,0.15)', borderTopColor: 'var(--noc-magenta)' }} />
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
