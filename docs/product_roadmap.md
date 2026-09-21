# Raivstream Project Roadmap

**Project:** Raivstream Gen-AI Storytelling and Media Creation Platform
**Current date:** September 2026
**Document status:** Strategic roadmap and execution framework
**Purpose:** To document the journey completed so far, establish the current product and engineering position, and define the work required to reach a scalable, production-ready, multi-provider creative platform.

> **Maintenance note:** This file is the canonical product roadmap. Status markers are updated inline as phases progress. The engineering/architecture details live in `docs/architecture.md`; the session record lives in `SESSION.md`.

---

## 1. Executive Summary

Raivstream has evolved from an initial generative-AI storytelling concept into a functioning platform with:

* A guided story creation experience
* Scene-based story development
* Character consistency through a Character Bible
* AI-generated scene images
* Storybook viewing
* Read-aloud experiences
* Video generation and regeneration workflows
* Local media processing and FFmpeg stitching
* Analytics and feedback tooling
* Separate R16/Kids Mode safety boundaries
* Production deployments and health checks
* Provider-specific media-generation infrastructure
* Operational safeguards around failed media-provider transactions and refunds

The project is now entering a new stage: **moving from a working AI storytelling application into a dependable, extensible, multi-provider creative production platform**.

The next major evolution is not simply adding more models. It is establishing a durable platform architecture that can safely support:

1. Multiple image and video providers
2. Long-running asynchronous generation jobs
3. Provider failover and capability routing
4. Cost and quota controls
5. Asset versioning and regeneration
6. Story-to-video production pipelines
7. Production observability
8. Safe billing, refund, and credit operations
9. Commercial product packaging
10. Scalable user and content growth

The planned provider expansion includes:

* **Flux.2** for image generation and editing
* **MiniMax** for video generation and animation workflows
* **VEED Fabric** for video creation, editing, or finishing workflows

These integrations should be delivered through a shared provider abstraction rather than as isolated one-off implementations.

---

# 2. Product Vision

Raivstream is intended to become a creative platform where users can transform ideas into structured visual stories and media experiences.

The long-term product journey is:

> **Idea → Story → Scenes → Characters → Images → Motion → Video → Voice → Edited Experience → Shareable Media**

The platform should support both:

* **Guided creation**, where the user answers structured questions and the system helps form the story
* **Creative production**, where users can regenerate scenes, preserve character consistency, animate content, assemble videos, and manage versions

The platform must balance:

* Creative freedom
* Simplicity
* Child safety
* Production reliability
* Cost control
* Provider flexibility
* Operational transparency
* Commercial scalability

---

# 3. Roadmap Status Legend

Each roadmap item should be interpreted using the following status categories:

* **[COMPLETED]** — Implemented and validated
* **[PARTIALLY COMPLETED]** — Some capabilities exist, but the full target is not complete
* **[IN PROGRESS]** — Currently being designed or implemented
* **[NEXT]** — Recommended immediate priority
* **[PLANNED]** — Intended future work
* **[REQUIRES DECISION]** — Cannot proceed without product, commercial, or operational approval
* **[REQUIRES INSPECTION]** — Current state must be verified before implementation
* **[DEFERRED]** — Deliberately postponed until prerequisites are complete

---

# 4. Journey Thus Far

## 4.1 Initial Platform Foundation

### Objective

Establish the technical foundation for a generative-AI application capable of creating and managing stories, scenes, media assets, and user experiences.

### Work completed

* Established the Raivstream application structure
* Built the web application and supporting API infrastructure
* Established database-backed project and content management
* Created the initial story creation experience
* Established production and staging environments
* Added health-check endpoints
* Established deployment and operational workflows

### Outcome

Raivstream moved from a concept into a functioning application foundation capable of supporting iterative product development.

**Status:** [COMPLETED]

---

## 4.2 Phase 1 — Story Playground

### Objective

Help users develop a story through guided questions rather than requiring them to write a complete script or prompt.

### Capabilities introduced

* Guided story questions
* Structured story inputs
* Story premise development
* User-friendly creative onboarding
* A controlled experience suitable for younger users

### Product significance

This phase established Raivstream's central philosophy:

> The platform should help users create, not require them to understand AI prompting.

**Status:** [COMPLETED]

---

## 4.3 Phase 2 — Scene Cards

### Objective

Convert a story concept into a sequence of manageable scenes.

### Capabilities introduced

* Scene-by-scene story structure
* Scene descriptions
* Ordered story progression
* A visual planning layer between story creation and media generation
* The ability to treat each scene as an independent production unit

### Product significance

Scene Cards became the foundation for:

* Image generation
* Character continuity
* Video generation
* Storyboard review
* Regeneration
* Storybook presentation
* Future timeline and editing workflows

**Status:** [COMPLETED]

---

## 4.4 Phase 3 — Character Bible

### Objective

Improve character consistency across scenes and media generations.

### Capabilities introduced

* Character definitions
* Character descriptions
* Persistent character references
* Shared character information across scenes
* A foundation for consistent visual identity

### Product significance

The Character Bible is strategically important because generative media quality depends heavily on consistency.

It should eventually support:

* Character reference images
* Appearance locking
* Clothing and accessory continuity
* Age and role consistency
* Character-to-scene relationships
* Provider-specific reference-image mapping
* Versioned character updates

**Status:** [COMPLETED — with future expansion required]

---

## 4.5 Phase 4B — Scene Image Generation

### Objective

Generate visual assets for individual story scenes.

### Capabilities introduced

* Scene image generation
* Image-generation workflow integration
* Asset persistence
* Regeneration support
* Image history and versioning
* Flux-based generation pathway
* R2-backed asset history and storage

### Important engineering outcomes

* Image generation became an asynchronous production workflow
* Generated assets were treated as persistent project resources
* Regeneration was separated from the original generation
* Asset history was introduced to reduce destructive overwrites
* The system established the beginning of a provider-aware media architecture

### Product significance

This phase transformed Raivstream from a text storytelling tool into a visual storytelling platform.

**Status:** [COMPLETED]

---

## 4.6 Phase 4C — Storybook Viewer

### Objective

Present the generated story as a coherent visual reading experience.

### Capabilities introduced

* Storybook-style scene navigation
* Visual story presentation
* Scene progression
* Integration of generated images with story content
* A user-facing consumption experience

### Product significance

The Storybook Viewer established that Raivstream is not only a generation tool. It is also a media-consumption product.

Future extensions may include:

* Page-turning experiences
* Narration synchronization
* Character voice support
* Reading progress
* Sharing
* Export
* Classroom or family modes
* Personalized story libraries

**Status:** [COMPLETED]

---

## 4.7 Phase 4.5 — Analytics and Feedback

### Objective

Measure how users interact with stories and generated media.

