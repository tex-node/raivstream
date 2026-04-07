'use client';

import { useParams } from 'next/navigation';
import { useUser } from '@/lib/auth';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

export default function ProfilePage() {
  const params = useParams();
  // Route is /[username] — strip leading @ if present (links use /@username)
  const raw = params.username as string;
  const username = raw.startsWith('@') ? raw.slice(1) : raw;

  const { user: currentUser } = useUser();

  const profileQuery = trpc.user.getByUsername.useQuery({ username });
  const videosQuery = trpc.feed.byCreator.useInfiniteQuery(
    { creatorId: profileQuery.data?.id ?? '', limit: 12 },
    { getNextPageParam: (last) => last.nextCursor, enabled: !!profileQuery.data?.id }
  );
  const toggleFollow = trpc.user.toggleFollow.useMutation({
    onSuccess: () => profileQuery.refetch(),
  });

  const profile = profileQuery.data;
  const videos = videosQuery.data?.pages.flatMap((p) => p.videos) ?? [];

  if (profileQuery.isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <p>User not found.</p>
      </div>
    );
  }

  const isOwnProfile = currentUser && (currentUser.username === profile.username);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto pt-20 px-4 pb-16">

        {/* Profile header */}
        <div className="flex flex-col items-center text-center py-8 gap-4">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/20">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-pink-500 flex items-center justify-center text-4xl font-bold">
                {profile.displayName[0]}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 justify-center">
              <h1 className="text-xl font-bold">{profile.displayName}</h1>
              {profile.verified && (
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              )}
            </div>
            <p className="text-white/50 text-sm">@{profile.username}</p>
          </div>

          {profile.bio && <p className="text-white/80 text-sm max-w-xs">{profile.bio}</p>}

          <div className="flex gap-8">
            <div className="text-center">
              <p className="font-bold text-lg">{profile.followerCount.toLocaleString()}</p>
              <p className="text-white/50 text-xs">Followers</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">{profile.followingCount.toLocaleString()}</p>
              <p className="text-white/50 text-xs">Following</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">{profile.totalViews.toLocaleString()}</p>
              <p className="text-white/50 text-xs">Views</p>
            </div>
          </div>

          {profile.badges.length > 0 && (
            <div className="flex gap-2 flex-wrap justify-center">
              {profile.badges.map((ub: { badge: { id: string; name: string; description: string; iconUrl: string | null } }) => (
                <div key={ub.badge.id} title={ub.badge.description}
                  className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                  {ub.badge.iconUrl && <img src={ub.badge.iconUrl} alt="" className="w-4 h-4" />}
                  <span className="text-xs text-white/80">{ub.badge.name}</span>
                </div>
              ))}
            </div>
          )}

          {isOwnProfile ? (
            <Link href="/settings"
              className="px-8 py-2 rounded-full border border-white/30 hover:border-white/60 font-semibold text-sm transition-colors">
              Edit profile
            </Link>
          ) : (
            <button
              onClick={() => toggleFollow.mutate({ targetUserId: profile.id })}
              disabled={toggleFollow.isPending}
              className={`px-8 py-2 rounded-full font-semibold text-sm transition-colors ${
                profile.isFollowing
                  ? 'border border-white/30 hover:border-white/60 text-white'
                  : 'bg-pink-500 hover:bg-pink-600 text-white'
              }`}>
              {profile.isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {/* Video grid */}
        <div className="mt-2">
          <h2 className="text-xs font-semibold text-white/40 mb-4 uppercase tracking-wider">
            Videos · {videos.length}
          </h2>
          {videos.length === 0 ? (
            <div className="text-center py-16 text-white/30 text-sm">
              {isOwnProfile ? (
                <>No videos yet. <Link href="/upload" className="text-pink-400 hover:underline">Upload your first one</Link></>
              ) : 'No videos yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {videos.map((v) => (
                <Link key={v.id} href={`/v/${v.id}`}
                  className="relative aspect-[9/16] bg-gray-900 rounded overflow-hidden group">
                  <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div className="absolute bottom-1 left-1 flex items-center gap-1">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span className="text-white text-xs">{v.viewCount.toLocaleString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {videosQuery.hasNextPage && (
            <button onClick={() => videosQuery.fetchNextPage()} disabled={videosQuery.isFetchingNextPage}
              className="w-full mt-6 py-3 rounded-xl border border-white/20 hover:border-white/40 text-sm text-white/60 transition-colors">
              {videosQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
