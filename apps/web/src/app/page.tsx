'use client';

import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { VideoFeed } from '@/components/feed/VideoFeed';
import { useUser } from '@/lib/auth';
import Link from 'next/link';

type FeedType = 'forYou' | 'following' | 'trending' | 'viewersPick';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedType>('forYou');
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="h-screen bg-black flex flex-col overflow-hidden">
      {/* Floating header — transparent, overlays the feed */}
      <div className="absolute top-0 left-0 right-0 z-50 flex flex-col items-center pt-3 pb-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
        <div className="pointer-events-auto w-full">
          <Navbar />
        </div>
        <div className="pointer-events-auto mt-10">
          <FeedTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            signedIn={isSignedIn}
          />
        </div>
      </div>

      {/* Full-screen TikTok feed — visible to everyone */}
      <VideoFeed feedType={activeTab} />

      {/* Signed-out join CTA — floating at bottom */}
      {!isSignedIn && (
        <div
          className="absolute bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-10 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}
        >
          <div className="pointer-events-auto max-w-sm mx-auto text-center">
            <p className="text-white font-semibold text-base mb-3">
              Join free to watch unlimited videos
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/sign-up"
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
              >
                Sign up free
              </Link>
              <Link
                href="/sign-in"
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white/70 border"
                style={{ borderColor: 'rgba(255,255,255,0.20)' }}
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
