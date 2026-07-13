import type { PrismaClient } from '@raivstream/database';

export const STORY_ANALYTICS_EVENTS = [
  'story_playground_opened',
  'story_spark_started',
  'story_questions_generated',
  'story_questions_completed',
  'story_generated',
  'story_saved',
  'story_continued',
  'scene_generation_started',
  'scene_generation_completed',
  'scene_generation_failed',
  'scene_image_started',
  'scene_image_completed',
  'scene_image_failed',
  'scene_image_regenerated',
  'visual_style_selected',
  'prompt_enhancement_started',
  'prompt_enhancement_completed',
  'prompt_enhancement_failed',
  'generation_started_with_enhanced_prompt',
  'director_setting_changed',
  'prompt_quality_feedback',
  'regeneration_after_director_change',
  'character_bible_generated',
  'character_bible_edited',
  'character_created',
  'character_updated',
  'personality_changed',
  'relationship_changed',
  'character_evolved',
  'character_used_in_generation',
  'storybook_opened',
  'storybook_started',
  'storybook_completed',
  'storybook_page_viewed',
  'storybook_exit',
  'narration_started',
  'narration_paused',
  'narration_resumed',
  'narration_page_completed',
  'narration_completed',
  'narration_unavailable',
  'story_feedback_submitted',
] as const;

export type StoryAnalyticsEventName = (typeof STORY_ANALYTICS_EVENTS)[number];

export type AnalyticsTrackInput = {
  event: StoryAnalyticsEventName | string;
  userId?: string | null;
  projectId?: string | null;
  properties?: Record<string, unknown>;
};

function sanitiseProperties(properties?: Record<string, unknown>) {
  if (!properties) return undefined;
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );
}

export async function trackAnalyticsEvent(prisma: PrismaClient, input: AnalyticsTrackInput) {
  try {
    const eventName = input.event.trim().slice(0, 120);
    if (!eventName) return null;

    return await (prisma as any).analyticsEvent.create({
      data: {
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
        eventName,
        properties: sanitiseProperties(input.properties) ?? {},
      },
    });
  } catch (error) {
    console.warn('[analytics] failed to track event', input.event, error);
    return null;
  }
}

export const analytics = {
  track: trackAnalyticsEvent,
};
