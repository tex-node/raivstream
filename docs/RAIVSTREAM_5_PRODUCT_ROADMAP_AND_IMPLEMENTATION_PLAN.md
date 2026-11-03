# Raivstream 5.0 — Product Roadmap & Implementation Plan

**Status:** Implementation-ready product roadmap  
**Product:** Raivstream 5.0  
**Primary objective:** Transform Raivstream from a generation-oriented application into an AI creative studio that understands creative intent, makes production decisions, preserves continuity, and lets creators direct outcomes without learning prompts, JSON, models, or production technology.

---

## 1. Product North Star

> **Tell Raivstream what you imagine. It figures out how to make it.**

Raivstream 5.0 should feel like a creative collaborator and intelligent production system—not a chatbot with a video generator attached.

The core loop is:

```text
CREATE
  ↓
UNDERSTAND
  ↓
PLAN
  ↓
PREVIEW
  ↓
DIRECT
  ↓
PRODUCE
  ↓
REVIEW
  ↓
REFINE
  ↓
APPROVE
  ↓
REMEMBER
  ↓
CREATE AGAIN
```

### Product thesis

Users communicate **intent**.

Raivstream handles:

- interpretation
- creative decisions
- story structure
- visual direction
- production planning
- continuity
- multimodal generation
- review
- refinement
- versioning
- output preparation

The creator directs the outcome rather than operating the production machinery.

---

# 2. Primary Users

## 2.1 Storyteller / Filmmaker

Needs:

- stories
- characters
- worlds
- scenes
- episodic structure
- visual continuity
- creative direction
- alternate versions
- final video

## 2.2 Educator / Parent

Needs:

- educational explanations
- age-appropriate storytelling
- child-safe generation
- read-aloud content
- simple controls
- no technical production interface

## 2.3 Professional Content Studio

Needs:

- campaigns
- products
- brand DNA
- reusable characters/worlds/assets
- variations
- multiple output formats
- repeatable creative workflows

---

# 3. Core Product Principles

1. Understand intent, not just words.
2. Infer before asking.
3. Ask only consequential questions.
4. Let Raivstream make creative decisions by default.
5. User instructions outrank AI assumptions.
6. Approved creative decisions persist.
7. Continuity is actively protected.
8. Users direct outcomes, not technical machinery.
9. Changes should be semantic, not technical.
10. Complexity is progressively disclosed.
11. Simple on the surface, deep underneath.
12. Never require JSON or advanced prompting.
13. Never require provider/model selection.
14. Preserve creator intention, not merely creator instructions.
15. Every complex decision has an Auto / Let Raivstream decide path.
16. Show outcomes and creative consequences rather than production internals.
17. `Direct` is the primary refinement action; `Regenerate` is not the primary product concept.
18. Chat is an input mechanism, not the whole product.
19. Desktop is optimized for filmmaking/studio work; mobile is optimized for create/review/direct/approve.
20. Do not build features first. Build the creative loop first.

---

# 4. Product Architecture

```text
USER INTENT
    ↓
INTENT ENGINE
    ↓
STORY / EDUCATION / COMMERCIAL INTELLIGENCE
    ↓
CREATIVE STATE
    ↓
CREATIVE BIBLE + MEMORY
    ↓
AI DIRECTOR
    ↓
DIRECT / EXPLORE / REVIEW
    ↓
PRODUCTION PLAN
    ↓
SCENES / SHOTS
    ↓
CONTINUITY ENGINE
    ↓
MULTIMODAL PRODUCTION
    ↓
ASSEMBLY
    ↓
OUTPUT
    ↓
REVIEW
    ↓
KEEP / DIRECT
    ↓
NEW VERSION
```

### Five product layers

1. **Understanding**
2. **Memory**
3. **Direction**
4. **Production**
5. **Judgment**

---

# 5. Existing System to Preserve

The current Raivstream repository already contains substantial production infrastructure. Do not duplicate it.

Important existing capabilities include:

