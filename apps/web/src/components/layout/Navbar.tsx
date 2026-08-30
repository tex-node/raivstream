'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth, useUser } from '@/lib/auth';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';

export function Navbar() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isR16 = useR16();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: notifData } = trpc.notification.unreadCount.useQuery(undefined, {
    enabled: isSignedIn,
    refetchInterval: 60_000,
  });
  const unreadCount = notifData?.count ?? 0;

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
              background: 'var(--noc-bar-alpha)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderBottom: '1px solid var(--noc-rule)',
            }
      }
    >
      {/* Logo */}
      <Link href="/" className="font-extrabold text-lg tracking-tight flex-shrink-0" style={{ color: 'var(--noc-t1)' }}>
        {isR16 ? (
          <>R16 <span style={{ color: 'var(--noc-cyan)' }}>Kids</span></>
        ) : (
          <>Raiv<span style={{ color: 'var(--noc-purple)' }}>stream</span></>
        )}
      </Link>

      {/* Centre nav — desktop (hidden on R16) */}
      {!isFeed && !isR16 && (
        <div className="hidden md:flex items-center gap-1">
          {[
            { href: '/pricing',  label: 'Pricing'   },
            { href: '/story-playground', label: 'Story Playground' },
            { href: '/academy', label: 'Academy' },
            { href: '/generate', label: 'AI Studio' },
            { href: '/credits',  label: 'Credits'   },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors"
              style={{
                color: pathname === href ? 'var(--noc-t1)' : 'var(--noc-t5)',
                background: pathname === href ? 'rgba(178,90,217,0.14)' : 'transparent',
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
              className="text-sm rounded-lg px-3 py-1.5 w-36 focus:w-48 transition-all outline-none"
              style={{
                background: 'var(--noc-card)',
                border: '1px solid var(--noc-hairline)',
                color: 'var(--noc-t1)',
              }}
            />
            <button type="submit" className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="var(--noc-t6)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </form>

        {isSignedIn ? (
          <>
            {/* Notifications bell */}
            <Link
              href="/notifications"
              className="relative p-1.5 transition-colors text-[var(--noc-t5)] hover:text-[var(--noc-t1)]"
              aria-label="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            {/* Upload — hidden on R16 */}
            {!isR16 && (
              <Link
                href="/upload"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Upload</span>
              </Link>
            )}

            {/* Avatar + dropdown */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-transparent hover:ring-[rgba(178,90,217,0.5)] transition-all"
                style={{ background: 'var(--noc-gradient)' }}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-sm flex items-center justify-center h-full" style={{ color: '#0B0D14' }}>
                    {user?.displayName?.[0]?.toUpperCase() ?? '?'}
                  </span>
                )}
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-10 w-44 rounded-xl py-1 z-50"
                  style={{
                    background: 'var(--noc-bar)',
                    border: '1px solid var(--noc-hairline)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                  }}
                >
                  {[
                    { href: `/${user?.username}`, label: 'Profile' },
                    { href: '/story-playground', label: 'Story Playground' },
                    ...(!isR16 ? [
                      { href: '/academy', label: 'Academy' },
                    ] : []),
                    ...(!isR16 ? [
                      { href: '/upload',   label: '📤 Upload'     },
                      { href: '/analytics',label: 'Analytics'     },
                      { href: '/story-studio', label: 'Advanced Story Studio' },
                      { href: '/generate', label: '✨ AI Studio'  },
                      { href: '/credits',  label: '⚡ Credits'    },
                    ] : []),
                    { href: '/settings', label: 'Settings' },
                    ...((!isR16 && (user?.role === 'ADMIN' || user?.role === 'MODERATOR'))
                      ? [{ href: '/admin', label: '🛡️ Admin' }]
                      : []),
                  ].map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm transition-colors text-[var(--noc-t4)] hover:text-[var(--noc-t1)] hover:bg-[rgba(178,90,217,0.08)]"
                    >
                      {label}
                    </Link>
                  ))}
                  <div style={{ borderTop: '1px solid var(--noc-rule)' }} className="my-1" />
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
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors text-[var(--noc-t5)] hover:text-[var(--noc-t1)]"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
