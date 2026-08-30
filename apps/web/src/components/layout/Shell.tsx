'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useUser } from '@/lib/auth';
import { useR16 } from '@/lib/r16';

export type ShellTab = 'home' | 'story' | 'characters' | 'scenes' | 'assets';

interface ShellProps {
  title?: string;
  subtitle?: string;
  backHref?: string;
  showSaved?: boolean;
  activeTab?: ShellTab;
  projectId?: string;
  actionBar?: React.ReactNode;
  children: React.ReactNode;
}

const TAB_ICONS: Record<ShellTab, React.ReactNode> = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  story: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  characters: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  scenes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  assets: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
    </svg>
  ),
};

type NavItem = { id: ShellTab; label: string; href: string; disabled: boolean };

function primaryNavItems(projectId?: string): NavItem[] {
  return [
    { id: 'home',       label: 'Home',       href: '/story-playground',                                    disabled: false },
    { id: 'story',      label: 'Story',      href: projectId ? `/story-playground/${projectId}/story`      : '#', disabled: !projectId },
    { id: 'characters', label: 'Cast',       href: projectId ? `/story-playground/${projectId}/characters` : '#', disabled: !projectId },
    { id: 'scenes',     label: 'Scenes',     href: projectId ? `/story-playground/${projectId}/scenes`     : '#', disabled: !projectId },
    { id: 'assets',     label: 'Assets',     href: projectId ? `/story-playground/${projectId}/assets`     : '#', disabled: !projectId },
  ];
}

/**
 * Phase 1 of the application-wide UI reconciliation (see
 * docs/operations/application-wide-ui-reconciliation.md): before this,
 * there was no way to navigate from inside the Story Playground workspace
 * back to the app's other top-level destinations (the video-feed Home,
 * Academy, Account, Admin) — Shell's nav was entirely project-scoped. The
 * legacy `Navbar` already links into Story Playground/Academy/Settings/
 * Admin from the feed side; this closes the missing direction. Academy is
 * hidden under R16 and Admin is role-gated, matching Navbar's own existing
 * conventions exactly (not a new policy invented here).
 */
type GlobalDestination = { key: string; label: string; href: string; icon: React.ReactNode };

const GLOBAL_ICONS = {
  feed: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M10 8l6 4-6 4V8z" />
    </svg>
  ),
  academy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </svg>
  ),
  account: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  admin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
    </svg>
  ),
} as const;

function globalDestinations(isR16: boolean, canAdmin: boolean): GlobalDestination[] {
  return [
    { key: 'feed', label: 'Home', href: '/', icon: GLOBAL_ICONS.feed },
    ...(!isR16 ? [{ key: 'academy', label: 'Academy', href: '/academy', icon: GLOBAL_ICONS.academy }] : []),
    { key: 'account', label: 'Account', href: '/settings', icon: GLOBAL_ICONS.account },
    ...(!isR16 && canAdmin ? [{ key: 'admin', label: 'Admin', href: '/admin', icon: GLOBAL_ICONS.admin }] : []),
  ];
}

