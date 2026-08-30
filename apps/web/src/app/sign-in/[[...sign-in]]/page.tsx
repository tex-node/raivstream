'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth, type AuthUser } from '@/lib/auth';

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

function SignInForm() {
  const router      = useRouter();
  const params      = useSearchParams();
  const redirectUrl = params.get('redirect_url') ?? '/';
  const { setUser } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
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

      if (!res.ok) {
        setError(data.error ?? 'Sign-in failed — please try again');
        return;
      }

      if (data.user) {
        setUser(data.user);
        // Hard redirect so the middleware sees the new raiv_at cookie
        // on the very next request — router.push() (soft nav) can miss it
        window.location.href = redirectUrl;
      }
    } catch {
      setError('Network error — please check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="text-sm px-4 py-3 rounded-xl" style={{ background: 'rgba(227,93,93,0.10)', border: '1px solid rgba(227,93,93,0.3)', color: '#e35d5d' }}>
          {error}
        </div>
      )}

      {/* Email */}
      <div>
        <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--noc-t6)' }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          maxLength={254}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
          style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)', color: 'var(--noc-t1)' }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(178,90,217,0.6)')}
          onBlur={(e)  => (e.target.style.borderColor = 'rgba(233,233,237,0.08)')}
        />
      </div>

      {/* Password */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--noc-t6)' }}>
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs transition-colors text-[var(--noc-lavender-tint)] hover:text-[var(--noc-purple)]"
            tabIndex={-1}
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
            autoComplete="current-password"
            maxLength={128}
            className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-colors"
            style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)', color: 'var(--noc-t1)' }}
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
            Signing in…
          </span>
        ) : 'Sign in'}
      </button>
    </form>
  );
}

export default function SignInPage() {
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
          <div className="mb-6">
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--noc-t1)' }}>Welcome back</h1>
            <p className="text-sm" style={{ color: 'var(--noc-t6)' }}>Sign in to your account</p>
          </div>

          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--noc-t6)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="transition-colors text-[var(--noc-lavender-tint)] hover:text-[var(--noc-purple)]">
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}
