'use client';

import { HomeScreen } from '@/components/mobile-handoff/HomeScreen';

/**
 * Canonical Home / project list. Previously this route rendered the
 * creation wizard directly; that wizard now lives at /story-playground/new
 * (byte-identical move, unchanged) and is linked from this screen's
 * "Start something" cards. See docs/operations/mobile-ui-handoff-reconciliation.md.
 */
export default function StoryPlaygroundHomePage() {
  return <HomeScreen />;
}
