'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth, useUser } from '@/lib/auth';

export function Navbar() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // On the video feed home page, use the transparent gradient version
  const isFeed = pathname === '/' && isSignedIn;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 h-14"
      style={
        isFeed
          ? { background: 'transparent' }
          : {
              background: 'rgba(5,11,24,0.80)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }
      }
    >
      {/* Logo */}
      <Link href="/" className="text-white font-extrabold text-lg tracking-tight flex-shrink-0">
        Raiv<span style={{ color: '#a78bfa' }}>stream</span>
      </Link>

      {/* Centre nav — desktop */}
      {!isFeed && (
        <div className="hidden md:flex items-center gap-1">
          {[
            { href: '/pricing',  label: 'Pricing'   },
            { href: '/generate', label: 'AI Studio' },
            { href: '/credits',  label: 'Credits'   },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors"
              style={{
                color: pathname === href ? '#fff' : 'rgba(255,255,255,0.50)',
                background: pathname === href ? 'rgba(255,255,255,0.07)' : 'transparent',
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search — desktop */}
        <form onSubmit={handleSearch} className="hidden sm:block">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="text-white text-sm rounded-lg px-3 py-1.5 w-36 focus:w-48 transition-all outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: '#fff',
              }}
            />
            <button type="submit" className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="rgba(255,255,255,0.35)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </form>

        {isSignedIn ? (
          <>
            {/* Upload */}
            <Link
              href="/upload"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload
            </Link>

            {/* Avatar + dropdown */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-transparent hover:ring-violet-500/50 transition-all"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-sm flex items-center justify-center h-full">
                    {user?.displayName?.[0]?.toUpperCase() ?? '?'}
                  </span>
                )}
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-10 w-44 rounded-xl py-1 z-50"
                  style={{
                    background: '#0d1420',
                    border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                  }}
                >
                  {[
                    { href: `/${user?.username}`, label: 'Profile' },
                    { href: '/analytics',         label: 'Analytics' },
                    { href: '/generate',          label: '✨ AI Studio' },
                    { href: '/credits',           label: '⚡ Credits' },
                    { href: '/settings',          label: 'Settings' },
                    ...(user?.role === 'ADMIN' || user?.role === 'MODERATOR'
                      ? [{ href: '/admin', label: '🛡️ Admin' }]
                      : []),
                  ].map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      {label}
                    </Link>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} className="my-1" />
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-400/80 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white/60 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
