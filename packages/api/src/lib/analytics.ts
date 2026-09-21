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
  'story_workspace_opened',
  'story_workspace_tab_changed',
  'asset_manager_opened',
  'asset_set_active',
  'asset_favorited',
  'asset_compared',
  'asset_removed',
  'creative_critic_started',
  'creative_critic_completed',
  'creative_critic_failed',
  'creative_critic_skipped',
  'creative_critic_unavailable',
  'creative_score_generated',
  'creative_improvement_plan_created',
  'creative_retry_started',
  'creative_retry_completed',
  'creative_retry_failed',
  'creative_retry_improved_score',
  'asset_creatively_approved',
  'asset_creatively_rejected',
  'critic_feedback_received',
  'critic_human_disagreement',
  'sequence_created',
  'sequence_opened',
  'sequence_scene_reordered',
  'sequence_scene_duplicated',
  'sequence_scene_disabled',
  'sequence_scene_removed',
  'sequence_asset_selected',
  'sequence_duration_changed',
  'sequence_shot_changed',
  'sequence_camera_changed',
  'sequence_transition_changed',
  'sequence_preview_started',
  'sequence_preview_completed',
  'sequence_version_created',
  'sequence_version_restored',
  'movie_builder_opened',
  'movie_render_started',
  'movie_render_reused',
  'movie_render_retried',
  'movie_render_completed',
  'movie_render_failed',
  'storybook_image_selection_changed',
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
  // Phase 9B.2 — Audio & Performance layer
  'audio_workspace_opened',
  'audio_plan_created',
  'audio_cue_added',
  'audio_cue_updated',
  'audio_cue_removed',
  'audio_track_toggled',
  'voice_profile_created',
  // Phase 16.4 — scene narration
  'scene_narration_generated',
  // Phase 16.5 — production manifest
  'production_manifest_persisted',
  // Story editing
  'story_edited',
  'story_paragraph_rewritten',
  'voice_profile_updated',
  'audio_version_saved',
  'audio_version_restored',
  'audio_preview_started',
  'audio_preview_completed',
  'movie_render_with_audio_requested',
  'movie_render_with_audio_completed',
  'movie_render_with_audio_failed',
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
