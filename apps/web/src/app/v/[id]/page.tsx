'use client';

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { VideoCard } from '@/components/video/VideoCard';
import { Navbar } from '@/components/layout/Navbar';

export default function VideoPage() {
  const { id } = useParams() as { id: string };

  const { data, isLoading } = trpc.video.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="h-screen bg-[var(--noc-page)] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[var(--noc-hairline)] border-t-[var(--noc-t1)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-screen bg-black flex items-center justify-center text-white">
        <p>Video not found.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black lg:bg-[var(--noc-page)] flex flex-col">
      <Navbar />
      {/*
        Same desktop-stage pattern as the root feed (Phase 3A) — below `lg`
        this is a plain flex passthrough (VideoCard fills the box exactly
        as it did before), so mobile is unaffected. At `lg` and up it
        becomes a framed, centered video card instead of full-bleed.
        VideoCard itself is untouched.
      */}
      <div className="flex-1 relative mt-14 flex lg:justify-center lg:py-6 lg:px-6">
        <div className="relative flex-1 flex lg:flex-none lg:w-full lg:max-w-[480px] xl:max-w-[520px] 2xl:max-w-[580px] lg:h-full lg:rounded-[28px] lg:overflow-hidden lg:border lg:border-[var(--noc-hairline)] lg:shadow-2xl">
          <VideoCard
            video={{
              ...data,
              creator: data.creator as {
                id: string;
                username: string;
                displayName: string;
                avatarUrl: string | null;
                verified: boolean;
              },
            }}
            isActive
          />
        </div>
      </div>
    </div>
  );
}
