'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth, useUser } from '@/lib/auth';

export function Navbar() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
      {/* Logo */}
      <Link href="/" className="text-white font-extrabold text-xl tracking-tight">
        Raiv<span className="text-pink-500">stream</span>
      </Link>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos…"
            className="bg-white/10 text-white placeholder-white/40 text-sm rounded-full px-4 py-1.5 w-48 focus:w-64 transition-all outline-none border border-white/20 focus:border-white/50"
          />
          <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </form>

      {/* Auth */}
      <div className="flex items-center gap-3">
        {isSignedIn ? (
          <>
            <Link
              href="/generate"
              className="hidden sm:flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium transition-colors"
            >
              ✨ Create
            </Link>
            <Link
              href="/analytics"
              className="hidden sm:flex items-center gap-1 text-white/60 hover:text-white text-sm transition-colors"
            >
              Analytics
            </Link>
            <Link
              href="/pricing"
              className="hidden sm:flex items-center gap-1 text-white/60 hover:text-white text-sm transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/upload"
              className="hidden sm:flex items-center gap-1 bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold px-3 py-1.5 rounded-full transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload
            </Link>
            <button
              onClick={() => signOut()}
              className="text-white/60 hover:text-white text-sm transition-colors"
            >
              Sign out
            </button>
            <Link href={`/${user?.username}`}>
              <div className="w-8 h-8 rounded-full overflow-hidden bg-pink-500 flex items-center justify-center text-white font-bold text-sm">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  user?.displayName?.[0]?.toUpperCase() ?? '?'
                )}
              </div>
            </Link>
          </>
        ) : (
          <Link
            href="/sign-in"
            className="bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