- `StoryProject`
- `StoryCharacterMemory`
- `StoryEnvironment`
- `StorySceneSeed`
- `StoryboardShot`
- `StorySequence`
- `StorySequenceScene`
- `StorySceneAsset`
- `GenerationJob`
- `MovieRenderJob`
- `MovieAsset`
- `AudioPerformancePlan`
- `AudioTrack`
- `AudioCue`
- `AudioAsset`
- `VoiceProfile`
- `CreativeCriticRun`
- Story intelligence
- `visualBible.ts`
- `productionStructurer.ts`
- `sequencePlanning.ts`
- `lastFrameExtract.ts`
- `promptEnhancerService.ts`
- existing generation/video infrastructure
- existing R16/safety infrastructure

### Architectural rule

**5.0 sits above this infrastructure.**

Do not immediately replace the Story domain.

Use:

```text
CreativeProject
    ↓
semantic/orchestration layer
    ↓
adapters
    ↓
existing Story/production infrastructure
```

---

# 6. User-Facing Domain Model

The user-facing vocabulary is:

- Create
- Project
- Brief
- Creative Bible
- Character
- World
- Scene
- Shot
- Director
- Direct
- Variation
- Version
- Review
- Remix
- Output

Avoid exposing:

- ProductionManifest
- GenerationJob
- I2V
- V2V
- FFmpeg
- provider names
- model names
- raw prompts
- JSON manifests
- shot-grid internals

---

# 7. Canonical Project Model

```text
PROJECT
├── CREATIVE BRIEF
├── CREATIVE BIBLE
│   ├── Story
│   ├── Characters
│   ├── Worlds
│   ├── Visual Language
│   ├── Audio Language
│   └── Audience
├── PRODUCTION PLAN
│   ├── Scenes
│   │   ├── Shots
│   │   ├── Dialogue
│   │   ├── Audio
│   │   └── Assets
│   └── Timeline
├── ASSET LIBRARY
├── GENERATION HISTORY
├── VERSIONS
└── OUTPUTS
```

### Brief

What the user wants.

### Creative Bible

What Raivstream knows and must preserve.

### Production Plan

How the creative work will be produced.

### Memory

What the creator has decided, rejected, preferred, or changed during creation.

---

# 8. Implementation Phases

## Phase 0 — Creative Foundation

**Goal:** Establish the new semantic layer without disrupting the existing application.

Deliver:

- feature flags
- `CreativeProject`
- `CreativeBrief`
- `CreativeBible`
- `CreativeMemory`
- project service
- project state
- shared creative contracts
- `/create` shell

### Database

Add only:

```text
CreativeProject
CreativeBrief
CreativeBible
CreativeMemory
```

Do not add Director/Review/Output models yet.

### Bridge

`CreativeProject.legacyStoryProjectId` is nullable and allows existing Story infrastructure to remain intact.

### Exit gate

A new creative project can be created without affecting existing Story Playground behavior.

---

# 9. Phase 1 — Intent-Driven Creation

**Goal:** A creator can describe an idea naturally and Raivstream can understand it.

### Backend

Create:

```text
packages/api/src/lib/creative/
├── featureFlags.ts
├── shared/
│   ├── types.ts
│   ├── enums.ts
│   └── errors.ts
├── project/
│   ├── service.ts
│   └── state.ts
└── intent/
    ├── service.ts
    ├── interpreter.ts
    ├── questions.ts
    └── types.ts
```

### API

```text
packages/api/src/routers/creative/
├── index.ts
├── project.ts
└── intent.ts
```

Register:

```text
creative: creativeRouter
```

in the main API router.

### Intent pipeline

```text
RAW CREATOR INPUT
    ↓
Normalize
    ↓
Detect project type
    ↓
Extract explicit intent
    ↓
Infer reasonable intent
    ↓
Identify uncertainty
    ↓
Identify consequential questions
    ↓
Construct interpretation
```

### User experience

Primary screen:

> **What are you creating?**

Input:

> Tell Raivstream what you're imagining...

Suggestions:

- Tell a story
- Teach something
- Promote something
- Transform something

Attachments:

- Image
- Video
- Script
- Audio
- Product

No prompt editor.

### Exit gate

The user can enter:

> Create a 60-second cinematic commercial for a new Nigerian premium skincare brand. Make it feel luxurious, confident and modern.

and receive a clear interpretation.

---

# 10. Phase 2 — Creative Intelligence

**Goal:** Turn interpreted intent into persistent creative knowledge.

Route intent into:

```text
Story Intelligence
Education Intelligence
Commercial Intelligence
```

### Story

