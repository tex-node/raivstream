'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@/lib/auth';
import { CreditBalancePill } from '@/components/credits/CreditBalancePill';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { destinationsFor, isDestinationActive, type NavDestination } from './navConfig';

/**
 * The application header (2026-11-20).
 *
 * `navConfig.ts` owns what the destinations are; this file owns how they are presented. Two behaviours changed with the
 * reorganization:
 *
 *  - The centre of the bar is a small set of destinations with menus instead of twelve flat links, and it is now shown on
 *    the feed too (inside a translucent pill so it stays legible over video). Hiding it there was why the feed had no
 *    route into the product other than the avatar menu.
 *  - Mobile gets a real drawer. Before this, a phone user had no navigation at all beyond the avatar dropdown, because the
 *    centre links were `hidden md:flex`.
 *
 * The avatar menu is deliberately reduced to account actions: Create, Library and the rest live in the destinations now,
 * and duplicating them in two menus is how the flat list happened in the first place.
 */
export function Navbar() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isR16 = useR16();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // On the video feed home page, use the transparent gradient version
  const isFeed = pathname === '/' && isSignedIn;

  const { data: notifData } = trpc.notification.unreadCount.useQuery(undefined, {
    enabled: isSignedIn,
    refetchInterval: 60_000,
  });
  const unreadCount = notifData?.count ?? 0;

  const canAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  const destinations = destinationsFor({
    signedIn: isSignedIn,
    username: user?.username,
    isR16,
    canAdmin,
  });

  // Any navigation closes everything: a menu left open across a route change is a menu that lies about where you are.
  useEffect(() => {
    setOpenKey(null);
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenKey(null);
      setDrawerOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-5 h-14 gap-2"
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
        <Link href="/" className="flex-shrink-0 flex items-center" style={{ color: 'var(--noc-t1)' }}>
          {isR16 ? (
            <span className="font-extrabold text-lg tracking-tight">
              R16 <span style={{ color: 'var(--noc-cyan)' }}>Kids</span>
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/raivstream-logofull.png" alt="Raivstream" className="h-7 w-auto" />
          )}
        </Link>

        {/* Destinations — desktop. On the feed they sit in a translucent pill so they stay readable over video. */}
        <div
          className="hidden md:flex items-center gap-0.5 flex-1 justify-center"
          style={isFeed ? { maxWidth: 560 } : undefined}
        >
          <div
            className="flex items-center gap-0.5 px-1 py-0.5 rounded-xl"
            style={isFeed ? { background: 'rgba(11,13,20,0.42)', backdropFilter: 'blur(12px)' } : undefined}
          >
            {destinations.map((destination) =>
              destination.links.length === 0 ? (
                <Link
                  key={destination.key}
                  href={destination.href}
                  className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={{
                    color: isDestinationActive(destination, pathname) ? 'var(--noc-t1)' : 'var(--noc-t5)',
                    background: isDestinationActive(destination, pathname) ? 'rgba(178,90,217,0.14)' : 'transparent',
                  }}
                >
                  {destination.label}
                </Link>
              ) : (
                <DestinationMenu
                  key={destination.key}
                  destination={destination}
                  pathname={pathname}
                  open={openKey === destination.key}
                  onOpen={() => setOpenKey(destination.key)}
                  onClose={() => setOpenKey((current) => (current === destination.key ? null : current))}
                  onToggle={() => setOpenKey((current) => (current === destination.key ? null : destination.key))}
                />
              ),
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Search — desktop */}
          <form onSubmit={handleSearch} className="hidden sm:block">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="text-sm rounded-lg px-3 py-1.5 w-32 lg:w-36 focus:w-44 transition-all outline-none"
                style={{
                  background: 'var(--noc-card)',
                  border: '1px solid var(--noc-hairline)',
                  color: 'var(--noc-t1)',
                }}
              />
              <button type="submit" className="absolute right-2.5 top-1/2 -translate-y-1/2" aria-label="Search">
                <svg className="w-3.5 h-3.5" fill="none" stroke="var(--noc-t6)" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          {/* Drawer toggle — mobile only. The centre destinations are md:flex, so without this a phone has no nav. */}
          <button
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-expanded={drawerOpen}
            aria-label="Menu"
            className="md:hidden p-1.5 rounded-lg transition-colors text-[var(--noc-t5)] hover:text-[var(--noc-t1)]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {drawerOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>

          {isSignedIn ? (
            <>
              <CreditBalancePill />
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

              {/* One primary action. It used to say "Upload"; creating is the thing this product is for, and upload is
                  one way to do it — so the gradient button goes to Create and upload lives in its menu. */}
              {!isR16 && (
                <Link
                  href="/create"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Create</span>
                </Link>
              )}

              {/* Avatar + account menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-expanded={menuOpen}
                  aria-label="Account"
                  className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-transparent hover:ring-[rgba(178,90,217,0.5)] transition-all"
                  style={{ background: 'var(--noc-gradient)' }}
                >
                  {user?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-sm flex items-center justify-center h-full" style={{ color: '#0B0D14' }}>
                      {user?.displayName?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  )}
                </button>

                {menuOpen && (
                  <div
                    className="absolute right-0 top-10 w-48 rounded-xl py-1 z-50"
                    style={{
                      background: 'var(--noc-bar)',
                      border: '1px solid var(--noc-hairline)',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}
                  >
                    {[
                      ...(user?.username ? [{ href: `/${user.username}`, label: 'Profile' }] : []),
                      { href: '/library', label: 'Library' },
                      { href: '/settings', label: 'Settings' },
                      ...((!isR16 && canAdmin) ? [{ href: '/admin', label: 'Admin' }] : []),
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

      {/* Mobile drawer — the only navigation a phone has. */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-x-0 top-14 z-40 overflow-y-auto"
          style={{
            background: 'var(--noc-bar)',
            borderBottom: '1px solid var(--noc-hairline)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.55)',
            maxHeight: 'calc(100vh - 3.5rem)',
          }}
        >
          <div className="px-4 py-3 space-y-4">
            {destinations.map((destination) => (
              <div key={destination.key}>
                <Link
                  href={destination.href}
                  onClick={() => setDrawerOpen(false)}
                  className="block text-[11px] font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--noc-pink-tint)', letterSpacing: '0.08em' }}
                >
                  {destination.label}
                </Link>
                {destination.links.length > 0 && (
                  <div className="space-y-0.5">
                    {destination.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setDrawerOpen(false)}
                        className="block px-2 py-1.5 rounded-lg text-sm transition-colors text-[var(--noc-t3)] hover:text-[var(--noc-t1)] hover:bg-[rgba(178,90,217,0.08)]"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function DestinationMenu({
  destination,
  pathname,
  open,
  onOpen,
  onClose,
  onToggle,
}: {
  destination: NavDestination;
  pathname: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
}) {
  const active = isDestinationActive(destination, pathname);

  return (
    <div className="relative" onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors"
        style={{
          color: active || open ? 'var(--noc-t1)' : 'var(--noc-t5)',
          background: active ? 'rgba(178,90,217,0.14)' : 'transparent',
        }}
      >
        {destination.label}
        <svg
          className="w-3 h-3 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-1/2 -translate-x-1/2 top-10 w-72 rounded-xl py-1 z-50"
          style={{
            background: 'var(--noc-bar)',
            border: '1px solid var(--noc-hairline)',
            boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
          }}
        >
          {destination.links.map((link) => (
            <Link
              key={link.href}
              role="menuitem"
              href={link.href}
              onClick={onClose}
              className="block px-3 py-2 rounded-lg mx-1 transition-colors hover:bg-[rgba(178,90,217,0.10)]"
            >
              <span className="block text-sm" style={{ color: 'var(--noc-t2)' }}>
                {link.label}
              </span>
              {link.hint && (
                <span className="block text-[11px] mt-0.5" style={{ color: 'var(--noc-t6)' }}>
                  {link.hint}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
