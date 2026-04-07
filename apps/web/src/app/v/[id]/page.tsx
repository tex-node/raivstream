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
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
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
    <div className="h-screen bg-black flex flex-col">
      <Navbar />
      <div className="flex-1 relative mt-14">
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
  );
}
