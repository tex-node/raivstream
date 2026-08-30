'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// ── Eye icons ────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

// ── Password strength ────────────────────────────────────────────────────────
// Semantic weak→strong ramp, not a Nocturne brand accent — same
// intentional exception as sign-up's identical meter.

function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw)          return { score: 0, label: '',        color: 'transparent' };
  if (pw.length < 6) return { score: 1, label: 'Weak',   color: '#ef4444' };
  let score = 1;
  if (pw.length >= 8)                         score++;
  if (/[A-Z]/.test(pw))                       score++;
  if (/[0-9]/.test(pw))                       score++;
  if (/[^A-Za-z0-9]/.test(pw))               score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['transparent', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
  return { score, label: labels[score], color: colors[score] };
}

// ── Main content (needs useSearchParams → must be wrapped in Suspense) ────────

type Step = 'form' | 'success' | 'invalid';

function ResetContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [showCfm,   setShowCfm]   = useState(false);
  const [step,      setStep]      = useState<Step>('form');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!token) setStep('invalid');
  }, [token]);

  const strength = getStrength(password);
  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });

      const data = await res.json() as { success?: boolean; error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Reset failed — please try again or request a new link');
        return;
      }

      setStep('success');
      setTimeout(() => router.push('/sign-in'), 3000);
    } catch {
      setError('Network error — please check your connection');
    } finally {
      setLoading(false);
    }
  };

  // ── Invalid / missing token ──
  if (step === 'invalid') {
    return (
      <div className="text-center py-2">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(227,93,93,0.10)' }}>
          <svg className="w-7 h-7" style={{ color: '#e35d5d' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--noc-t1)' }}>Invalid reset link</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--noc-t6)' }}>
          This link is missing, expired, or has already been used.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
        >
          Request a new link
        </Link>
      </div>
    );
  }

  // ── Success ──
  if (step === 'success') {
    return (
      <div className="text-center py-2">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(47,191,113,0.12)' }}
        >
          <svg className="w-7 h-7" style={{ color: '#2fbf71' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--noc-t1)' }}>Password updated!</h2>
        <p className="text-sm" style={{ color: 'var(--noc-t6)' }}>Redirecting you to sign in…</p>
      </div>
    );
  }

  // ── Form ──
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--noc-t1)' }}>Set a new password</h1>
        <p className="text-sm" style={{ color: 'var(--noc-t6)' }}>Choose something strong that you haven&apos;t used before.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="text-sm px-4 py-3 rounded-xl" style={{ background: 'rgba(227,93,93,0.10)', border: '1px solid rgba(227,93,93,0.3)', color: '#e35d5d' }}>
            {error}
          </div>
        )}

        {/* New password */}
        <div>
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--noc-t6)' }}>
            New password
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              autoFocus
              className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-colors"
              style={{
                background:   'var(--noc-card)',
                border:       '1px solid var(--noc-hairline)',
                color:        'var(--noc-t1)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(178,90,217,0.6)')}
              onBlur={(e)  => (e.target.style.borderColor = 'rgba(233,233,237,0.08)')}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-[var(--noc-t6)] hover:text-[var(--noc-t3)]"
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {/* Strength bar */}
          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className="flex-1 h-1 rounded-full transition-all duration-300"
                    style={{
                      background: n <= strength.score ? strength.color : 'rgba(233,233,237,0.08)',
                    }}
                  />
                ))}
              </div>
              <p className="text-xs" style={{ color: strength.color }}>{strength.label}</p>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--noc-t6)' }}>
            Confirm password
          </label>
          <div className="relative">
            <input
              type={showCfm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              required
              maxLength={128}
              autoComplete="new-password"
              className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-colors"
              style={{
                background:   'var(--noc-card)',
                color:        'var(--noc-t1)',
                border:       `1px solid ${mismatch ? 'rgba(227,93,93,0.5)' : 'rgba(233,233,237,0.08)'}`,
              }}
              onFocus={(e) => {
                if (!mismatch) e.target.style.borderColor = 'rgba(178,90,217,0.6)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = mismatch
                  ? 'rgba(227,93,93,0.5)'
                  : 'rgba(233,233,237,0.08)';
              }}
            />
            <button
              type="button"
              onClick={() => setShowCfm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-[var(--noc-t6)] hover:text-[var(--noc-t3)]"
              tabIndex={-1}
              aria-label={showCfm ? 'Hide password' : 'Show password'}
            >
              {showCfm ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {mismatch && (
            <p className="text-xs mt-1.5" style={{ color: '#e35d5d' }}>Passwords don&apos;t match</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || mismatch || password.length < 8}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:opacity-90 mt-1"
          style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(11,13,20,0.3)', borderTopColor: '#0B0D14' }} />
              Updating…
            </span>
          ) : 'Update password'}
        </button>
      </form>
    </>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--noc-page)' }}>
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(178,90,217,0.18) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        <Link href="/" className="block text-center font-extrabold text-2xl mb-8" style={{ color: 'var(--noc-t1)' }}>
          Raiv<span style={{ color: 'var(--noc-purple)' }}>stream</span>
        </Link>

        <div
          className="rounded-2xl p-8 border"
          style={{ background: 'var(--noc-card)', borderColor: 'var(--noc-hairline)' }}
        >
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid rgba(178,90,217,0.3)', borderTopColor: 'var(--noc-purple)' }} />
            </div>
          }>
            <ResetContent />
          </Suspense>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--noc-t6)' }}>
          <Link href="/sign-in" className="transition-colors text-[var(--noc-lavender-tint)] hover:text-[var(--noc-purple)]">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
