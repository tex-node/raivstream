'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';

export type ShellTab = 'home' | 'story' | 'characters' | 'scenes' | 'assets';

interface ShellProps {
  title: string;
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

function TabBar({ activeTab, projectId }: { activeTab: ShellTab; projectId?: string }) {
  const tabs: { id: ShellTab; label: string; href: string }[] = [
    { id: 'home',       label: 'Home',       href: '/story-playground' },
    { id: 'story',      label: 'Story',      href: projectId ? `/story-playground/${projectId}?tab=story`      : '#' },
    { id: 'characters', label: 'Cast',       href: projectId ? `/story-playground/${projectId}?tab=characters` : '#' },
    { id: 'scenes',     label: 'Scenes',     href: projectId ? `/story-playground/${projectId}?tab=scenes`     : '#' },
    { id: 'assets',     label: 'Assets',     href: projectId ? `/story-playground/${projectId}?tab=assets`     : '#' },
  ];

  return (
    <nav className="noc-tab-bar">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            style={{
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
            }}
          >
            {TAB_ICONS[tab.id]}
            <span style={{ fontSize: '10.5px', fontWeight: 500 }}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        background: 'var(--noc-page)',
        maxWidth: '440px',
        margin: '0 auto',
        position: 'relative',
      }}
    >
      {/* App bar */}
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
        ) : (
          <Link
            href="/story-playground"
            style={{
              fontWeight: 700,
              fontSize: '15px',
              color: 'var(--noc-t1)',
              textDecoration: 'none',
              letterSpacing: '-0.01em',
              flexShrink: 0,
            }}
          >
            Raiv<span style={{ color: 'var(--noc-purple)' }}>stream</span>
          </Link>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {backHref && (
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

      {/* Scroll region */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {children}
      </div>

      {/* Optional action bar */}
      {actionBar && (
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--noc-hairline)',
            background: 'var(--noc-bar-alpha)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            flexShrink: 0,
          }}
        >
          {actionBar}
        </div>
      )}

      {/* Bottom tab bar */}
      {activeTab && (
        <TabBar activeTab={activeTab} projectId={projectId} />
      )}
    </div>
  );
}