### Capabilities introduced

* Story analytics
* Feedback collection
* Administrative analytics interface
* Visibility into content-generation behavior
* A foundation for product improvement

### Strategic importance

Analytics are required to answer:

* Which stories are completed?
* Where do users abandon the flow?
* Which scenes are regenerated most often?
* Which providers produce the best results?
* Which generation failures affect users?
* Which features create repeat usage?
* Which content is suitable for expansion into video?

**Status:** [COMPLETED]

### Future expansion required

* Provider-level quality metrics
* Generation success rate
* Median generation latency
* Cost per successful asset
* Regeneration rate
* User satisfaction by provider
* Credit consumption
* Refund frequency
* Story completion rate
* Video conversion rate
* Retention and repeat creation

**Status:** [PLANNED]

---

## 4.8 Phase 5A — Read-Aloud Storybooks and Video Workflows

### Objective

Move beyond static storybooks into narrated and animated experiences.

### Capabilities introduced

* Read-aloud storybooks
* Local media processing
* Video generation and regeneration
* FFmpeg-based stitching
* Multi-scene media assembly
* A foundation for turning scene assets into a continuous video

### Product significance

This phase established the first version of the broader production pipeline:

> Story → Scene Images → Narration/Media → Video Assembly

### Current limitation

The existing workflow should not be assumed to be a complete production-grade video editor or provider-agnostic video pipeline. It is a foundation that must be strengthened before large-scale multi-provider integration.

**Status:** [COMPLETED — foundational capability]

---

## 4.9 R16 / Kids Mode Safety

### Objective

Create a safe, age-appropriate experience for users between approximately 6 and 16 years old.

### Capabilities and safeguards

* R16-specific experience
* Prompt and generation-history concealment
* Guided rather than unrestricted prompting
* Safety-conscious interaction design
* Separation of advanced generation details from younger users
* Dedicated R16 production endpoint and health check

### Production safety significance

Kids Mode must remain a first-class product boundary, not merely a visual theme.

Future requirements include:

* Age-appropriate content policies
* Parent or guardian controls where applicable
* Moderation before generation
* Moderation after generation
* Safe error messages
* Restricted provider capabilities
* Protection from unsafe prompt exposure
* Auditability of content-generation decisions
* Clear data-retention policies

**Status:** [COMPLETED — ongoing hardening required]

---

## 4.10 Production Deployment and Reliability

### Objective

Deploy Raivstream into a stable production environment while maintaining a separate staging environment for validation.

### Verified achievements

* Production health checks established
* Staging health checks established
* Production environment issues resolved
* Direct database connectivity configured where required
* DNS and A-record issues resolved
* Production application remained operational during subsequent staging work
* Staging and production boundaries were preserved

### Operational principle established

> Staging experimentation must not mutate production data, production credentials, production processes, or production behavior.

**Status:** [COMPLETED — continuous operational discipline required]

---

# 5. Current Platform Position

Raivstream currently has the foundation of a complete creative workflow, but the platform is not yet at the final multi-provider production stage.

## Current strengths

* Guided story creation
* Structured scene model
* Character continuity foundation
* Image-generation workflow
* Storybook consumption experience
* Read-aloud capability
* Video-generation foundation
* Persistent asset history
* Production and staging environments
* Analytics foundation
* R16 safety boundary
* Operational runbooks
* Provider transaction monitoring groundwork
* Provider-neutral media layer + capability registry (Phase 6 foundation)

## Current gaps

* Production-ready multi-provider routing
* Durable generation-job orchestration at scale
* Standardized webhook and polling reconciliation
* Provider failover strategy
* Comprehensive cost and quota controls
* Production-grade notification delivery
* Durable refund-alert cooldown state
* Full operational dashboarding
* Automated media-quality evaluation
* Robust video editing and timeline composition
* Commercial packaging and plan enforcement
* Formal provider-by-provider launch criteria
* Explicit production approval for new providers

---

# 6. Provider Integration Strategy

## 6.1 Guiding Principle

Flux.2, MiniMax, and VEED Fabric should not be integrated as unrelated features.

They should be connected through a shared provider architecture with consistent internal contracts.

The platform should normalize:

* Provider selection
* Capability discovery
* Request validation
* Job creation
* Job status
* Progress
* Output retrieval
* Error classification
* Retry behavior
* Cancellation
* Cost tracking
* Credit reservation
* Refund handling
* Asset persistence
* Audit logging

The provider-specific implementation should remain behind an adapter boundary.

## 6.2 Recommended Integration Order

### First: Flux.2

Flux.2 should be integrated first because image generation and editing are foundational to the current Raivstream story pipeline.

Potential uses:

* Scene image generation
* Character reference image generation
* Image editing
* Scene regeneration
* Style variation
* Image-to-image refinement
* Consistency improvement

**Target stage:** [NEXT / FIRST PROVIDER INTEGRATION MILESTONE]

**Current status:** Adapter + contract + wiring complete (AI Studio + Story scene image). Blocked on live validation (fal account access).

---

### Second: MiniMax

MiniMax should follow once the shared asynchronous media-job infrastructure is stable.

Potential uses:

* Image-to-video scene animation
* Text-to-video experiments
* Character or environment motion
* Short scene clips
* Motion variants
* Video regeneration

MiniMax integration should include:

* Long-running job handling
* Polling or webhook reconciliation
* Timeout management
* Output validation
* Cost tracking
* Retry and failure classification
* Video-duration and resolution controls

**Target stage:** [PLANNED / SECOND PROVIDER INTEGRATION MILESTONE]

**Current status:** H3-Max adapter + polling + job-ID mapping complete (AI Studio). Not yet wired into the story/film video pipeline.

---

### Third: VEED Fabric

VEED Fabric should be integrated after the video pipeline requirements are clearly defined.

Potential uses may include:

* Video generation
* Video editing
* Scene assembly
* Captioning
* Timeline composition
* Audio and visual finishing
* Export-oriented workflows

The exact role of VEED Fabric must be confirmed through API and capability inspection before implementation.

Questions requiring confirmation:

* Is Fabric being used for generation, editing, or both?
* Does it accept scene images, scripts, audio, or structured timelines?
* Does it support asynchronous jobs?
* What output formats and durations are supported?
* What are the relevant cost and quota constraints?
* Can it replace or complement FFmpeg-based assembly?
* Does it provide reliable webhooks or require polling?

**Target stage:** [PLANNED / THIRD PROVIDER INTEGRATION MILESTONE]

**Current status:** Backend adapter only (`falVeed.ts`); no audio-input UI, and UGC consent/ownership/moderation controls not yet implemented.

---

# 7. Future Platform Architecture

## 7.1 Unified Media Provider Layer

### Objective

Create a single internal interface for all image, video, audio, and editing providers.