Understand:

- characters
- conflict
- stakes
- theme
- arc
- pacing
- structure

### Education

Understand:

- learner
- age
- learning objective
- complexity
- explanation
- examples
- assessment

### Commercial

Understand:

- product
- audience
- brand
- message
- benefit
- CTA
- campaign objective

### Bible construction

```text
Original Intent
+
Intent Interpretation
+
Domain Intelligence
+
User Decisions
+
Existing Project Knowledge
        ↓
Creative Bible
```

### Important rule

An AI assumption is not automatically canon.

```text
ASSUMPTION
    ↓
PROPOSED DECISION
    ↓
USER APPROVAL
    ↓
CANON
```

Rejected decisions should be recorded in memory.

---

# 11. Phase 3 — Production Planning

**Goal:** Translate creative intent into a coherent production plan.

```text
Creative Brief
+
Creative Bible
    ↓
ProductionPlanService
    ↓
Production Adapter
    ↓
existing productionStructurer
    +
existing sequencePlanning
```

### New service

```text
creative/production/
├── service.ts
├── plan.ts
├── adapter.ts
└── preview.ts
```

### User-facing plan

```text
Scene 1
Scene 2
Scene 3
Scene 4
```

Internally:

```text
Scene
 ├── Shot
 ├── Shot
 ├── Shot
 └── Shot
```

Shot breakdown remains an AI/system decision.

### Do not expose

- provider
- model
- seed
- I2V
- V2V
- FFmpeg
- generation job details

---

# 12. Phase 4 — Preview

**Goal:** Let the creator validate the creative direction before expensive production.

Preview can progressively include:

1. story structure
2. character references
3. world references
4. keyframes
5. rough timing
6. narration
7. storyboard
8. low-cost motion preview

Preview must answer:

- Is this the right story?
- Are these the right characters?
- Is the world right?
- Is the visual direction right?
- Is the tone right?
- Is the pacing right?

### Approval boundary

```text
CREATE
 ↓
UNDERSTAND
 ↓
PLAN
 ↓
PREVIEW
 ↓
APPROVE
 ↓
PRODUCE
```

---

# 13. Phase 5 — Multimodal Production

**Goal:** Connect the new semantic layer to the existing production engine.

Use:

```text
ProductionService
    ↓
CapabilityRouter
    ↓
GenerationAdapter
    ↓
existing generation infrastructure
```

Capabilities:

```text
IMAGE
VIDEO
AUDIO
VOICE
MUSIC
RESTYLE
```

The existing roadmap's audio-first timing, still generation, I2V chaining, last-frame extraction, restyling/FX and FFmpeg assembly remain internal production capabilities.

The creator should not have to configure those stages.

---

# 14. Phase 6 — Continuity

Continuity becomes a service, not a creator responsibility.

```text
Character
World
Scene
Shot
Previous Frame
Audio
Visual Language
       ↓
ContinuityService
```

Existing `lastFrameExtract.ts` becomes an implementation component.

The system automatically handles:

- character consistency
- world consistency
- last-frame chaining
- spatial continuity
- visual language
- audio/visual timing

---

# 15. Phase 7 — AI Director

**Goal:** Allow semantic creative direction.

Director modes:

```text
DIRECT
EXPLORE
REVIEW
```

### Director contract

```ts
type DirectorDecision = {
  interpretation: string

  directive: {
    instruction: string
    intent: string
    scope: DirectiveScope
  }

  affectedEntities: EntityReference[]
  preservedEntities: EntityReference[]

  creativeChanges: CreativeChange[]
  productionChanges: ProductionChange[]

  continuityImplications: {
    type: string
    description: string
  }[]

  approvalRequired: boolean

  executionPlan: {
    step: string
    service: string
  }[]

  explanation?: string
}
```

### Scope

```text
PROJECT
STORY
CHARACTER
WORLD
SCENE
SHOT
AUDIO
VISUAL
BRAND
OUTPUT
```

### Core principle

Every directive produces:

```text
CHANGE
+
PRESERVE
```

### Minimal-impact principle

Change the smallest meaningful scope necessary to satisfy the creator.

---

# 16. Phase 8 — Impact Analysis & Semantic Refinement

Create:

