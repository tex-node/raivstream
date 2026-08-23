# Story Sequence Workspace

Phase 9A adds an editor-facing layer between Story Workspace assets and future movie rendering.

## Purpose

Story Workspace answers what happens. Sequence Workspace answers how the audience experiences it on screen.

The sequence is Raivstream's first edit decision list. It combines:

- order
- selected visual asset
- duration
- shot type
- camera movement and speed
- transition
- optional creative notes

No provider, prompt, FFmpeg, rendering, subtitle, soundtrack, narration, or publishing details belong in this layer.

## Data Ownership

`StorySceneSeed` remains the immutable narrative source. Sequence entries reference story scenes through `storySceneId`; they do not duplicate scene text or mutate the source scene.

`Storybook` remains reader-facing. It uses its own active/latest/fallback image selection.

`Sequence` remains editor-facing. It owns its own selected asset per sequence entry. Changing Sequence does not change Storybook, and changing Storybook does not change Sequence.

`Asset Manager` remains asset-facing. It can mark active, latest, favorite, approved, rejected, and deleted states. Sequence can reference eligible assets but does not redefine those asset lifecycle states.

## Runtime Rule

Runtime is calculated from enabled shots:

```text
runtime = sum(durationSeconds + holdDurationSeconds)
```

Transition durations are planning metadata for future Movie Builder work. They do not add runtime in Phase 9A because most visual transitions overlap adjacent shots. This avoids double-counting dissolves and fades.

Disabled entries remain in the edit decision list but do not contribute to runtime.

## Film Blueprint

The Film Blueprint is the serializable contract for Phase 9B:

```ts
type FilmBlueprint = {
  sequenceId: string;
  version: number;
  runtimeSeconds: number;
  transitionRule: 'overlap_transitions_do_not_add_runtime';
  shots: Array<{
    sequenceSceneId: string;
    storySceneId: string;
    assetId: string | null;
    order: number;
    enabled: boolean;
    durationSeconds: number;
    shotType: string | null;
    cameraMovement: string | null;
    cameraSpeed: string | null;
    cameraSpeedMultiplier: number | null;
    transition: string | null;
    transitionDurationSeconds: number | null;
    holdDurationSeconds: number | null;
    zoom: number | null;
  }>;
};
```

Phase 9B may translate the Film Blueprint into a provider/render plan. Phase 9A deliberately does not.

## Versioning

`SequenceVersion` stores immutable snapshots of sequence metadata, timeline entries, selected assets, duration, shot, camera, transition, and Film Blueprint state.

Normal timeline edits autosave the current sequence. Explicit `Save Version` creates a durable milestone. Restoring a version replaces the current timeline state without deleting historical versions.

## R16

R16 hides Sequence completely:

- no Sequence tab
- no timeline
- no shot/camera/transition controls
- no runtime analytics
- no Film Blueprint
- no version history

R16 remains focused on simple Storybook reading and picture workflows.