### Proposed capabilities

* Provider registry
* Provider capability metadata
* Model selection
* Input normalization
* Output normalization
* Provider health state
* Provider-specific error mapping
* Cost metadata
* Feature flags
* Environment restrictions
* Fallback routing

### Example conceptual capabilities

* `IMAGE_GENERATION`
* `IMAGE_EDITING`
* `IMAGE_TO_VIDEO`
* `TEXT_TO_VIDEO`
* `TEXT_TO_SPEECH`
* `VIDEO_ASSEMBLY`
* `CAPTIONING`
* `AUDIO_MIXING`

**Status:** [IN PROGRESS]

> Foundation shipped in `packages/api/src/lib/mediaProviders/` (types, config, mock, fal adapter, webhook verification, output validation, refund outbox). Capability registry + health snapshot (`registry.ts`) and admin health endpoint (`providers.health`) added in Phase 6. Remaining: extend the registry to a full capability model (TTS/audio/editing), and route the legacy adapters through the same health/availability surface.

---

## 7.2 Unified Generation Job Model

### Objective

Standardize all asynchronous generation operations.

### Proposed job lifecycle

1. Requested
2. Validating
3. Queued
4. Submitted to provider
5. Processing
6. Output available
7. Persisting asset
8. Completed
9. Failed
10. Cancelled
11. Refunded or credit-reconciled where applicable

### Required job fields

* Internal job ID
* User/project/scene relationship
* Provider
* Model
* Capability
* Input reference
* Output reference
* Status
* Progress
* Retry count
* Provider job ID
* Error category
* Cost estimate
* Actual cost
* Credit reservation
* Created and updated timestamps
* Completion timestamp
* Audit metadata

**Status:** [PARTIALLY COMPLETED]

> The DB `GenerationJob` model + `GenerationStatus` enum and the media layer's `MediaJobStatus` exist. **§7.2 increment:** added a canonical `generators/jobModel.ts` (`GenerationJobState` incl. `cancelled`, `GenerationJobError`), migrated all provider adapters (RunPod/xAI/Kling/Gemini/fal) to return the unified status+error shape, wired `cancelled` through `generation.pollStatus` (`CANCELLED`) and `story.waitForGenerationOutput`, and added `normaliseRunpodError`. Remaining: literal `MediaProvider` interface conformance on the submit side (capability routing) for legacy adapters.

---

## 7.3 Asset and Version Management

### Objective

Ensure that generated content is never destructively overwritten and can be traced to its origin.

### Proposed capabilities

* Asset version history
* Provider and model metadata
* Prompt/input provenance stored securely
* Scene and character relationships
* Regeneration lineage
* Preview and final asset distinction
* Asset moderation status
* Storage lifecycle management
* Soft deletion and restoration
* Export history

### Important principle

A regenerated image or video should create a new version, not silently replace the previous version.

**Status:** [PARTIALLY COMPLETED / PLANNED EXPANSION]

---

## 7.4 Provider Routing and Failover

### Objective

Select the most appropriate provider based on capability, quality, cost, availability, and user entitlement.

### Routing factors

* Requested capability
* User plan
* Region
* Provider availability
* Queue depth
* Cost ceiling
* Quality preference
* Resolution and duration
* Safety restrictions
* Provider-specific quotas
* Historical success rate

### Routing modes

* Explicit provider selection
* Default provider
* Automatic best-fit routing
* Fallback provider
* Admin-only experimental provider
* Kids Mode restricted provider set

**Status:** [PLANNED]

---

## 7.5 Cost, Credits, and Quotas

### Objective

Make media generation financially controllable.

### Required capabilities

* Pre-generation cost estimation
* Credit reservation
* Actual-cost reconciliation
* Failed-job handling
* Refund eligibility classification
* Per-user limits
* Per-project limits
* Per-provider limits
* Daily and monthly quotas
* Admin override
* Cost dashboards
* Abuse detection

### Safety principle

Monitoring, refund recommendation, and refund execution must remain separate authorities.

No provider integration should gain automatic refund or credit-mutation authority merely by being connected to the media pipeline.

**Status:** [IN PROGRESS / REQUIRES APPROVAL FOR PRODUCTION AUTOMATION]

> **§7.5 increment:** added a flag-guarded (`CREDIT_RESERVE_SETTLE_ENABLED`, default off) reserve → settle → release lifecycle: `CreditReservation` model + migration, `reserveCredits`/`settleCredits`/`releaseCredits` in `lib/credits.ts` (atomic + idempotent + crash-safe), wired into `generation.create` (reserve on submit, release on failure, settle on synchronous completion) and `generation.pollStatus` (settle on completion). With the flag off, the existing deduct-before-submit + refund path is unchanged. Remaining before activation: real provider cost capture (`MediaUsage.costUsd`) → credit settlement, USD/₦ exchange policy, and reconciliation for stuck HELD reservations.

---

# 8. FAL Refund Monitoring and Operational Safety

## 8.1 Work Completed

The FAL refund monitoring alerting slice was committed locally:

* **Commit:** `988a5ad7bb7a199cb8956880a22eb1ac0148de56`
* **Message:** `feat: add FAL refund monitoring alerts and dry-run command`

Validated results:

* Full API tests: 356/356
* Focused monitor and alert tests: 21/21
* Typecheck and lint: clean
* Exactly the intended files committed
* No production deployment
* No scheduler activation
* No external notification sink
* No unattended recovery

### Current behavior

* Read-only monitoring
* Severity classification
* Staging-only environment guard
* Dry-run alert sink
* No real notification delivery
* No refund execution
* No credit mutation
* No unattended recovery

**Status:** [COMPLETED — staging-only monitoring slice]

---

## 8.2 Production Design Document

The production design document was committed separately:

* **Commit:** `4820842bf58b12f84921b817b5928036b994f586`
* **Message:** `docs(alerts): add FAL refund monitoring production design`

The document covers:

* Scheduling
* Durable alert state
* Notification delivery
* Secret management
* Alert fatigue
* Production safety
* Operational readiness
* Testing
* Approval requirements

### Key proposed direction

* systemd timer or equivalent controlled scheduler
* Durable Postgres cooldown and delivery state
* Read-only database access
* Resend email as a possible primary channel
* Optional Slack or Teams integration
* Secret files or managed secret storage
* Rate limits and escalation
* Staging rehearsal
* Production canary
* Emergency disablement

**Status:** [COMPLETED — design and approval preparation]

---

## 8.3 Remaining Approval Gate

Before production activation, the following must be explicitly approved:

1. Monitoring-only scope
2. Scheduler and frequency
3. Production guard design
4. Durable state schema
5. Read-only database role
6. Notification channels and recipients
7. Verified sending domain
8. Secret storage and rotation
9. Cooldown and escalation parameters
10. Staging rehearsal plan
11. Production canary window
12. Rollback and emergency-disable procedure
13. Named operational owner

