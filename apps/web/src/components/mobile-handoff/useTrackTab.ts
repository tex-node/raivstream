'use client';

import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';

/**
 * Parity fix (canonical activation corrective release, gate 6): the legacy
 * workspace component tracked every tab view via story.trackWorkspaceTab —
 * both a `story_workspace_tab_changed`/`asset_manager_opened` analytics
 * event AND persistence of `StoryProject.lastWorkspaceTab` (read back by
 * the "Continue Your Stories" resume action on /story-playground/new).
 * That tracking still fires for the legacy `?tab=X` access pattern (same
 * component, same effect, untouched) but never did for these dedicated
 * canonical routes, since they're separate page components entirely. This
 * hook restores exact parity for the new primary navigation path.
 */
export function useTrackTab(projectId: string, tab: 'overview' | 'story' | 'characters' | 'scenes' | 'assets') {
  const trackTab = trpc.story.trackWorkspaceTab.useMutation();
  useEffect(() => {
    if (!projectId) return;
    trackTab.mutate({ projectId, tab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tab]);
}
