'use client';

type Tab = 'forYou' | 'following' | 'trending' | 'viewersPick';

interface FeedTabsProps {
  activeTab: Tab;
  onChange:  (tab: Tab) => void;
  signedIn?: boolean;
}

export function FeedTabs({ activeTab, onChange, signedIn = false }: FeedTabsProps) {
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
              ? 'text-white border-white'
              : 'text-white/50 border-transparent hover:text-white/80'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
