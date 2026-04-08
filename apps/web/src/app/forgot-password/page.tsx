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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#050b18' }}>
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(120,60,220,0.18) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <Link href="/" className="block text-center text-white font-extrabold text-2xl mb-8">
          Raiv<span style={{ color: '#a78bfa' }}>stream</span>
        </Link>

        <div
          className="rounded-2xl p-8 border"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {step === 'form' ? (
            <>
              <div className="mb-6">
                <h1 className="text-white text-xl font-bold mb-1">Forgot your password?</h1>
                <p className="text-white/40 text-sm">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-white/40 font-medium mb-1.5 uppercase tracking-wider">
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
                    className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors placeholder-white/25"
                    style={{
                      background:   'rgba(255,255,255,0.06)',
                      border:       '1px solid rgba(255,255,255,0.10)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'rgba(167,139,250,0.6)')}
                    onBlur={(e)  => (e.target.style.borderColor = 'rgba(255,255,255,0.10)')}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 hover:opacity-90 mt-1"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                style={{ background: 'rgba(124,58,237,0.15)' }}
              >
                <svg className="w-7 h-7" fill="none" stroke="#a78bfa" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-white font-bold text-lg mb-2">Check your inbox</h2>
              <p className="text-white/40 text-sm leading-relaxed mb-1">
                If <span className="text-white/70">{email}</span> is registered, a password
                reset link has been sent. It expires in <strong className="text-white/60">1 hour</strong>.
              </p>
              <p className="text-white/30 text-xs mt-3">
                Don&apos;t see it? Check your spam folder.
              </p>
            </div>
          )}
        </div>

        <p className="text-white/30 text-center text-sm mt-6">
          Remembered it?{' '}
          <Link href="/sign-in" className="text-violet-400 hover:text-violet-300 transition-colors">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