```text
creative/director/
├── service.ts
├── interpreter.ts
├── resolver.ts
├── impact.ts
├── preservation.ts
├── executor.ts
└── types.ts
```

Example:

> Make her more confident.

should resolve to:

```text
Affected:
character state
performance
dialogue delivery
relevant scenes

Preserve:
identity
wardrobe
world
story premise
approved decisions
```

### Impact levels

```text
NONE
LOCAL
MULTI_SCENE
PROJECT
OUTPUT
```

### Example

| User direction | Expected impact |
|---|---|
| Warm the lighting | Local |
| Make character more confident | Multi-scene |
| Change ending | Project |
| Change aspect ratio | Output |
| Change narration timing | Multi-scene/output |

---

# 17. Phase 9 — Review & Creative Judgment

**Goal:** Turn the existing CreativeCritic into an actionable creator-facing review system.

Existing analytical infrastructure remains underneath.

New layer:

```text
ReviewService
    ↓
CreativeCriticAdapter
    ↓
Human-readable findings
```

Categories:

```text
STORY
CHARACTER
WORLD
VISUAL
AUDIO
CONTINUITY
PACING
TECHNICAL
```

Do not primarily expose numeric critic scores.

Instead:

> **Character**

> Her appearance remains consistent, but her emotional transition between scenes 3 and 4 is abrupt.

Actions:

```text
KEEP
FIX
REVIEW
```

### Review finding

```ts
type ReviewFinding = {
  id: string
  category: ReviewCategory
  description: string
  affectedEntities: EntityReference[]
  suggestedAction?: string
}
```

Review findings must be consumable by the Director.

---

# 18. Phase 10 — Versioning

Meaningful creative changes create versions.

```text
Version 1
Original
    ↓
Version 2
More confident protagonist
    ↓
Version 3
Hopeful ending
```

Do not overwrite creative history.

### Proposed models

```text
CreativeVersion
CreativeDirective
```

A version stores enough semantic state to reconstruct the creative state.

A directive records why the state changed.

---

# 19. Phase 11 — Approval

Approval is version-specific.

```text
Version 2
    ↓
Approved
```

A meaningful subsequent creative change invalidates approval for affected outputs.

Safety approval and creative approval remain separate.

---

# 20. Phase 12 — Outputs

One creative should support multiple outputs.

```text
MASTER
16:9
9:16
1:1
60 sec
30 sec
15 sec
Social
Cinema
Presentation
```

Outputs should derive from a creative version rather than becoming independent projects.

---

# 21. Phase 13 — Series & Persistent Creative Universes

Only after the single-project loop is proven.

Structure:

```text
Series
 └── Episode
      └── Project
```

Memory hierarchy:

```text
Series Canon
    ↓
Character Memory
    ↓
World Memory
    ↓
Episode State
```

Series capabilities:

- episodic structure
- long-term character state
- world continuity
- spinoffs
- cliffhangers
- canon
- continuation

The existing roadmap already calls for Season → Episode → Act → Scene and persistent series memory. Introduce additional hierarchy only when product behavior requires it.

---

# 22. Phase 14 — Professional Studio

Studio layer:

```text
Studio
├── Brands
├── Products
├── Campaigns
├── Characters
├── Worlds
├── Assets
└── Outputs
```

Capabilities:

- Brand DNA
- reusable product intelligence
- reusable characters
- reusable worlds
- campaign variations
- asset provenance
- output variations

---

# 23. R16 / Education

R16 is a persistent safety/audience capability, not a separate technical product.

The experience should hide:

- advanced prompting
- providers
- model selection
- credits
- raw JSON

while enforcing:

- restricted routing
- child-safe filtering
- age-appropriate creative direction
- educational workflows

The original roadmap explicitly defines restricted model routing, child-safe filtering and educational modules. Preserve these as underlying capabilities.

---

# 24. Database Migration Order

Do not create the final database schema in one migration.

### Migration 001

```text
CreativeProject
CreativeBrief
CreativeBible
CreativeMemory
```

### Migration 002

```text
CreativeSeries
CreativeEpisode
CreativeProject.seriesId
```

### Migration 003

```text
CreativeVersion
CreativeDirective
```

### Migration 004

```text
CreativeReviewRun
CreativeReviewResolution
```

### Migration 005

```text
CreativeOutput
CreativeOutputVariant
```

