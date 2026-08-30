'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const tabs = primaryNavItems(projectId);

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-64 lg:shrink-0"
      style={{ borderRight: '1px solid var(--noc-hairline)', background: 'var(--noc-bar)' }}
    >
      <div style={{ padding: '20px 22px 16px' }}>
        <Link href="/story-playground" style={{ fontWeight: 700, fontSize: 17, color: 'var(--noc-t1)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
          Raiv<span style={{ color: 'var(--noc-purple)' }}>stream</span>
        </Link>
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
    </div>
  );
}