Unattended refund recovery remains a separate product, financial, and risk decision.

**Status:** [REQUIRES DECISION]

---

# 9. Roadmap Ahead

## Phase 6 — Platform Stabilization and Provider Abstraction

### Objective

Prepare Raivstream for multiple media providers without creating provider-specific technical debt.

### Workstreams

* Inspect and document current provider interfaces
* Define common image and video provider contracts
* Define generation-job lifecycle
* Standardize provider errors
* Standardize asset persistence
* Standardize cost and credit metadata
* Add provider capability registry
* Add feature flags
* Add provider health and availability state
* Define test fixtures and mock providers
* Establish provider integration guidelines

### Exit criteria

* A new provider can be added without changing core story logic
* All providers use the same job lifecycle
* Provider errors are normalized
* Assets preserve provider and model provenance
* Failed jobs can be reconciled safely
* Provider integrations can be disabled independently

**Priority:** Critical
**Status:** [IN PROGRESS]

> **Progress log:**
> - ✅ Common image/video/ugc contracts (`mediaProviders/types.ts`)
> - ✅ Provider error model (`MediaErrorCode` / `MediaProviderError`)
> - ✅ Output validation + asset persistence standardization (`outputValidation.ts`, `r2.ts`)
> - ✅ Feature flags (default-off `FAL_*` gates)
> - ✅ Mock provider + test fixtures
> - ✅ **Capability registry + health snapshot** (`mediaProviders/registry.ts`) — fal.ai, RunPod, xAI, Kling, Gemini; env-presence only, no secrets
> - ✅ **Provider health admin endpoint** (`providers.health`, admin-only)
> - ✅ **Provider integration guidelines** (`docs/architecture/provider-integration-guide.md`, incl. capability taxonomy)
> - ✅ **Registry consumed by the generation flow** — `generation.listModels` annotates each model with `available`/`unavailableReason` via `resolveModelAvailability()`
> - ⬜ Full capability taxonomy served beyond image/video/ugc (TTS/audio/editing) — deferred until concrete providers are selected (taxonomy documented, not coded)

---

## Phase 7 — Flux.2 Integration

### Objective

Integrate Flux.2 into the image-generation and image-editing pipeline.

### Workstreams

* Confirm selected Flux.2 endpoint and model variant
* Confirm supported inputs and outputs
* Implement provider adapter
* Implement request validation
* Map scene and character inputs
* Add reference-image support where available
* Add output validation
* Persist asset metadata
* Add regeneration support
* Add cost tracking
* Add timeout and retry behavior
* Add staging feature flag
* Add provider-specific tests
* Run visual-quality evaluation
* Conduct controlled staging rollout

### Exit criteria

* Scene images can be generated through the unified provider interface
* Regeneration creates new asset versions
* Provider failures do not corrupt project state
* Costs are recorded
* The provider can be disabled without code rollback
* Quality meets agreed product standards
* Production activation has explicit approval

**Priority:** Critical
**Status:** [IN PROGRESS — adapter + staged generation flow proven live 21/21]

> Adapter (`falFlux2.ts`), contract reconciliation, AI Studio wiring, Story Workspace scene-image wiring, output R2-mirroring (polling + webhook), provider-side cancellation, and the full staged flow (`generation.create` → poll → `publish` with credit gate + ledger, chained in `packages/api/scripts/fal-generation-e2e.ts`) are done, proven live, and **deployed to production** (commit `7a3c674`, 2026-09-21). **Gate D quality batch run: 9/9 technical pass** (`docs/operations/gate-d-fal-quality-evaluation.md`). Reference-image/editing is out of scope (separate `fal-ai/flux-2/edit` endpoint). Remaining: human visual sign-off → staging rollout → production canary + explicit fal enablement (prod `FAL_*` switches currently OFF).

---

## Phase 8 — MiniMax Video Integration

### Objective

Add reliable video-generation capability for animating scene images and producing short clips.

### Workstreams

* Confirm MiniMax model and endpoint
* Define image-to-video and text-to-video scope
* Implement asynchronous provider adapter
* Add job polling or webhook reconciliation
* Add provider job ID mapping
* Add video output validation
* Add duration and resolution limits
* Add cost estimation and reconciliation
* Add timeout and retry policies
* Add cancellation behavior
* Add video preview and regeneration
* Add staging feature flag
* Evaluate motion quality and character consistency

### Exit criteria

* MiniMax jobs are tracked from submission to completion
* Provider callbacks or polling are idempotent
* Failed jobs do not leave orphaned credit reservations
* Generated videos are stored with complete provenance
* Video quality and cost are acceptable
* Production rollout is approved

**Priority:** High
**Status:** [IN PROGRESS — adapter + story scene-video + staged flow proven live]

> H3-Max **Turbo** (`falH3Max.ts`, `minimax/h3-max-turbo/image-to-video`), polling, job-ID mapping, output validation, output R2-mirroring, provider-side cancellation, and the **Story Workspace scene-video pipeline** (`story.generateSceneVideo` / `regenerateSceneVideo`, VIDEO assets, "Animate to Video" UI) are done and **deployed** (commit `7a3c674`). Remaining: live smoke, cost reconciliation (reserve/settle), visual-quality/motion evaluation, film-sequence integration, fal enablement.

---

## Phase 9 — VEED Fabric Integration

### Objective

Evaluate and integrate VEED Fabric for video creation, editing, assembly, or finishing.

### Workstreams

* Confirm Fabric API capabilities
* Determine whether Fabric complements or replaces parts of FFmpeg
* Define input contract
* Define output contract
* Define timeline and scene composition model
* Implement adapter
* Add asynchronous job handling
* Add captions and audio support if applicable
* Add export validation
* Add cost and quota tracking
* Add failure and retry handling
* Compare output quality and operational cost with existing assembly
* Run controlled staging evaluation

### Exit criteria

* Fabric's role is clearly defined
* The integration does not duplicate existing functionality unnecessarily
* Output quality and cost justify adoption
* The integration is feature-flagged
* Existing video workflows remain available as fallback
* Production activation is explicitly approved

**Priority:** High
**Status:** [IN PROGRESS — adapter + router + staged flow proven live; UI/consent pending]

> Backend adapter (`falVeed.ts`), `generation.create` support (`seedImageUrl` + `audioUrl`, prompt optional), `GenerationJob.audioUrl` persistence, and the staged flow (lip-sync of a generated still + staging audio fixture → R2 mirror → publish → exact ledger) are done, proven live 21/21, and **deployed** (commit `7a3c674`). Still no audio-input UI, and UGC consent/ownership/moderation controls not yet implemented — VEED stays hidden/API-only until then.

