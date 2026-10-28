'use client';

/**
 * Shared publish dialog for the Avatar tab and the Media Library.
 *
 * Both surfaces create a feed `Video` row through different procedures
 * (`generation.publish` for a job, `library.publishAsset` for a story asset), but
 * the metadata the user supplies is identical - so the form is identical, and
 * must not be duplicated.
 */

import { useEffect, useState } from 'react';

export interface PublishValues {
  title: string;
  description?: string;
  isKidsSafe: boolean;
}

export function PublishModal({
  open,
  defaultTitle,
  pending,
  error,
  published,
  onClose,
  onSubmit,
}: {
  open: boolean;
  defaultTitle?: string;
  pending: boolean;
  error?: string | null;
  published?: boolean;
  onClose: () => void;
  onSubmit: (values: PublishValues) => void;
}) {
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [description, setDescription] = useState('');
  const [isKidsSafe, setIsKidsSafe] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? '');
      setDescription('');
      setIsKidsSafe(false);
    }
  }, [open, defaultTitle]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-black text-[var(--noc-t1)]">Publish to Feed</h2>
          <button type="button" onClick={onClose} className="text-xs text-[var(--noc-t5)]">Close</button>
        </div>

        {published ? (
          <div className="mt-4">
            <p className="text-sm text-[#34d399]">Published! It will appear in the feed once approved.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 rounded-lg bg-[rgba(217,70,168,0.9)] px-4 py-2 text-sm font-bold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <label className="mt-4 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Give it a name"
              className="mt-1 w-full rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none"
            />

            <label className="mt-3 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none"
            />

            <label className="mt-3 flex items-center gap-2 text-xs text-[var(--noc-t3)]">
              <input
                type="checkbox"
                checked={isKidsSafe}
                onChange={(e) => setIsKidsSafe(e.target.checked)}
                className="h-4 w-4"
              />
              Kids safe (R16 feed)
            </label>

            {error && <p className="mt-2 text-xs font-semibold text-[var(--noc-magenta)]">{error}</p>}

            <p className="mt-3 text-[10px] text-[var(--noc-t6)]">
              Published videos go to moderation first. They appear in the feed once approved.
            </p>

            <button
              type="button"
              disabled={!title.trim() || pending}
              onClick={() => onSubmit({
                title: title.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                isKidsSafe,
              })}
              className="mt-3 w-full rounded-lg bg-[rgba(217,70,168,0.9)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {pending ? 'Publishing…' : 'Publish'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
