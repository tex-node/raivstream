'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, type AuthUser } from '@/lib/auth';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

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

// Password-strength colors are a universal weak→strong semantic ramp
// (red→orange→yellow→green→emerald), not a Nocturne brand accent —
// left as-is intentionally, matching the same "semantic, not brand"
// decision already made for error/success colors elsewhere in this
// pass (see Navbar's sign-out red, or Phase 1b's doc notes).
function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw)           return { score: 0, label: '',           color: 'transparent' };
  if (pw.length < 6) return { score: 1, label: 'Weak',       color: '#ef4444'    };
  let score = 1;
  if (pw.length >= 8)              score++;
  if (/[A-Z]/.test(pw))            score++;
  if (/[0-9]/.test(pw))            score++;
  if (/[^A-Za-z0-9]/.test(pw))    score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['transparent', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
  return { score, label: labels[score], color: colors[score] };
}

const INPUT_BASE =
  'w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors';
const INPUT_STYLE = {
  background: 'var(--noc-card)',
  border:     '1px solid var(--noc-hairline)',
  color:      'var(--noc-t1)',
} as const;
const onFocus = (e: React.FocusEvent<HTMLInputElement>) =>
  (e.target.style.borderColor = 'rgba(178,90,217,0.6)');
const onBlur  = (e: React.FocusEvent<HTMLInputElement>) =>
  (e.target.style.borderColor = 'rgba(233,233,237,0.08)');

export default function SignUpPage() {
  const router      = useRouter();
  const { setUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username,    setUsername]    = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [showCfm,     setShowCfm]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const strength = getStrength(password);
  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method:      'POST',
        credentials: 'same-origin',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          email:       email.trim().toLowerCase(),
          password,
          username:    username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
          displayName: displayName.trim() || username,
        }),
      });

      const data = await res.json() as { user?: AuthUser; error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Registration failed — please try again');
        return;
      }

      if (data.user) {
        setUser(data.user);
        router.push('/');
      }
    } catch {
      setError('Network error — please check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--noc-page)' }}>
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(178,90,217,0.20) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 85% 100%, rgba(79,214,232,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm lg:max-w-md">
        <Link href="/" className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/raivstream-logofull.png" alt="Raivstream" className="h-8 w-auto" />
        </Link>

        <div
          className="rounded-2xl p-8 border"
          style={{ background: 'var(--noc-card)', borderColor: 'var(--noc-hairline)' }}
        >
          <div className="mb-6">
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--noc-t1)' }}>Create your account</h1>
            <p className="text-sm" style={{ color: 'var(--noc-t6)' }}>Free forever — no credit card needed</p>
          </div>

          <GoogleSignInButton
            mode="signup"
            onError={setError}
            onSuccess={(user) => {
              setUser(user);
              router.push('/');
            }}
          />
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="text-sm px-4 py-3 rounded-xl" style={{ background: 'rgba(227,93,93,0.10)', border: '1px solid rgba(227,93,93,0.3)', color: '#e35d5d' }}>
                {error}
              </div>
            )}

            {/* Display name */}
            <div>
              <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--noc-t6)' }}>
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                required
                maxLength={50}
                autoComplete="name"
                className={INPUT_BASE}
                style={{ ...INPUT_STYLE }}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--noc-t6)' }}>
                Username
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm select-none" style={{ color: 'var(--noc-t6)' }}>@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="yourhandle"
                  required
                  minLength={3}
                  maxLength={30}
                  autoComplete="username"
                  className={`${INPUT_BASE} pl-8`}
                  style={{ ...INPUT_STYLE }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
            </div>

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
                maxLength={254}
                autoComplete="email"
                className={INPUT_BASE}
                style={{ ...INPUT_STYLE }}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--noc-t6)' }}>
                Password
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
                  className={`${INPUT_BASE} pr-11`}
                  style={{ ...INPUT_STYLE }}
                  onFocus={onFocus}
                  onBlur={onBlur}
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
                  className={`${INPUT_BASE} pr-11`}
                  style={{
                    background: 'var(--noc-card)',
                    color: 'var(--noc-t1)',
                    border: `1px solid ${mismatch ? 'rgba(227,93,93,0.5)' : 'rgba(233,233,237,0.08)'}`,
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
              disabled={loading || mismatch}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:opacity-90 mt-1"
              style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(11,13,20,0.3)', borderTopColor: '#0B0D14' }} />
                  Creating account…
                </span>
              ) : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--noc-t6)' }}>
          Already have an account?{' '}
          <Link href="/sign-in" className="transition-colors text-[var(--noc-lavender-tint)] hover:text-[var(--noc-purple)]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