---

## Phase 10 — End-to-End Story-to-Video Pipeline

### Objective

Create a cohesive workflow from story creation to final video output.

### Proposed workflow

1. User creates a story
2. Story is divided into scenes
3. Character Bible is established
4. Scene images are generated
5. User reviews or regenerates images
6. Images are animated into clips
7. Narration is generated or selected
8. Clips and narration are assembled
9. Captions and transitions are applied
10. Final video is rendered
11. Video is previewed
12. User exports or shares the result

### Required capabilities

* Pipeline orchestration
* Per-scene retry
* Partial completion
* Resume after failure
* Progress reporting
* User cancellation
* Versioned outputs
* Final-render validation
* Cost summary
* Export history

**Priority:** Critical
**Status:** [IN PROGRESS]

> **Phase 10 increment:** the Movie Builder now **prefers a READY scene video over the still image** for each shot, falling back to the still when none exists (`movieRenderPlanning.isEligibleMovieRenderVideoAsset` + `videoAssetsBySceneId`; `movieRenderWorker.renderVideoShot` loops/trims/scales the clip to the shot duration, audio stripped for separate muxing). `MOVIE_RENDERER_VERSION` bumped to `phase-10-v1` so existing renders re-render.
>
> **Phase 10 tail (this increment):** per-shot retry (`MOVIE_RENDER_SHOT_ATTEMPTS`, default 2) and **resume-after-failure** — rendered shot segments are persisted to R2 (`…/movies/{jobId}/segments/shot-NNN.mp4`) and reused on retry of the same job (injectable `segmentStore`; disabled when `MOVIE_RENDER_SEGMENT_RESUME=false` or R2 unconfigured; segments cleaned after success). Added `story.listMovieAssets` for export/version history.
>
> **Remaining:** partial-completion reporting, final-render cost summary. **Narration generation** shipped via ElevenLabs (`story.generateCueSpeech`); see the Phase 9B.3 note in §"Next Candidate Phases".

---

## Phase 11 — Advanced Editing and Creative Controls

### Objective

Give users more control without exposing unnecessary technical complexity.

### Potential features

* Scene duration controls
* Camera-motion presets
* Transition presets
* Narration voice selection
* Background music
* Volume mixing
* Caption styles
* Aspect-ratio selection
* Character consistency controls
* Scene regeneration by instruction
* Style presets
* Mood and pacing controls
* Intro and outro templates
* Cover-image generation
* Thumbnail selection

### Product principle

Advanced controls should be progressive:

* Simple defaults for younger or casual users
* More control for advanced users
* Admin-only provider and cost controls

**Priority:** Medium to High
**Status:** [IN PROGRESS]

> **Phase 11 increment:** two creative controls shipped.
> - **Scene regeneration by instruction** — `generateSceneImage` / `regenerateSceneImage` / `generateSceneVideo` / `regenerateSceneVideo` accept an optional `instruction` (≤300 chars), moderated and appended to the composed prompt; UI textarea in `SceneDirectorScreen`.
> - **Shot presets** — `story.applyShotPreset` applies a named camera/transition/pacing bundle (`CINEMATIC`, `DYNAMIC`, `CALM`, `DRAMATIC`, `REVEAL`) to a Sequence scene (or all enabled scenes). UI picker in the Sequence **Shot Inspector** (apply to one shot or all shots).
>
> **Phase 9B.3 (narration) — shipped alongside:** **ElevenLabs** TTS behind `lib/generators/elevenLabsTts.ts` + `story.generateCueSpeech` (moderate → `story:speech_generation` credit gate → ElevenLabs → R2 `AudioAsset(sourceKind:'GENERATED_SPEECH')` → link `AudioCue.audioAssetId`; refund-on-failure). Flag-gated by `ELEVENLABS_TTS_ENABLED` + key presence; **rate intentionally unset** (fails closed) until pricing is decided. UI: "Generate narration" in the Audio cue inspector. Key resolves from `ELEVENLABS_API_KEY` or legacy `11_LABS`.
>
> **Background music — shipped:** **Lyria** (`lib/generators/lyriaMusic.ts`, reuses `GEMINI_API_KEY`) + `story.generateCueMusic` for MUSIC/AMBIENCE cues (moderate → `story:audio_generation` credit gate → Lyria → R2 `AudioAsset(sourceKind:'GENERATED_MUSIC')` → link cue; refund-on-failure). Flag-gated by `LYRIA_MUSIC_ENABLED` + key; rate unset. UI: "Generate music" in the cue inspector. Models: `lyria-3-clip-preview` (30s) / `lyria-3-pro-preview` (full-length).
>
> **Captions — sidecar (shipped):** `story.getSequenceCaptions` builds a **WebVTT** track from timed `NARRATION`/`DIALOGUE` cue text (`buildWebVtt`); "Download captions (.vtt)" in the Film tab. Non-destructive; burn-in presets deferred.
>
> **Cover (shipped):** `StoryProject.coverAssetId` (migration `20260912180000`) + `story.setProjectCover`; "Use as cover" on a scene card. Title rendered as an overlay (not baked in); a dedicated "generate cover" is deferred.
>
> **Mixing console (shipped):** per-cue volume/fade/ducking controls hidden by default behind a "Show mixing console" toggle in the cue inspector. **Aspect ratio:** 9:16 remains the feed default; 16:9 / 1:1 remain available via the generation `aspectRatio` (AI Studio).
>
> **Style presets (shipped):** `story.listStylePresets` / `story.applyStylePreset` — named bundles (`WARM_STORYBOOK`, `EPIC_CINEMATIC`, `ANIME_ADVENTURE`, `PHOTOREAL_CINEMATIC`, `AFRICAN_FOLKTALE`) that set `project.visualStyle`, apply director defaults (lighting/mood/pace/time) to all scenes, and return a music prompt. UI picker in the New Story style step.
>
> **Remaining (needs product decisions / next):** **intro/outro title cards** (v1 = text-over-image, 2 templates — needs a title font decision), generate-cover, and the progressive-disclosure tiers (casual vs advanced vs admin).

---

## Phase 12 — Commercialization and Product Packaging

### Objective

Convert Raivstream from a functioning platform into a sustainable commercial product.

### Workstreams

* Define free and paid plans
* Define generation allowances
* Define image and video credit costs
* Define storage limits
* Define export limits
* Define watermark policy
* Define commercial-use rights
* Define provider-cost margins
* Add usage dashboards
* Add billing and subscription enforcement
* Add failed-generation credit policy
* Add refund and credit reconciliation
* Add admin controls
* Add abuse and fraud monitoring

### Decisions required

* Will credits be prepaid, subscription-based, or both?
* Are video generations priced separately?
* Are premium providers restricted to paid plans?
* Are unused credits carried forward?
* What happens when a provider fails after credit reservation?
* What is the customer support and refund policy?

