# ADR 0001: Sequence Workspace and Canonical Edit Decision List

## Status

Accepted for Phase 9A.

## Context

Raivstream can already create stories, scenes, characters, images, critic feedback, asset choices, and storybooks. The platform needs a filmmaking layer before investing in Movie Builder and stitching.

Using Storybook order or Asset Manager active-image state as a render plan would couple reader-facing and asset-facing workflows to editor-facing decisions. That would make future video assembly fragile.

## Decision

Create a dedicated Sequence Workspace backed by:

- `StorySequence`
- `StorySequenceScene`
- `SequenceVersion`

`StorySequence` is the canonical edit decision list for a story project. `StorySequenceScene` references `StorySceneSeed` and an optional `StorySceneAsset`. The same story scene may appear multiple times in one sequence because duplicated timeline entries represent duplicated shots, not duplicated story scenes.

`SequenceVersion` stores immutable snapshots and a Film Blueprint payload for Phase 9B.

## Consequences

Positive:

- Story scenes remain the narrative source.
- Storybook remains reader-facing.
- Sequence remains editor-facing.
- Asset choices for Storybook and Sequence stay independent.
- Movie Builder gets a clean Film Blueprint contract.
- R16 remains simple and safe.

Tradeoffs:

- There is additional timeline state to maintain.
- Sequence runtime is a planning value until Movie Builder pricing exists.
- Version restore recreates current timeline entries from snapshots and intentionally leaves historical versions untouched.

## Non-Goals

Phase 9A does not implement Movie Builder, FFmpeg, stitching, image-to-video generation, narration, voice generation, soundtrack generation, subtitles, read-aloud, publishing, marketplace, AI Film Mentor, or Academy expansion.
