'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth, type AuthUser } from '@/lib/auth';

export default function SignInPage() {
  const router      = useRouter();
  const params      = useSearchParams();
  const redirectUrl = params.get('redirect_url') ?? '/';
  const { setUser } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // POST to our dedicated auth route — tokens stored in httpOnly cookies by server
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
        router.push(redirectUrl);
      }
    } catch {
      setError('Network error — please check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-white text-3xl font-extrabold text-center mb-2">
          Raiv<span className="text-pink-500">stream</span>
        </h1>
        <p className="text-white/40 text-center text-sm mb-8">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl">
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
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            maxLength={128}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-white/40 text-center text-sm mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="text-pink-400 hover:text-pink-300 transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