**Priority:** Critical for commercial launch
**Status:** [REQUIRES DECISION]

---

## Phase 13 — Observability and Operations

### Objective

Make the platform measurable and supportable at production scale.

### Required capabilities

* Centralized structured logs
* Generation-job dashboard
* Provider health dashboard
* Queue and latency metrics
* Failure-rate metrics
* Cost and credit dashboards
* Refund-monitoring dashboard
* Alert delivery monitoring
* Storage health monitoring
* Database health monitoring
* Error tracking
* Deployment health checks
* Audit logs
* Operational runbooks
* On-call ownership

### Key metrics

#### Product metrics

* Story creation starts
* Story completion rate
* Scene completion rate
* Image generation success rate
* Video generation success rate
* Regeneration rate
* Storybook views
* Read-aloud completion
* Video export completion
* Repeat creation rate

#### Technical metrics

* Queue wait time
* Provider latency
* Provider timeout rate
* Provider failure rate
* Webhook delay
* Polling reconciliation delay
* Asset persistence failures
* Storage errors
* Database errors
* Credit reconciliation failures

#### Financial metrics

* Cost per image
* Cost per video
* Cost per completed story
* Average credits consumed
* Failed-generation refund rate
* Provider margin
* Unusual usage patterns

**Priority:** Critical before broad production scale
**Status:** [PLANNED]

> `providers.health` (Phase 6) and the `/admin/providers` dashboard UI (Phase 13 increment) are the first observability building blocks toward the full provider-health dashboard.

---

## Phase 14 — Safety, Governance, and Compliance

### Objective

Ensure that Raivstream remains safe and trustworthy as generation capabilities expand.

### Workstreams

* Input moderation
* Output moderation
* Child-safety review
* Provider policy review
* Copyright and likeness safeguards
* Data retention policy
* Asset deletion policy
* Privacy controls
* User reporting
* Abuse investigation workflow
* Audit logging
* Restricted-provider policy for R16
* Parent or guardian controls where applicable
* Incident response procedure

### Special concern

Adding more powerful video and image providers increases both creative capability and safety risk. Each provider must be evaluated independently before being exposed to R16 users.

**Priority:** Critical
**Status:** [ONGOING]

---

## Phase 15 — Scale and Reliability

### Objective

Prepare the platform for increasing users, larger projects, and more expensive media workloads.

### Potential workstreams

* Queue-based job processing
* Dedicated worker processes
* Concurrency controls
* Provider-specific rate limiting
* Backpressure
* Priority queues
* Per-user fairness
* Retry queues
* Dead-letter queues
* Horizontal scaling
* Object-storage lifecycle policies
* CDN optimization
* Database indexing
* Background cleanup jobs
* Disaster recovery
* Backup verification
* Load testing
* Capacity planning

### Exit criteria

* A provider outage does not bring down the entire application
* Long-running jobs do not block web requests
* Users receive accurate progress and failure states
* Costs remain bounded during spikes
* Recovery procedures are tested
* Production capacity is measurable

**Priority:** High before significant user growth
**Status:** [IN PROGRESS]

> **Phase 15 increment 1 (retry):** `GenerationJob.retryCount` + `errorCode` (migration `20260912160000`), `errorCode` populated from the normalized error, and `generation.retry` (failed jobs, max `MAX_JOB_RETRIES=3`, re-charges with refund-on-failure).
>
> **Phase 15 increment 2 (backpressure + cleanup + indexing):**
> - **Provider rate limiting / concurrency** — `lib/generators/providerRateLimit.ts`: per-provider in-process concurrency cap (`PROVIDER_MAX_CONCURRENCY`) and minimum interval (`PROVIDER_MIN_INTERVAL_MS`); wired into `submitGenerationJob`, rejecting over-cap submissions with a retryable `RATE_LIMITED` (defaults unlimited → no behavior change).
> - **Background cleanup** — `releaseStuckReservations()` releases HELD `CreditReservation`s older than a cutoff (closes the §7.5 crash-between-reserve-and-settle gap).
> - **Dead-letter visibility** — `admin.listGenerationJobs({ deadLetter: true })` lists FAILED jobs that exhausted the retry budget.
> - **DB indexing** — `[status, createdAt]`, `[status, retryCount]`, `[errorCode]` on `generation_jobs` (migration `20260912170000`).
>
> **Remaining (ops + larger architecture):** durable queue-based processing, dedicated worker processes, a distributed limiter (Upstash), object-storage lifecycle policies, CDN tuning, disaster recovery + backup verification, load testing, capacity planning.
>
> **Phase 15 increment 3 (ops — code + runbook):**
> - **Readiness probe** — `GET /api/ready` (DB + R2 reachability + redacted provider summary), distinct from liveness `GET /api/health`.
> - **Dead-letter re-drive** — `admin.resetDeadLetterJob({ jobId })` resets the retry budget (no credit change) so the owner can retry.
> - **Runbook** — `docs/operations/phase-15-operations.md` (rate-limit config, DLQ handling, reserve/settle reconciliation scheduling, probes, backup/DR, load testing, capacity, storage lifecycle).
> - Explicitly deferred: durable queue/worker architecture, distributed limiter, CDN tuning, formal load tests.

---

## Phase 16 — AI Narrative & Production Pipeline (MiniMax H3 + ElevenLabs)

### Objective

Upgrade story composition and prompt generation into a staged LLM pipeline that ends in
**MiniMax H3** scene video (native synchronized audio/SFX, 4–15s, up to 1080P @ 24 FPS,
optional `first_frame_image` i2v) with **ElevenLabs** scene narration, and stitches the
result into a final production render. See `docs/architecture.md` §12 for the pipeline,
manifest schema, MiniMax H3 prompt formula, and integration map.

### Sub-phases

- **16.1 · Narrative Engine (Claude Sonnet).** New story-composition service
  (`CLAUDE_API`, key staged in `cred/fal_env.txt`; default model `claude-sonnet-4-5`,
  override `CLAUDE_STORY_MODEL`): expands a raw concept into a 3–5 scene
  cinematic story with sensory anchors (lighting, atmosphere, physical action, ambient
  sound cues) and internal conflict. Augments the existing `storyTextService` (OpenAI /
  deterministic fallback); flag-guarded (`STORY_NARRATIVE_ENGINE_ENABLED`, default off).
- **16.2 · Production Script Structurer (GPT-4o JSON).** New structurer (`GPT40_API`):
  converts the Stage 1 prose into a strict `ProductionManifest` (title, logline, scenes[]
  with `elevenlabs_narration`, `minimax_video_prompt`, `camera_motion`, `duration_sec` 5–15,
  `resolution` `768P|1080P`, `first_frame_image_url`), using
  `response_format: { type: 'json_object' }`. Becomes the canonical creative specification
  for scene video; flag-guarded (`STORY_MANIFEST_STRUCTURER_ENABLED`, default off).
