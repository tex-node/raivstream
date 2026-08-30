'use client';

import { useR16 } from '@/lib/r16';

type Tab = 'forYou' | 'following' | 'trending' | 'viewersPick';

interface FeedTabsProps {
  activeTab: Tab;
  onChange:  (tab: Tab) => void;
  signedIn?: boolean;
}

export function FeedTabs({ activeTab, onChange, signedIn = false }: FeedTabsProps) {
  const isR16 = useR16();

  // R16 mode: only show the kids-safe "For You" tab
  if (isR16) {
    return (
      <div className="flex gap-5 justify-center">
        <span
          className="text-sm font-semibold pb-1 border-b-2"
          style={{ color: 'var(--noc-cyan)', borderColor: 'var(--noc-cyan)' }}
        >
          Kids Feed
        </span>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'forYou',      label: 'For You'       },
    { id: 'trending',    label: 'Trending'       },
    { id: 'viewersPick', label: "Viewer's Pick"  },
    ...(signedIn ? [{ id: 'following' as Tab, label: 'Following' }] : []),
  ];

  return (
    <div className="flex gap-5 justify-center">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`text-sm font-semibold pb-1 transition-all border-b-2 ${
            activeTab === tab.id
              ? 'text-[#F7F8FC] border-[#F7F8FC]'
              : 'text-[#9397ab] border-transparent hover:text-[#cfd3e5]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
