'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useUser } from '@/lib/auth';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

interface EditState {
  id: string;
  title: string;
  description: string;
  tags: string;
}

/** Three-dot menu that closes when clicking outside */
function VideoMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="absolute top-1 right-1 z-20">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center hover:bg-black/80 transition-colors"
        aria-label="Post options"
      >
        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-8 right-0 w-32 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onEdit(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams();
  const raw = params.username as string;
  const username = raw.startsWith('@') ? raw.slice(1) : raw;

  const { user: currentUser } = useUser();

  // ── Edit / delete state ───────────────────────────────────────────────────
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const profileQuery = trpc.user.getByUsername.useQuery({ username });
  const videosQuery  = trpc.feed.byCreator.useInfiniteQuery(
    { creatorId: profileQuery.data?.id ?? '', limit: 12 },
    { getNextPageParam: (last) => last.nextCursor, enabled: !!profileQuery.data?.id }
  );
  const toggleFollow = trpc.user.toggleFollow.useMutation({
    onSuccess: () => profileQuery.refetch(),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateMeta = trpc.video.updateMetadata.useMutation({
    onSuccess: () => { setEditState(null); videosQuery.refetch(); },
  });
  const deleteVideo = trpc.video.delete.useMutation({
    onSuccess: () => { setDeleteId(null); videosQuery.refetch(); },
  });

  const profile = profileQuery.data;
  const videos  = videosQuery.data?.pages.flatMap((p) => p.videos) ?? [];

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

  const isOwnProfile = !!(currentUser && currentUser.username === profile.username);

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
              {isOwnProfile
                ? <><span>No videos yet. </span><Link href="/upload" className="text-pink-400 hover:underline">Upload your first one</Link></>
                : 'No videos yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {videos.map((v) => (
                <div key={v.id} className="relative aspect-[9/16] bg-gray-900 rounded overflow-hidden group">
                  <Link href={`/v/${v.id}`} className="block w-full h-full">
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

                  {/* Edit / delete menu — own profile only */}
                  {isOwnProfile && (
                    <VideoMenu
                      onEdit={() => setEditState({
                        id:          v.id,
                        title:       v.title,
                        description: (v as any).description ?? '',
                        tags:        ((v as any).tags as string[] ?? []).join(', '),
                      })}
                      onDelete={() => setDeleteId(v.id)}
                    />
                  )}
                </div>
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

      {/* ── Edit modal ───────────────────────────────────────────────────────── */}
      {editState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1525] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-5">Edit post</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Title</label>
                <input
                  type="text"
                  value={editState.title}
                  onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                  maxLength={100}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
                  placeholder="Post title"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Description</label>
                <textarea
                  value={editState.description}
                  onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                  maxLength={500}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                  placeholder="Add a description…"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Tags <span className="text-white/30">(comma-separated)</span></label>
                <input
                  type="text"
                  value={editState.tags}
                  onChange={(e) => setEditState({ ...editState, tags: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
                  placeholder="funny, dance, viral"
                />
              </div>
            </div>

            {updateMeta.error && (
              <p className="mt-3 text-xs text-red-400">{updateMeta.error.message}</p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditState(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/20 text-sm text-white/70 hover:border-white/40 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={updateMeta.isPending || !editState.title.trim()}
                onClick={() => updateMeta.mutate({
                  videoId:     editState.id,
                  title:       editState.title.trim(),
                  description: editState.description.trim() || undefined,
                  tags: editState.tags
                    .split(',')
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean)
                    .slice(0, 20),
                })}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
              >
                {updateMeta.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d1525] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Delete post?</h2>
            <p className="text-sm text-white/50 mb-6">This will permanently delete the post and all its likes, comments and watch history. This cannot be undone.</p>

            {deleteVideo.error && (
              <p className="mb-3 text-xs text-red-400">{deleteVideo.error.message}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/20 text-sm text-white/70 hover:border-white/40 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={deleteVideo.isPending}
                onClick={() => deleteVideo.mutate({ videoId: deleteId })}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
              >
                {deleteVideo.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