- **16.3 · MiniMax H3 native-audio video generation.** Extend the existing `H3_MAX` fal
  adapter/contracts for `duration_sec` (verified **15s**), `resolution` **`480P|768P|1080P`**
  (verified **1080×1920 @ 24fps**), and `first_frame_image` (i2v); MiniMax H3 embeds
  synchronized sound/SFX during inference (verified aac track). Host decision recorded in
  `docs/adr/ADR-002-MiniMax-H3-Transport.md` (fal queue accepted; no fallback needed).
  `generation.create` + `story.generateSceneVideo` forward `resolution`/`duration`;
  `GenerationJob.resolution` persists for retry. Manifest consumption (minimax prompt /
  camera / duration / resolution / first-frame) is wired in 16.5.
- **16.4 · ElevenLabs scene narration wiring.** Route each scene's `elevenlabs_narration`
  through the existing `story.generateCueSpeech` → R2 `AudioAsset(GENERATED_SPEECH)` →
  `AudioCue` path so the Movie Builder mixer consumes it like any other cue.
- **16.5 · ProductionManifest + final stitching.** Persist the resolved manifest (scene
  metadata + generated video/audio URLs) per project; extend the Movie Builder to combine
  MiniMax native SFX + ElevenLabs VO + scene video into the final render; export history
  via the existing `story.listMovieAssets`.

### Exit criteria

- Raw concept → cinematic story → strict JSON manifest → per-scene MiniMax H3 video (native
  SFX) + ElevenLabs narration → stitched final render, end to end.
- Durations 5–15s, `768P`/`1080P` @ 24 FPS, first-frame i2v honored; MiniMax native audio
  correctly isolated vs ElevenLabs VO during stitching.
- Fail-closed switches, R16-safe deterministic fallback preserved, credits/ledger exact,
  manifest persisted + resumable.
- Provider host decision documented; production enablement requires the standard Gate
  C/D/E/F discipline.

**Priority:** High
**Status:** [PLANNED]
**Credentials:** `CLAUDE_API`, `GPT40_API` (staged in `cred/fal_env.txt`); ElevenLabs uses
existing `ELEVENLABS_API_KEY` / `11_LABS`.

---

# 10. Recommended Delivery Sequence

The recommended sequence is:

1. **Stabilize provider abstraction**
2. **Standardize generation jobs**
3. **Complete Flux.2 integration**
4. **Strengthen asset versioning and cost reconciliation**
5. **Integrate MiniMax**
6. **Build end-to-end image-to-video workflow**
7. **Evaluate and integrate VEED Fabric**
8. **Add final video assembly and editing controls**
9. **Complete production observability**
10. **Approve and activate FAL operational alerting**
11. **Finalize commercialization and billing**
12. **Run production canary**
13. **Scale and expand provider routing**
14. **Phase 16.1 — Narrative Engine (Claude 3.5 Sonnet)**
15. **Phase 16.2 — Production Structurer (GPT-4o manifest)**
16. **Phase 16.3 — MiniMax H3 native-audio video (extend H3_MAX)**
17. **Phase 16.4 — ElevenLabs scene narration wiring**
18. **Phase 16.5 — ProductionManifest + final stitching**

Phases 16.3–16.5 build on the MiniMax infrastructure shipped in Phases 6–8 and the
narration/mixer layer from 9B.2–9B.3; 16.1–16.2 replace the composition/structuring
upstream without touching the existing provider abstraction.

---

# 11. Major Dependencies

The following dependencies should be treated as gating items.

## Provider integrations depend on

* Unified provider contract
* Generation-job model
* Asset persistence rules
* Cost and credit reconciliation
* Secret management
* Feature flags
* Provider capability inspection
* Staging test environment

## Production alerting depends on

* Approved architecture
* Durable state schema
* Scheduler selection
* Verified sending domain
* Notification recipients
* Secret storage
* Staging rehearsal
* Emergency-disable procedure
* Named owner

## Commercial launch depends on

* Reliable generation accounting
* Credit reservation and reconciliation
* Refund policy
* Usage limits
* Provider cost model
* Customer support workflow
* Terms and privacy decisions

## R16 expansion depends on

* Provider safety review
* Input and output moderation
* Age-appropriate UX
* Restricted provider capabilities
* Parent or guardian requirements
* Safe error and content-reporting flows

---

# 12. Risks and Mitigations

## Risk: Provider-specific technical debt

**Impact:** Every new provider requires changes throughout the application.

**Mitigation:** Enforce a shared provider adapter and generation-job contract before adding multiple providers.

---

## Risk: Uncontrolled generation costs

**Impact:** Video and image generation can create unexpected financial exposure.

**Mitigation:**

* Cost estimation
* Credit reservation
* Quotas
* Rate limits
* Per-provider budgets
* Usage alerts
* Admin controls
* Explicit refund policy

---

## Risk: Duplicate jobs and duplicate charges

**Impact:** Retries, webhook duplication, or user refreshes may create multiple generations.

**Mitigation:**

* Idempotency keys
* Provider job IDs
* Unique job fingerprints
* Single-flight submission
* Durable job state
* Reconciliation processes

---

## Risk: Provider outage

**Impact:** Users cannot generate media or jobs remain stuck.

**Mitigation:**

* Provider health tracking
* Timeouts
* Retry policies
* Fallback providers
* Clear user-facing status
* Manual recovery tools

---

## Risk: Inconsistent character identity

**Impact:** Generated scenes do not look like the same story or characters.

**Mitigation:**

* Character Bible
* Reference-image support
* Provider-specific consistency strategies
* Visual evaluation
* Regeneration lineage
* Character-locking controls

---

## Risk: Unsafe content exposure

**Impact:** Users, especially children, may receive inappropriate or unsafe media.

**Mitigation:**

* Input moderation
* Output moderation
* Restricted provider set
* R16-specific controls
* Human escalation
* Audit logs
* Content reporting

---

## Risk: Alert fatigue

**Impact:** Operators ignore important alerts because of excessive warnings.

**Mitigation:**

* Severity thresholds
* Cooldowns
* Deduplication
* Grouping
* Recovery notifications
* Daily digests
* Threshold tuning based on observed production data

---

## Risk: Accidental refund or credit mutation

**Impact:** Financial loss or incorrect user balances.

**Mitigation:**

* Read-only monitor
* Separate execution authority
* Explicit approval gate
* Dry-run validation
* Audit logs
* Emergency disablement
* No implicit activation

---

# 13. Release Gates

Every major provider integration should pass the following gates.

## Gate A — Architecture

