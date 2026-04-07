'use client';

import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { VideoFeed } from '@/components/feed/VideoFeed';

type FeedType = 'forYou' | 'following' | 'trending' | 'viewersPick';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedType>('forYou');

  return (
    <main className="h-screen bg-black flex flex-col overflow-hidden">
      {/* Fixed top bar */}
      <div className="absolute top-0 left-0 right-0 z-50 flex flex-col items-center gap-2 pt-3 pb-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <div className="pointer-events-auto w-full">
          <Navbar />
        </div>
        <div className="pointer-events-auto mt-10">
          <FeedTabs activeTab={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      {/* The scrollable feed */}
      <VideoFeed feedType={activeTab} />
    </main>
  );
}
