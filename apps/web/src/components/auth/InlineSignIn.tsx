'use client';

import { useState } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';
import type { AuthUser } from '@/lib/auth';

/**
 * Self-contained sign-in panel for embedding mid-flow.
 * Calls onSuccess(user) — no redirect, no page reload.
 */
export function InlineSignIn({
  heading,
  subtext,
  onSuccess,
  onBack,
}: {
  heading: string;
  subtext: string;
  onSuccess: (user: AuthUser) => void;
  onBack: () => void;
}) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method:      'POST',
        credentials: 'same-origin',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json() as { user?: AuthUser; error?: string };
      if (!res.ok) { setError(data.error ?? 'Sign-in failed — please try again'); return; }
      if (data.user) onSuccess(data.user);
    } catch {
      setError('Network error — please check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[var(--noc-purple)]">
        ← Edit my idea
      </button>

      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-6 space-y-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Sign in to continue</p>
          <h2 className="mt-1 text-xl font-black text-[var(--noc-t1)]">{heading}</h2>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">{subtext}</p>
        </div>

        <GoogleSignInButton mode="signin" onError={(msg) => setError(msg)} onSuccess={onSuccess} />

        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3">
          {error && (
            <div className="text-sm px-4 py-3 rounded-xl" style={{ background: 'rgba(227,93,93,0.10)', border: '1px solid rgba(227,93,93,0.3)', color: '#e35d5d' }}>
              {error}
            </div>
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="email"
            maxLength={254}
            className="w-full rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-4 py-3 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            maxLength={128}
            className="w-full rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-4 py-3 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)]"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:opacity-90"
            style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--noc-t6)]">
          No account?{' '}
          <a href="/sign-up" className="text-[var(--noc-lavender-tint)] hover:text-[var(--noc-purple)]">
            Create one free
          </a>
        </p>
      </div>
    </div>
  );
}
