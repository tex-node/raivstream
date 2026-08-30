'use client';

import { useState } from 'react';
import Link from 'next/link';

type Step = 'form' | 'sent';

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [step,    setStep]    = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Something went wrong — please try again');
        return;
      }

      setStep('sent');
    } catch {
      setError('Network error — please check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--noc-page)' }}>
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(178,90,217,0.20) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 85% 100%, rgba(79,214,232,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm lg:max-w-md">
        {/* Logo */}
        <Link href="/" className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/raivstream-logofull.png" alt="Raivstream" className="h-8 w-auto" />
        </Link>

        <div
          className="rounded-2xl p-8 border"
          style={{ background: 'var(--noc-card)', borderColor: 'var(--noc-hairline)' }}
        >
          {step === 'form' ? (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--noc-t1)' }}>Forgot your password?</h1>
                <p className="text-sm" style={{ color: 'var(--noc-t6)' }}>
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && (
                  <div className="text-sm px-4 py-3 rounded-xl" style={{ background: 'rgba(227,93,93,0.10)', border: '1px solid rgba(227,93,93,0.3)', color: '#e35d5d' }}>
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--noc-t6)' }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    maxLength={254}
                    autoComplete="email"
                    autoFocus
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                    style={{
                      background:   'var(--noc-card)',
                      border:       '1px solid var(--noc-hairline)',
                      color:        'var(--noc-t1)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'rgba(178,90,217,0.6)')}
                    onBlur={(e)  => (e.target.style.borderColor = 'rgba(233,233,237,0.08)')}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:opacity-90 mt-1"
                  style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(11,13,20,0.3)', borderTopColor: '#0B0D14' }} />
                      Sending…
                    </span>
                  ) : 'Send reset link'}
                </button>
              </form>
            </>
          ) : (
            /* ── Success state ── */
            <div className="text-center py-2">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(178,90,217,0.15)' }}
              >
                <svg className="w-7 h-7" fill="none" stroke="var(--noc-lavender-tint)" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--noc-t1)' }}>Check your inbox</h2>
              <p className="text-sm leading-relaxed mb-1" style={{ color: 'var(--noc-t6)' }}>
                If <span style={{ color: 'var(--noc-t3)' }}>{email}</span> is registered, a password
                reset link has been sent. It expires in <strong style={{ color: 'var(--noc-t4)' }}>1 hour</strong>.
              </p>
              <p className="text-xs mt-3" style={{ color: 'var(--noc-t6)' }}>
                Don&apos;t see it? Check your spam folder.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--noc-t6)' }}>
          Remembered it?{' '}
          <Link href="/sign-in" className="transition-colors text-[var(--noc-lavender-tint)] hover:text-[var(--noc-purple)]">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