/** Mobile bottom tab bar — primary nav only, exactly as before. Hidden at lg:. */
function BottomTabBar({ activeTab, projectId }: { activeTab: ShellTab; projectId?: string }) {
  const tabs = primaryNavItems(projectId);
  return (
    <nav className="noc-tab-bar lg:hidden">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const sharedStyle: React.CSSProperties = {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
          minHeight: '48px',
          justifyContent: 'center',
          color: isActive ? 'var(--noc-pink-tint)' : 'var(--noc-t6)',
          textDecoration: 'none',
          transition: 'color 0.15s',
        };
        if (tab.disabled) {
          return (
            <span key={tab.id} aria-disabled="true" style={{ ...sharedStyle, color: 'rgba(117,121,140,0.45)', cursor: 'default' }}>
              {TAB_ICONS[tab.id]}
              <span style={{ fontSize: '10.5px', fontWeight: 500 }}>{tab.label}</span>
            </span>
          );
        }
        return (
          <Link key={tab.id} href={tab.href} style={sharedStyle}>
            {TAB_ICONS[tab.id]}
            <span style={{ fontSize: '10.5px', fontWeight: 500 }}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const SECONDARY_ITEMS = [
  { label: 'Audio', tab: 'audio' },
  { label: 'Sequence', tab: 'sequence' },
  { label: 'Film', tab: 'film' },
  { label: 'Storybook', tab: 'storybook' },
] as const;

/** Desktop persistent sidebar — primary nav + secondary (legacy-tab) links.
 * Only rendered at lg: and up; mobile keeps the bottom tab bar instead. */
function Sidebar({ activeTab, projectId }: { activeTab?: ShellTab; projectId?: string }) {
  const isR16 = useR16();
  const { user } = useUser();
  const canAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  const tabs = primaryNavItems(projectId);
  const destinations = globalDestinations(isR16, canAdmin);

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-64 lg:shrink-0"
      style={{ borderRight: '1px solid var(--noc-hairline)', background: 'var(--noc-bar)' }}
    >
      <div style={{ padding: '20px 22px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Link href="/story-playground" style={{ fontWeight: 700, fontSize: 17, color: 'var(--noc-t1)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
          Raiv<span style={{ color: 'var(--noc-purple)' }}>stream</span>
        </Link>
        {/* Global destinations — Home/Academy/Account/Admin. The only way
            to leave the project workspace before this was the browser
            back button or typing a URL; see Phase 1 note above. */}
        <div style={{ display: 'flex', gap: 2 }}>
          {destinations.map((dest) => (
            <Link
              key={dest.key}
              href={dest.href}
              title={dest.label}
              aria-label={dest.label}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--noc-t5)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              {dest.icon}
            </Link>
          ))}
        </div>
      </div>

      <nav style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const rowStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            color: isActive ? 'var(--noc-t1)' : tab.disabled ? 'rgba(117,121,140,0.45)' : 'var(--noc-t4)',
            background: isActive ? 'rgba(178,90,217,0.14)' : 'transparent',
          };
          if (tab.disabled) {
            return (
              <span key={tab.id} aria-disabled="true" style={rowStyle}>
                {TAB_ICONS[tab.id]}
                {tab.label}
              </span>
            );
          }
          return (
            <Link key={tab.id} href={tab.href} style={rowStyle}>
              {TAB_ICONS[tab.id]}
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {projectId && !isR16 && (
        <div style={{ padding: '16px 12px', marginTop: 8, borderTop: '1px solid var(--noc-rule)' }}>
          <p className="noc-label" style={{ padding: '0 12px', marginBottom: 6 }}>More</p>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {SECONDARY_ITEMS.map((item) => (
              <Link
                key={item.tab}
                href={`/story-playground/${projectId}?tab=${item.tab}`}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  fontSize: 13.5,
                  color: 'var(--noc-t5)',
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </aside>
  );
}

export function Shell({
  title,
  subtitle,
  backHref,
  showSaved = true,
  activeTab,
  projectId,
  actionBar,
  children,
}: ShellProps) {
  const router = useRouter();
  const { user } = useUser();
  const isR16 = useR16();
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const canAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  const destinations = globalDestinations(isR16, canAdmin);

  const savedVisible = showSaved && !!user;

  return (
    <div className="noc-shell-viewport">
      {activeTab && <Sidebar activeTab={activeTab} projectId={projectId} />}

      <div className="noc-shell-main lg:ml-64">
        {/* Top bar — sticky app bar on mobile; a slimmer contextual bar on desktop
            (the sidebar already carries persistent nav + brand identity there,
            so this only needs back/title/subtitle/Saved). */}
        <div
          style={{
            padding: '12px 18px 12px',
            borderBottom: '1px solid var(--noc-rule)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 40,
            background: 'var(--noc-bar-alpha)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          {backHref ? (
            <button
              onClick={() => router.push(backHref)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--noc-card)',
                border: '1px solid var(--noc-hairline)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--noc-t1)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : null}
          {/* No brand wordmark in the mobile app bar: the handoff's own
              README is explicit that the reviewer-only chrome around the
              phone preview "are not product UI". At desktop, the sidebar
              above carries the brand mark instead — a persistent app-shell
              identity is a normal desktop pattern, distinct from that. */}

          <div style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <div style={{ fontSize: '15.5px', fontWeight: 600, color: 'var(--noc-t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: '11.5px', color: 'var(--noc-t6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {subtitle}
              </div>
            )}
          </div>

          {savedVisible && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(79,214,232,0.10)',
                borderRadius: '999px',
                padding: '4px 10px',
                flexShrink: 0,
              }}
            >
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--noc-cyan)', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--noc-cyan-tint)', fontWeight: 500 }}>Saved</span>
            </div>
          )}

          {/* Mobile-only trigger for the global-destinations drawer — the
              desktop Sidebar already carries these as an icon row next to
              the brand mark, so this is hidden at lg:. */}
          <button
            type="button"
            onClick={() => setNavDrawerOpen(true)}
            aria-label="More destinations"
            className="lg:hidden"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--noc-card)',
              border: '1px solid var(--noc-hairline)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'var(--noc-t4)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
        </div>

        {/* Scroll region — full available width; each screen decides its
            own inner content/reading/grid width (Section 14: app shell
            width vs content width are separate concerns). */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {children}
        </div>

        {/* Optional action bar — sticky within the content column at every
            breakpoint (full mobile width; content-column width at desktop,
            never full viewport width once a sidebar is present). */}
        {actionBar && (
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid var(--noc-hairline)',
              background: 'var(--noc-bar-alpha)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              flexShrink: 0,
              position: 'sticky',
              bottom: 0,
            }}
          >
            {actionBar}
          </div>
        )}

        {/* Bottom tab bar — mobile only */}
        {activeTab && <BottomTabBar activeTab={activeTab} projectId={projectId} />}
      </div>

      {/* Mobile global-destinations drawer — bottom sheet, triggered by
          the dots button above. Desktop never renders this (the trigger
          itself is lg:hidden, so navDrawerOpen can never become true
          there), matching "Mobile: compact top bar + drawer where
          appropriate" from the app-wide UI reconciliation brief. */}
      {navDrawerOpen && (
        <div
          className="lg:hidden"
          style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={() => setNavDrawerOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
          />
          <div
            style={{
              position: 'relative',
              width: '100%',
              background: 'var(--noc-bar)',
              borderTop: '1px solid var(--noc-hairline)',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: '8px 8px calc(env(safe-area-inset-bottom, 0px) + 12px)',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--noc-hairline)', margin: '8px auto 14px' }} />
            {destinations.map((dest) => (
              <Link
                key={dest.key}
                href={dest.href}
                onClick={() => setNavDrawerOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 14px',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--noc-t2)',
                  textDecoration: 'none',
                }}
              >
                {dest.icon}
                {dest.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