Only introduce each model when its behavior is ready.

---

# 25. Feature Flags

Centralize all 5.0 flags:

```text
RAIVSTREAM_5_ENABLED
RAIVSTREAM_5_CREATE_ENABLED
RAIVSTREAM_5_INTENT_ENABLED
RAIVSTREAM_5_BIBLE_ENABLED
RAIVSTREAM_5_PREVIEW_ENABLED
RAIVSTREAM_5_PRODUCTION_ENABLED
RAIVSTREAM_5_DIRECTOR_ENABLED
RAIVSTREAM_5_REVIEW_ENABLED
RAIVSTREAM_5_STUDIO_ENABLED
```

Recommended rollout:

```text
Stage 1
CREATE + INTENT

Stage 2
BIBLE

Stage 3
PREVIEW + PRODUCTION

Stage 4
DIRECTOR

Stage 5
REVIEW

Stage 6
STUDIO
```

---

# 26. Frontend Architecture

Target:

```text
apps/web/src/
├── app/
│   ├── create/
│   │   └── page.tsx
│   └── projects/
│       └── [projectId]/
│           └── page.tsx
│
└── components/creative/
    ├── CreativeShell.tsx
    ├── ProjectHeader.tsx
    ├── ProjectSidebar.tsx
    ├── CreativeCanvas.tsx
    ├── CreateHero.tsx
    ├── CreativeInput.tsx
    ├── IntentSuggestions.tsx
    ├── InterpretationPanel.tsx
    ├── CreativeBriefView.tsx
    ├── CreativeBibleView.tsx
    ├── CharacterCard.tsx
    ├── WorldCard.tsx
    ├── SceneCard.tsx
    ├── PreviewPanel.tsx
    ├── DirectorPanel.tsx
    ├── ReviewPanel.tsx
    ├── NextActionCard.tsx
    └── ApprovalBar.tsx
```

Desktop:

```text
Sidebar
    +
Creative Canvas
    +
Persistent Director
```

Mobile:

```text
Create
 ↓
Review
 ↓
Direct
 ↓
Approve
```

---

# 27. Workspace State

The workspace should always have:

```text
Current Project
Current Version
Current View
Selected Entity
Next Action
Review State
Approval State
```

Do not let individual components independently reconstruct project state.

---

# 28. NextAction System

Raivstream should always know what the creator should do next.

Examples:

```text
UNDERSTAND_INTENT
BUILD_BIBLE
REVIEW_PLAN
APPROVE_PREVIEW
PRODUCE
REVIEW_OUTPUT
DIRECT
APPROVE_OUTPUT
EXPORT
```

This should be a backend-derived state, surfaced by the frontend.

---

# 29. Testing Strategy

## Unit tests

Test:

- intent parsing
- question selection
- Bible merging
- directive parsing
- entity resolution
- impact calculation
- preservation
- versioning
- approval invalidation
- next action

## Integration tests

Test:

```text
Intent
 ↓
Intelligence
 ↓
Bible
 ↓
Production Plan
 ↓
Preview
```

## Golden journeys

### Storyteller

> Create a 5-minute photorealistic short film about a young Nigerian woman returning home after 10 years abroad and confronting her mother.

### Educator

> Create a 3-minute lesson explaining photosynthesis to eight-year-olds.

### Commercial

> Create a 60-second cinematic commercial for a new Nigerian premium skincare brand. Make it feel luxurious, confident and modern.

### Ambiguous

> Make a beautiful video about a woman in Lagos.

### Direct

> Make her more confident.

### Preserve

> Keep everything except the wardrobe.

### Explore

> Give me three different endings.

---

# 30. Non-Goals

Do not turn 5.0 into:

- a full NLE
- a generic project-management application
- a prompt marketplace
- a template marketplace
- a technical model playground
- a provider comparison tool
- a manual shot-grid editor
- a JSON editor
- a manual continuity-management system
- a feature-count competition

Advanced controls can exist later under progressive disclosure.

---

# 31. Protected Existing Code

Avoid rewriting large existing modules without a concrete reason.

In particular:

```text
packages/api/src/routers/story.ts
packages/api/src/lib/productionStructurer.ts
packages/api/src/lib/sequencePlanning.ts
packages/api/src/lib/creativeCritic/*
packages/api/src/lib/lastFrameExtract.ts
packages/api/src/lib/promptEnhancerService.ts
```

