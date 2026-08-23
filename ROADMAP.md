# Raivstream Roadmap

## Current Story Playground Baseline

Production has the Alpha creative loop:

- Story Spark
- Guided questions
- Story generation and continuation
- Story Workspace
- Story DNA
- Character Director
- Scene Director
- Creative Specification
- Prompt Compiler
- Image generation
- Creative Critic
- Asset Manager
- Storybook Viewer
- Analytics and admin insights

Phase 8B Creative Critic is production-complete. Phase 8B.2 staging qualification verified RunPod/R2/OpenAI critic behavior, retry idempotency, credit policy, R16 hiding, and Storybook exclusion of creatively rejected assets.

## Phase 9A: Sequence Workspace and Timeline Editor

Status: PRODUCTION COMPLETE.

Phase 9A introduces a filmmaking workspace:

- Story Workspace `Sequence` tab for non-R16 creators
- Canonical edit decision list via `StorySequence`
- Timeline entries via `StorySequenceScene`
- Immutable milestones via `SequenceVersion`
- Film Blueprint serialization for Phase 9B
- Runtime, active shot count, average shot length, shot planning, camera planning, transition planning, selected visual asset, notes, and timed still-image animatic preview
- Admin sequence insights at `/admin/sequence`

Explicitly out of scope:

- Movie Builder
- FFmpeg rendering
- Movie stitching
- Image-to-video generation
- Narration, voice, soundtrack, subtitles, read-aloud
- Publishing and marketplace
- AI Film Mentor
- Academy expansion

## Next Candidate Phases

1. Phase 9B Movie Builder design and render-pricing contract.
2. Phase 9C controlled scene video generation from approved sequence entries.
3. Phase 9D server-side movie assembly after source clips prove stable.
