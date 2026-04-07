'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, type AuthUser } from '@/lib/auth';

export default function SignUpPage() {
  const router      = useRouter();
  const { setUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username,    setUsername]    = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      const data = await res.json() as { user?: AuthUser; error?: string; details?: unknown };

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
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-white text-3xl font-extrabold text-center mb-2">
          Raiv<span className="text-pink-500">stream</span>
        </h1>
        <p className="text-white/40 text-center text-sm mb-8">Create your account</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            required
            maxLength={50}
            autoComplete="name"
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors"
          />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="username"
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-8 pr-4 py-3 text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors"
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            maxLength={254}
            autoComplete="email"
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min. 8 characters)"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors"
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-white/40 text-center text-sm mt-6">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-pink-400 hover:text-pink-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