* Adapter contract approved
* Job lifecycle defined
* Provider capability documented
* Error categories mapped
* Cost model documented

## Gate B — Security

* Secrets stored securely
* No credentials in source control
* Logs redacted
* Provider access restricted
* R16 exposure reviewed

## Gate C — Staging

* Feature flag disabled by default
* Staging generation succeeds
* Failure cases tested
* Retries tested
* Duplicate submission tested
* Asset persistence verified
* Cost reconciliation verified

## Gate D — Quality

* Output quality evaluated
* Character consistency evaluated
* Latency measured
* Cost measured
* User experience reviewed

## Gate E — Production Canary

* Named owner assigned
* Monitoring enabled
* Rollback tested
* Emergency disablement tested
* Usage limits configured
* Canary scope restricted
* No unattended financial recovery enabled

## Gate F — General Availability

* Error rates acceptable
* Costs within budget
* Support documentation complete
* Runbooks complete
* Provider fallback or disablement available
* Product and commercial approval obtained

---

# 14. Proposed Milestone Framework

Calendar dates should be assigned only after confirming engineering capacity, provider access, API readiness, and the current state of the provider abstraction.

The roadmap should nevertheless be managed through the following milestones:

### Milestone 1 — Architecture Ready

**Deliverables:**

* Provider interface
* Job model
* Capability registry
* Error model
* Cost and credit contract
* Feature-flag strategy

### Milestone 2 — Flux.2 Ready

**Deliverables:**

* Flux.2 adapter
* Image generation and editing
* Asset versioning
* Staging evaluation
* Production approval package

### Milestone 3 — Video Infrastructure Ready

**Deliverables:**

* Unified video job model
* Polling/webhook reconciliation
* Video asset persistence
* Retry and timeout handling
* Cost reconciliation

### Milestone 4 — MiniMax Ready

**Deliverables:**

* MiniMax adapter
* Image-to-video workflow
* Quality and cost evaluation
* Staging rollout

### Milestone 5 — VEED Fabric Decision

**Deliverables:**

* Capability assessment
* Build-versus-integrate decision
* Defined Fabric role
* Cost and quality comparison
* Integration approval

### Milestone 6 — Story-to-Video Pipeline Ready

**Deliverables:**

* End-to-end orchestration
* Narration
* Scene animation
* Assembly
* Preview
* Export
* Recovery from partial failure

### Milestone 7 — Commercial Readiness

**Deliverables:**

* Plans
* Credits
* Quotas
* Billing
* Refund policy
* Usage dashboards
* Support procedures

### Milestone 8 — Production Scale Readiness

**Deliverables:**

* Observability
* Alerting
* Runbooks
* Capacity planning
* Disaster recovery
* On-call ownership
* Canary and rollback procedures

---

# 15. Immediate Next Actions

The recommended immediate work is:

1. Inspect the current provider implementation and identify existing abstractions.
2. Document all current image, video, audio, and storage interfaces.
3. Define the unified provider contract.
4. Define the generation-job state machine.
5. Define the asset provenance and version model.
6. Confirm the exact Flux.2 integration target.
7. Confirm the intended MiniMax workflow.
8. Inspect VEED Fabric's current API capabilities and determine its precise role.
9. Define cost and credit reconciliation requirements before adding more providers.
10. Review the FAL production alerting design and obtain explicit approval before implementation.
11. Establish a provider integration test harness.
12. Create a staged roadmap issue or milestone for each provider.
13. Assign an owner and acceptance criteria to every milestone.
14. **Kick off Phase 16**: implement the Narrative Engine (Claude 3.5 Sonnet) then the
    Production Structurer (GPT-4o manifest), extend the MiniMax H3 contract (duration /
    resolution / first-frame / native audio), wire ElevenLabs scene narration, and persist
    the ProductionManifest — each behind fail-closed switches (`STORY_NARRATIVE_ENGINE_ENABLED`,
    `STORY_MANIFEST_STRUCTURER_ENABLED`).

> Items 1–5 and 11 are now substantially underway via Phase 6 (see §7.1/§9 Phase 6 progress log).

---

# 16. Explicit Decisions Required

The following decisions should be recorded before the next major implementation phase.

## Product decisions

* Is Raivstream primarily a storybook platform, a video-generation platform, or both?
* Is video generation a premium capability?
* Should users select providers, or should the platform route automatically?
* What level of editing control should users receive?
* Which features are available in R16?

## Technical decisions

* What is the canonical generation-job model?
* What is the canonical provider interface?
* Which provider is the default for each capability?
* What is the fallback strategy?
* Will webhooks, polling, or both be supported?
* What is the queue and worker architecture?
* How will long-running jobs be resumed?

## Financial decisions

* How are credits reserved?
* When are credits consumed?
* When is a failed job refundable?
* Who approves refunds?
* What is the maximum generation exposure per user?
* What are the provider budget limits?

## Operational decisions

* Who owns production alerting?
* Who receives critical notifications?
* What is the verified sender domain?
* What is the emergency-disable mechanism?
* What is the production canary process?
* What is the on-call response expectation?

## Safety decisions

* Which providers are permitted for R16?
* What moderation is required before and after generation?
* What content is prohibited?
* How are user reports handled?
* How long are prompts, assets, and generation records retained?

---

# 17. Overall Strategic Assessment

Raivstream has already completed the difficult early transition from concept to working product foundation. The platform now has the essential building blocks of a creative generation experience:

* Structured stories
* Scene decomposition
* Character continuity
* Generated visual assets
* Storybook presentation
* Narration
* Video workflows
* Production deployment
* Analytics
* Safety boundaries
* Operational safeguards

The next challenge is architectural maturity.

The priority should not be to add providers as isolated integrations. The priority should be to create a platform where providers become interchangeable production capabilities behind a reliable internal system.

The strategic direction is:

> **Build the Raivstream media platform first, then expand its provider ecosystem through controlled, measurable integrations.**

Flux.2 is the logical next provider milestone because it strengthens the image foundation. MiniMax should follow when the asynchronous video-job infrastructure is ready. VEED Fabric should be integrated after its precise role in generation, editing, or final assembly has been confirmed.

At the same time, financial operations, production alerting, safety, and observability must mature alongside media capabilities. These are not secondary concerns; they are prerequisites for sustainable scale.

---

# 18. Final Roadmap Principle

Raivstream should progress through the following maturity curve:

**Working prototype**
→ **Reliable storytelling product**
→ **Multi-provider media platform**
→ **End-to-end story-to-video production system**
→ **Commercial creative platform**
→ **Scalable, safe, and operationally mature AI media ecosystem**

The journey so far establishes a strong foundation. The work ahead is to make that foundation extensible, economically controlled, safe for its intended audiences, and reliable enough to support sustained product growth.