Use adapters first.

---

# 32. Golden Product Test

The following experience defines whether the architecture is correct:

> “Create a 60-second cinematic commercial for a new Nigerian premium skincare brand. Make it feel luxurious, confident and modern.”

Expected:

```text
/create
 ↓
Interpretation
 ↓
Commercial Intelligence
 ↓
Creative Brief
 ↓
Creative Bible
 ↓
Production Plan
 ↓
Preview
 ↓
Approve
 ↓
Existing Production Engine
 ↓
Review
 ↓
Direct
 ↓
New Version
```

No:

- JSON
- provider selection
- model selection
- prompt editing
- manual camera configuration
- manual I2V/V2V setup
- manual continuity management

---

# 33. 5.0 Completion Gates

Raivstream 5.0 is complete when a creator can:

### Describe

Explain what they imagine naturally.

### Be understood

Raivstream correctly interprets the meaningful intent.

### Direct

Change the creative result semantically.

### Plan

Receive a coherent production plan.

### Produce

Generate a multimodal result.

### Review

Understand what is working and what needs attention.

### Refine

Change the work without technical production knowledge.

### Preserve

Keep previous creative decisions intact.

### Explore

Create alternatives without destroying the original.

### Approve

Explicitly approve meaningful creative states.

### Remember

Have important decisions persist.

### Output

Create multiple deliverables from one creative.

---

# 34. Implementation Order

The recommended implementation sequence is:

```text
0. Feature flag foundation
        ↓
1. Creative Project / Brief / Bible / Memory
        ↓
2. /create
        ↓
3. Intent Engine
        ↓
4. Story / Education / Commercial Intelligence
        ↓
5. Creative Bible
        ↓
6. Production Plan Adapter
        ↓
7. Preview
        ↓
8. Production Service integration
        ↓
9. Continuity
        ↓
10. Review Service
        ↓
11. AI Director
        ↓
12. Impact Analysis
        ↓
13. Semantic Refinement
        ↓
14. Versioning
        ↓
15. Approval
        ↓
16. Outputs
        ↓
17. Series
        ↓
18. Studio
```

---

# 35. First Vertical Slice

The first slice should be deliberately narrow:

```text
/create
   ↓
Intent
   ↓
Creative Brief
   ↓
Creative Bible
   ↓
Production Plan
   ↓
Preview
```

Do not start by building every feature in the roadmap.

**Build the creative loop first.**

Once this slice is stable, connect the existing generation engine.

---

# 36. Post-5.0 Backlog

Defer:

- collaboration
- teams
- comments
- client approvals
- enterprise administration
- marketplace
- creator marketplace
- advanced NLE
- advanced camera timeline
- fine-grained keyframe editor
- autonomous multi-agent filmmaking
- autonomous campaign management
- extensive agency management

These can follow the core creative operating system.

---

# 37. Final Architecture

```text
                         RAIVSTREAM 5.0
                              │
                              ▼
                       USER INTENT
                              │
                              ▼
                       INTENT ENGINE
                              │
                              ▼
                 CREATIVE INTELLIGENCE
                    /        |        \
                 Story   Education   Commercial
                    \        |        /
                              ▼
                      CREATIVE BIBLE
                              │
                              ▼
                       AI DIRECTOR
                    /        |        \
                Direct    Explore    Review
                              │
                              ▼
                      PRODUCTION PLAN
                              │
                              ▼
                       CONTINUITY
                              │
                              ▼
                  MULTIMODAL PRODUCTION
                              │
                              ▼
                         OUTPUT
                              │
                              ▼
                          REVIEW
                              │
                              ▼
                       REFINEMENT
                              │
                              ▼
                         VERSION
                              │
                              ▼
                         APPROVAL
                              │
                              ▼
                         MEMORY
                              │
                              └──────────────► CREATE AGAIN
```

---

# 38. Final Product Promise

> **Tell Raivstream what you imagine. It figures out how to make it.**

The technology underneath may involve sophisticated narrative engines, visual bibles, audio timing, I2V chaining, last-frame continuity, restyling, camera effects and FFmpeg assembly. The creator should experience those capabilities as **intelligent behavior**, not as a technical workflow.
