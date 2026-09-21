# ADR-002 — MiniMax H3 transport: fal.ai queue vs direct MiniMax API

**Status:** Accepted (fal queue for the current transport; direct MiniMax tracked as a
follow-up probe)
**Date:** 2026-09-21
**Phase:** 16.3 (MiniMax H3 native-audio video generation)

## Context

Phase 16 targets MiniMax H3 scene video with native synchronized audio/SFX, durations up
to 15s, and resolutions up to 1080P @ 24 FPS. Two transports are possible:

1. **fal.ai queue** (`minimax/h3-max-turbo/image-to-video`, or the non-turbo
   `minimax/h3-max/image-to-video` when it supports the target duration/resolution).
2. **Direct MiniMax API** (`https://api.minimax.io/v1/video_generation` or the group-based
   `https://api.minimax.io/v1/text_to_video`/`image_to_video` family).

## Decision

**Keep the fal.ai queue as the default MiniMax transport.**

Rationale:

- **Proven:** `minimax/h3-max-turbo/image-to-video` is already live-proven in this
  codebase (contract validation + staged flow + Gate D batch). Outputs are 9:16 / 16:9
  with an embedded aac audio track — i.e. native audio already passes through the fal path.
- **Infra reuse:** polling adapters, webhook (ED25519 + idempotent `CreditOperation`
  refund outbox), provider-side cancellation, R2 mirroring, provider rate limiting, and
  the capability registry all already exist for the fal adapter. A direct MiniMax path
  would duplicate jobs/errors/billing/storage handling (the exact anti-pattern this
  roadmap exists to avoid).
- **Cost/ops:** one billing surface, one webhook contract, fail-closed switches already in
  place.

**Constraints recorded:**
- **Live-verified 2026-09-21 on the Turbo endpoint:** `duration: 15` + `resolution: 1080P`
  → completed; output 15.1s, h264 **1080×1920 @ 24fps**, embedded **aac** audio. Resolution
  enum is `480P | 768P | 1080P` (uppercase; `1080p` → 422). Duration 10 and 15 both verified.
  The full Phase-16.3 target (15s / 1080P / native audio / first-frame i2v) is met on the
  fal Turbo transport — **no non-turbo or direct-MiniMax fallback is currently required.**
- **Native audio** on MiniMax H3 is driven by SFX cues in the prompt (Stage-2 structurer
  already mandates them) — no separate audio param is required; the mixer (Movie Builder)
  decides whether to keep MiniMax ambient audio vs ElevenLabs VO.

## Consequences

- 16.3 extends the existing `H3_MAX` fal contract/adapter (resolution preset passthrough,
  duration cap raised, first-frame i2v) rather than adding a provider.
- If the 15s/1080P target cannot be met on the Turbo endpoint, the non-turbo fal model or
  direct MiniMax API is evaluated with a bounded live probe before any change; the ADR is
  then updated.