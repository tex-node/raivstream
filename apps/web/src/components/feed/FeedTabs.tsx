'use client';

interface FeedTabsProps {
  activeTab: 'forYou' | 'following' | 'trending' | 'viewersPick';
  onChange: (tab: 'forYou' | 'following' | 'trending' | 'viewersPick') => void;
}

const tabs = [
  { id: 'forYou', label: 'For You' },
  { id: 'following', label: 'Following' },
  { id: 'trending', label: 'Trending' },
  { id: 'viewersPick', label: "Viewer's Pick" },
] as const;

export function FeedTabs({ activeTab, onChange }: FeedTabsProps) {
  return (
    <div className="flex gap-6 justify-center">
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
