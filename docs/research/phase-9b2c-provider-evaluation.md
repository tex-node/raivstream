# Phase 9B.2C — Voice Provider Evaluation

Research + controlled benchmark. No production integration. No production pricing.
No Phase 9B.2C.2 implementation. See companion files:
[phase-9b2c-provider-scorecard.csv](phase-9b2c-provider-scorecard.csv),
[phase-9b2c-provider-cost-model.csv](phase-9b2c-provider-cost-model.csv),
[phase-9b2c-provider-latency.csv](phase-9b2c-provider-latency.csv),
[phase-9b2c-openai-benchmark-manifest.json](phase-9b2c-openai-benchmark-manifest.json).

## 1. Methodology

Two evidence tiers, kept explicitly separate throughout:

1. **Documentation-sourced facts** — pricing, terms of service, privacy policy, voice
   cloning/consent policy, language/voice catalogs. Drawn from official provider
   sources wherever possible (pricing pages, docs, ToS, privacy policy), with
   third-party sources used only to supplement and never to override an official
   term. Every claim below is either footnoted with its source or explicitly marked
   `LEGAL REVIEW REQUIRED` / unconfirmed.
2. **Real API measurement** — this environment holds credentials for exactly one
   provider (`OPENAI_API_KEY`, already provisioned on isolated staging for other
   product features, not TTS-specific). A capped, spend-bounded benchmark
   (`packages/api/scripts/phase9b2c-provider-benchmark-openai.ts`) ran 10 real
   `tts-1` requests plus a 3-way concurrency probe, real ffprobe-validated, for a
   total measured cost of **$0.01356**. Every other named provider's live-testing
   sections (latency, reliability, technical audio inspection, concurrency,
   quality/continuity listening) are marked `NOT EXECUTED — CREDENTIALS UNAVAILABLE`
   per the brief's own explicit instruction not to fabricate results.

**What was NOT done, and why:** voice-quality, expressiveness, character-continuity,
Nigerian/African pronunciation authenticity, and multilingual-fluency scoring all
require a human listening panel — an AI text model cannot perceive audio the way a
human evaluator does. No such panel was convened this round. Every dimension that
depends on listening is marked `NOT HUMAN-VERIFIED` in the scorecard rather than
assigned a fabricated 1–5 score. This is the single largest evidence gap in this
report and directly shapes the final verdict (§40 below, and Report §26).

## 2. Candidate discovery (Section 1)

Researched the 8 named candidates plus a market sweep for newer credible entrants.

| Provider | Status | Why |
|---|---|---|
| ElevenLabs | SHORTLIST | Mature API, broadest expressive-control surface, explicit "African accent" voice category, published commercial terms. |
| OpenAI | SHORTLIST | Only provider with credentials here; real benchmark completed; simple REST API; cheapest of the shortlist per character. |
| Cartesia | SHORTLIST | Fastest published latency in the category; SOC2/HIPAA; real-time streaming architecture (state-space model, not diffusion/autoregressive). |
| Google Cloud Text-to-Speech | SHORTLIST | Largest documented voice/language catalog; cheapest cloud-vendor list pricing; strong data-governance defaults. |
| Microsoft Azure AI Speech | SHORTLIST | **Only provider found with an officially-labeled Nigerian English (en-NG) voice pair** — directly relevant to Raivstream's stated Nigerian-market requirement. |
| Amazon Polly | SHORTLIST | Cheapest overall list pricing; explicit no-retention statement; but no voice cloning and no African/Nigerian locale found. |
| PlayHT | **EXCLUDE** | **Discontinued.** Meta acquired the PlayAI team in July 2025; the API went offline by late July 2025; Play.ht ceased operating December 31, 2025. Not a viable candidate regardless of any historical score. |
| Resemble AI | SECONDARY | Simple per-second pricing, no subscription minimum, distinctive cross-lingual voice-cloning claim (51+ languages, accent-preserving). |
| Deepgram Aura-2 | WATCHLIST | Newer entrant, sub-200ms published latency, ~$30/1M chars; not deep-researched this round. |
| Rime AI | WATCHLIST | Newer entrant, unusually broad demographic/accent voice diversity (200+ voices); official pricing not confirmed from a primary source — flagged, not scored on cost. |

Full dimension-by-dimension scorecard: [phase-9b2c-provider-scorecard.csv](phase-9b2c-provider-scorecard.csv).

## 3. Benchmark corpus actually used

The full 15-class x 8-provider matrix the brief describes requires credentials this
environment does not have for 7 of the 8 named providers. What was actually
exercised, against OpenAI only, real and measured:

`CINEMATIC_NARRATOR`, `ADULT_CHARACTER_DIALOGUE` (calm), `HIGH_ENERGY_CHARACTER`
(excited + tense/urgent), `QUIET_EMOTIONAL_CHARACTER` (reflective),
`NIGERIAN_ENGLISH` (place-name-bearing sentence), `DIFFICULT_NAMES_PLACES` (Lagos,
Abeokuta, Akure, Mambilla, Ijeshatedo), `LONG_PARAGRAPH`, `FAST_SHORT_LINE`,
`TWO_PERSON_CONVERSATION`. Exact text is in the harness script and the manifest.
This is a reduced, capped subset of the brief's 15 classes and Section 5 corpus —
sufficient to validate the harness and get real latency/cost/technical-audio
numbers for one provider, not sufficient to claim full coverage.

## 4. Voice quality / expressiveness / continuity (Sections 3.A–C, 7, 27–29)

`NOT HUMAN-VERIFIED` for every provider. No blind listening panel was convened; no
pairwise comparisons were run. This is a real gap, not a rounding error — three of
the highest-weighted scorecard dimensions (voice quality, expressiveness,
continuity — 15%+10%+12% = 37% of the proposed weighting in §43) have no evidence
behind them for any provider. Recommended remediation before a primary-provider
decision: a follow-up pass with (a) trial/paid credentials for at least ElevenLabs,
Cartesia, and Azure, (b) a real 10-generations-per-character continuity run per
Section 7, and (c) at least 3 human listeners per Section 27.

## 5. Nigerian / African voice evaluation (Section 8)

This is the one dimension where documentation alone produced a real, decisive,
sourced finding:

- **Azure AI Speech** is the only shortlisted provider with an **officially
  provider-labeled Nigerian English locale** (`en-NG`), with two named neural
  voices: `en-NG-EzinneNeural` (female) and `en-NG-AbeoNeural` (male). This is
  native/provider-labelled coverage in the sense Section 8 asks us to distinguish
  — not a generic international voice attempting Nigerian text.
- **ElevenLabs** markets an "African accent" text-to-speech category with
  individual community/marketplace voices labeled Nigerian-accented (e.g.
  "Olufunmilola — Nigerian Accent - Yoruba", "NZ The African Man - Nigerian Voice
  Pro") and lists several African languages (Hausa, Igbo, Lingala, Somali,
  Swahili) among its 70+ supported languages. This is a real, notable capability,
  but it is voice-library/marketplace-sourced rather than a first-party locale the
  way Azure's `en-NG` is — the distinction Section 8 explicitly asks us to draw.
- **Google Cloud, Amazon Polly, Cartesia, Resemble, OpenAI**: no African-locale or
  Nigerian-accent voice was found in official documentation during this pass.
  Absence of evidence is not proof of absence — Google's 300+ voice catalog in
  particular was not exhaustively enumerated — but nothing surfaced.
- **Pronunciation of the required place-name/personal-name test set** (Lagos,
  Abuja, Abeokuta, Akure, Ibadan, Ijesha, Mambilla, Enugu, Owerri, Kaduna) was
  exercised only against OpenAI (`difficult-names` test case in the real
  benchmark — real audio was generated, real file exists at
  `.provider-benchmark-output/openai/difficult-names.wav` on the staging host).
  **Whether the pronunciation was actually correct is `NOT HUMAN-VERIFIED`** — the
  file exists and passed the technical READY gate (real audio, non-zero, valid
  codec/duration), but correctness of pronunciation requires a human listener
  familiar with these names, which this evaluation did not have.

**Conclusion for this section only:** Azure is the current architecturally
strongest candidate specifically for the Nigerian-voice requirement, on
documentation evidence alone. This should not be read as a full continuity/quality
verdict — it is a locale-availability finding.

## 6. Multilingual evaluation (Section 9)

Language *catalog* coverage (documented, not fluency-tested):

- Google Cloud: 50+ languages, 300+ voices — largest documented catalog.
- Azure: 100+ languages per Microsoft's own claim; en-NG confirmed directly.
- ElevenLabs: 70+ languages (v3 model), 29 for the more production-stable
  Multilingual v2 model — note the brief's own trade-off: newer/broader language
  support versus older/more stable output.
- Amazon Polly: 60+ languages, 30+ voices.
- Cartesia, Resemble: both claim broad multilingual/cross-lingual support (51+
  languages for Resemble's cross-lingual cloning specifically).
- OpenAI: "50+ languages" per official docs, but voices are explicitly described
  as "currently optimized for English" — the only provider to flag this caveat
  directly in its own documentation.

Fluency, accent bleed, and named-entity handling in non-English languages: **NOT
HUMAN-VERIFIED** for every provider — no qualified evaluator for French, Spanish,
or Portuguese was available in this pass, and no non-English audio was generated
(the capped benchmark used English-only text). Per Section 9's own rule, this is
marked `NOT HUMAN-VERIFIED` rather than scored.

## 7. Technical audio quality (Section 10) — OpenAI only, real

From the real benchmark manifest (10/10 successful):

- Container/codec: WAV / `pcm_s16le` (uncompressed) for all 10 outputs.
- Sample rate: 24,000 Hz mono, consistently.
- Duration matched expected speech pacing (see §9 below — cost/duration
  cross-check).
- File sizes scaled linearly with duration as expected for uncompressed PCM
  (e.g. 315,044 bytes for 6.56s ≈ 48,024 bytes/sec ≈ the expected 24000Hz ×
  16-bit × mono rate of 48,000 bytes/sec, within rounding).
- No zero-byte or truncated files; every output passed the same
  `probeAudioAsset`-based gate Phase 9B.2C.1's own worker uses.
- Perceptual quality (clipping, breath artifacts, unnatural pauses beyond what
  duration/size can reveal): **NOT HUMAN-VERIFIED** — this requires listening,
  which did not occur.

No other provider was technically probed (no credentials).

## 8. Latency (Section 11) — OpenAI only, real; see [CSV](phase-9b2c-provider-latency.csv)

10-request batch (non-streaming `tts-1`, so TTCA only, no TTFA):
min 699ms, median 1472ms, p75 1829ms, p95 2672ms, max 2672ms. **Sample size 10, not
the brief's suggested 20 — label preliminary.** 3-way concurrency probe: all 3
succeeded, 1018/1069/1299ms, no visible degradation, no 429s, no timeouts.

Every other named provider: `NOT EXECUTED — CREDENTIALS UNAVAILABLE`. Vendor-
published or third-party-benchmarked latency figures surfaced during research
(Cartesia ~40ms vendor-claimed TTFA / ~166-190ms third-party-measured TTFA;
Deepgram Aura-2 sub-200ms; Rime Mist v2 ~70ms) are recorded in the CSV **for
context only**, explicitly labeled as not independently verified, and excluded
from any scoring.

## 9. Reliability (Section 13) — OpenAI only, real

10/10 requests succeeded (100%), 3/3 concurrent requests succeeded (100%), zero
429s, zero timeouts, zero 5xx, zero invalid/truncated media. **Sample size of 13
total requests is far too small to claim a production SLA** — this is explicitly a
preliminary signal, not a reliability guarantee. Every other provider: not tested.

## 10. API ergonomics / architectural fit (Sections 15, 30)

All investigated providers expose a simple synchronous or streaming REST endpoint
taking text + a voice identifier + optional style/format parameters, returning
audio bytes or a stream — this is a good structural match for the existing
`VoiceGenerationProvider.generateSpeech(request, context)` contract with no
coupling risk observed in any provider's *documented* API shape (real integration
code was not written for any provider besides the pre-existing dev fixture).

Neutral-field mapping (documentation-based, not implemented):

| Raivstream neutral field | OpenAI | Azure | Google Cloud | ElevenLabs | Cartesia |
|---|---|---|---|---|---|
| text | DIRECT | DIRECT | DIRECT | DIRECT | DIRECT |
| language | APPROXIMATE (voice is English-optimized; text-in-language works) | DIRECT (locale-scoped voices) | DIRECT (locale-scoped voices) | DIRECT (multilingual models) | APPROXIMATE |
| voice identity | DIRECT (voice name) | DIRECT (voice name) | DIRECT (voice name) | DIRECT (voice ID) | DIRECT (voice ID) |
| performance direction | APPROXIMATE (`gpt-4o-mini-tts` "steerable prosody" via natural-language instruction; `tts-1`/`tts-1-hd` NOT_SUPPORTED) | APPROXIMATE (SSML prosody/emphasis only — no natural-language style) | APPROXIMATE (SSML only) | DIRECT-ish (style/stability sliders + v3 natural-language "audio tags") | PROVIDER-SPECIFIC (emotion/laughter controls) |
| pace/energy | APPROXIMATE (SSML rate on some models) | DIRECT (SSML rate/pitch) | DIRECT (SSML rate/pitch) | APPROXIMATE (stability/style sliders) | PROVIDER-SPECIFIC |
| output format | DIRECT (mp3/opus/aac/flac/wav/pcm) | DIRECT (many formats) | DIRECT (many formats) | DIRECT | DIRECT (streaming-oriented) |
| sample rate | DIRECT (fixed per format, 24kHz observed for wav) | DIRECT (selectable) | DIRECT (selectable) | DIRECT (selectable) | DIRECT (selectable, real-time oriented) |

No provider examined requires leaking a proprietary model concept directly into
`AudioCue` — every mapping above stays adapter-internal, consistent with
Phase 9B.2C.1's architecture. See §16 (Section 51 equivalent) below for the
explicit core-validation answer.

## 11. Commercial rights (Sections 17–18)

| Provider | Generated-audio ownership | Notable caveat | Source status |
|---|---|---|---|
| OpenAI | Not explicitly separately documented as "you own it" in the fetched guide; standard OpenAI usage policy requires **disclosing AI-generated speech to end users**. | Custom-voice program requires a separate Supplemental Agreement and sales approval. | Official docs fetched. |
| ElevenLabs | You retain rights to output on any **paid** plan, per third-party legal-summary sources; free-tier output has no commercial license. | ElevenLabs holds a **perpetual, irrevocable, royalty-free license** to use submitted voice data/content to train/improve models (opt-out exists, but is forward-looking only — see §12). | `LEGAL REVIEW REQUIRED` — summarized from third-party legal-summary sites, not the primary ToS text itself; confirm directly against `elevenlabs.io/terms-of-use` before relying on this for a production decision. |
| Google Cloud | Customer retains ownership of uploaded data; Google retains ownership of models trained from opted-in logged data. | Data-logging is **opt-in**, off by default. | Official docs fetched. |
| Azure | Output ownership not independently confirmed this round. | Custom Neural Voice requires a **separate limited-access application/approval process** per Microsoft's standard Responsible AI gating for voice-cloning-adjacent features (not independently re-confirmed this round). | `LEGAL REVIEW REQUIRED`. |
| Amazon Polly | **"Your Polly output belongs to you"** per AWS's own service-terms language (as summarized in the AI Service Card). | Must have rights to any third-party input text. | Official/near-official source. |
| Cartesia | Not independently confirmed this round. | Voice cloning ToS explicitly prohibits cloning a deceased person, a political candidate, or anyone without consent. | `LEGAL REVIEW REQUIRED` for output-ownership specifically. |
| Resemble | Not independently confirmed this round. | — | `LEGAL REVIEW REQUIRED`. |

**No provider's rights terms were found to be an outright hard disqualifier** on
the evidence gathered — but several cells above say `LEGAL REVIEW REQUIRED`
precisely because a third-party summary is not the same as reading the primary
contract, and a production licensing decision should not rest on a summary site.

## 12. Voice cloning / consent policy (Section 19)

- **ElevenLabs**: explicit policy — no voices from anyone under 18 may be
  uploaded/cloned at all; child-like voices are barred from the public Voice
  Library; service access itself requires 13+ (parental consent 13–18); cloning
  another identifiable person without consent or legal right is explicitly
  prohibited, including deceptive "not AI-generated" framing.
- **Cartesia**: users may only submit their own voice or a voice they have
  explicit consent for; cloning a deceased person, a political candidate, or any
  other person without express permission is explicitly prohibited; retains
  voice-clone source samples only for as long as needed to deliver the cloning
  feature (even under Zero Data Retention, which otherwise deletes everything).
- **OpenAI**: custom voice cloning is **not self-serve** — "limited to eligible
  customers," requires sales contact, capped at 20 voices/org, 30-second sample
  max. This structurally limits abuse surface but also means it cannot be
  evaluated or integrated without a direct OpenAI sales relationship.
- **Resemble**: offers both "Rapid" (10-second sample) and "Professional"
  (10–25+ minute sample) cloning tiers as paid monthly add-ons; consent-specific
  policy language was not independently confirmed this round —
  `LEGAL REVIEW REQUIRED`.
- **Google Cloud, Amazon Polly**: no self-serve voice cloning offered at all in
  the standard product (Azure's Custom Neural Voice is the closest cloning-
  adjacent feature among the cloud vendors, gated behind Microsoft's own
  Limited Access application process).

**No cloning was performed in this evaluation.** No real person's voice was
uploaded to any provider. This section is documentation-only, as instructed.

## 13. Privacy / data retention (Section 20)

| Provider | Default retention | Training use | Opt-out / ZDR |
|---|---|---|---|
| OpenAI (API) | Up to 30 days, then deleted (legal holds excepted) | **Not used for training by default**; requires explicit opt-in | Zero Data Retention available for qualifying enterprise use cases, per-endpoint, prior approval required |
| ElevenLabs | 2 years (general data), 3 years (voice/biometric data) per third-party summary | Used for training unless the customer opts out via account settings | Zero Retention Mode exists for **enterprise, API-only** (not the web UI/playground) |
| Google Cloud TTS/STT | No logging by default | Only if customer **opts in** to the data-logging discount program; even then, restricted to authorized personnel, not used to target ads | Opt-out ("Disable data logging") available once opted in |
| Cartesia | Optional Zero Data Retention (blocks storage/logging/training of all customer content) | Off under ZDR | ZDR has a **narrow carve-out**: voice-clone source samples may still be retained "reasonably necessary to deliver the voice cloning functionality" even under ZDR |
| Amazon Polly | AWS states Polly does not retain text input or audio output content at all | Not documented as used for training | N/A — no retention to opt out of, per AWS's own statement |

Every retention figure above except Amazon Polly's and OpenAI's own documented
statement is sourced from third-party summaries of provider policy pages, not the
primary document itself — flagged `LEGAL REVIEW REQUIRED` in spirit even where not
explicitly tagged, and should be re-confirmed against the primary privacy
policy/DPA before any production data-handling decision.

## 14. R16 / child-safety implications (Section 21)

No R16 integration occurred or is proposed here. Risk note for future architecture:
ElevenLabs' explicit under-18 voice-upload prohibition is the most directly
relevant precedent found — it establishes that at least one major vendor treats
minor voice data as categorically higher-risk, which supports Raivstream's own
existing R16 server-side denial (Phase 9B.2C.1 §23/§10 above) remaining in place
regardless of which provider is eventually selected. No vendor's terms were found
to specifically permit synthetic child-character voices without qualification.
`LEGAL / POLICY REVIEW REQUIRED` before any child-character voice feature is
designed, independent of provider choice.

## 15. Content moderation (Section 22)

Not deep-researched this round beyond what surfaced incidentally (e.g. OpenAI's
"Sky" voice removal after a 2023 public complaint about voice likeness, illustrating
that vendor-side moderation/removal of a *voice* — not just content — is a real,
precedented risk class independent of Raivstream's own moderation). No adversarial
testing was performed, per the brief's explicit prohibition.

## 16. Cost model (Sections 23–26) — see [cost-model CSV](phase-9b2c-provider-cost-model.csv)

**Reference speech rate**: derived from the real OpenAI benchmark rather than an
assumption — the 10 real generations averaged **~1,000 characters per minute of
audio** (measured range ~959–1,033 chars/min across narration/dialogue/long-
paragraph text). This rate is used to convert every provider's published
$/1M-characters price into $/minute in the CSV.

**Cross-check**: OpenAI's real measured cost ($0.01356 for 54.09s of real audio =
$0.01504/min) landed within 0.3% of the theoretical $15/1M-chars-at-1000-chars/min
figure ($0.0150/min) — the measured-vs-theoretical methodology the brief asks for
checks out on the one provider it could be checked on.

**Headline $/minute across the shortlist** (theoretical list price, mid-tier where
a range exists):

| Provider | Tier | $/minute |
|---|---|---|
| Amazon Polly | Standard | $0.004 |
| Google Cloud | Standard/WaveNet | $0.004 |
| Cartesia | Sonic, low end of range | $0.005 |
| OpenAI | tts-1 | **$0.015 (real, measured)** |
| Amazon Polly | Neural | $0.016 |
| Azure | Neural | $0.016 |
| Google Cloud | Neural2 | $0.016 |
| Deepgram Aura-2 | pay-as-you-go | $0.030 |
| Amazon Polly | Generative | $0.030 |
| Resemble | Flex pay-as-you-go | $0.030 |
| Cartesia | Sonic, high end of range | $0.037 |
| Amazon Polly | Long-Form | $0.100 |
| ElevenLabs | Pro (subscription-amortized) | $0.165 |
| ElevenLabs | Creator (subscription-amortized) | $0.182 |
| Google Cloud | Studio | $0.160 |

ElevenLabs is **~10x the cost per minute** of the cloud-vendor neural tiers
(Azure/Google/Polly) at published subscription-amortized rates — a materially
larger economic gap than voice-quality differences alone are likely to justify
without a listening-verified quality edge, which this evaluation does not yet
have (§4).

### Regeneration economics (Section 25)

Using the brief's own worked example — a 10-minute story, average 2.4 generations
per accepted cue — and assuming (conservatively) the *entire* 10 minutes is speech:

| Tier example | $/min | Naive 1x cost | Effective cost @ 2.4x regen |
|---|---|---|---|
| Cloud-vendor neural (Azure/Google/Polly ~$0.016/min) | $0.016 | $0.16 | **$0.384** |
| Mid tier (Cartesia high-end/Resemble/Deepgram ~$0.03/min) | $0.030 | $0.30 | **$0.72** |
| ElevenLabs (subscription-amortized ~$0.17/min) | $0.170 | $1.70 | **$4.08** |
| OpenAI tts-1 (real measured $0.015/min) | $0.015 | $0.15 | **$0.36** |

### Story-level economics (Section 26)

Speech-minutes are the brief's own stated split per archetype; regeneration factor
applied at 2.4x throughout:

| Story | Total film | Speech min | Cloud-neural tier cost | Mid tier cost | ElevenLabs tier cost |
|---|---|---|---|---|---|
| A. Short | 5 min | 2 min | $0.077 | $0.144 | $0.816 |
| B. Standard | 10 min | 5 min | $0.192 | $0.360 | $2.040 |
| C. Dialogue-heavy | 10 min | 8 min | $0.307 | $0.576 | $3.264 |
| D. Long | 30 min | 15 min | $0.576 | $1.080 | $6.120 |

All figures are provider expense **before margin** and **before any Raivstream
credit price** — no customer-facing price is proposed anywhere in this report, per
the phase boundary.

## 17. Lock-in analysis (Section 32)

| Provider | Risk | Why |
|---|---|---|
| ElevenLabs | MEDIUM | Voice IDs are provider-specific and not portable; premium style/stability controls have no cross-vendor equivalent; but text-in/audio-out shape is standard. |
| Azure Custom Neural Voice | HIGH | Trained custom voices are not exportable to another vendor; large sunk training cost per voice; Microsoft's Limited Access gating adds process lock-in. |
| Cloud-vendor stock voices (Google/Azure/Polly, non-custom) | LOW | Interchangeable REST shape, no cloning investment to strand, easy to re-point the adapter. |
| Cartesia, Resemble, OpenAI (stock voices) | LOW–MEDIUM | Simple API shape; any invested voice-clone assets would not be portable, but none were created here. |

## 18. Fallback / outage / voice-pinning (Sections 31, 33, 47–48)

Recommend distinguishing, as the brief requires:

- **Infrastructure failover** (keep generation *functioning* by switching
  providers) is straightforward given the existing provider-neutral contract —
  any shortlisted provider can serve as a mechanical substitute.
- **Voice identity failover** (the *same character* sounding the same on a
  different provider) is **not achievable today** with any combination
  evaluated — no two providers share a voice ID space, and no cross-provider
  voice-matching capability was found. A character recast on provider failover
  would be an audible, noticeable change.
- Recommended posture (not implemented): **PRIMARY + MANUAL FALLBACK** for now.
  Automatic infrastructure fallback is reasonable for *unassigned* new cues;
  automatic fallback for an *established recurring character's* voice should be
  disabled by default and require explicit user/admin action, given the identity-
  failover gap above.
- Recommended voice pinning (not implemented): persist `providerKey` +
  `providerVoiceKey` + a provider model/version marker per `VoiceProfile`, so a
  project can reliably regenerate the same character months later even if the
  provider's own default voice roster changes.

## 19. Provider-neutral core validation (Section 51)

| Question | Answer |
|---|---|
| Can all shortlist providers map into `VoiceGenerationProvider`? | Yes — every provider examined exposes text-in/audio-out over REST with a voice identifier and optional style controls; no structural blocker found. |
| Can provider-specific controls remain adapter-internal? | Yes — see the mapping table in §10; nothing examined requires a new field on `AudioCue`/`VoiceProfile` to *function*, only to *persist identity* (see below). |
| Is the immutable request snapshot sufficient? | Yes for generation. Not evaluated against a genuinely multi-turn/conversational provider mode (none of the shortlisted providers require that for single-cue speech generation). |
| Is fingerprint identity sufficient? | Yes, unchanged. |
| Can generated results remain normal AudioAssets? | Yes, unchanged — every provider returns raw audio bytes compatible with the existing `probeAudioAsset` gate. |
| Can provider identity remain generation metadata rather than Film Blueprint state? | Yes, unchanged. |

**Conclusion: do not modify the Phase 9B.2C.1 core.** The one *real* gap surfaced
is not architectural — it's the missing persistent-voice-identity fields needed for
reliable recast/continuity across time, addressed in §50/Report §33 as
`RECOMMENDED`, not `REQUIRED`, and explicitly not implemented here.

## 20. Known limitations of this evaluation

1. Real API testing occurred for **one provider only** (OpenAI), because credentials
   for the other seven exist nowhere in this codebase or staging environment.
2. **No human listening panel** was convened — voice quality, expressiveness,
   character continuity, and pronunciation-correctness (including the Nigerian
   place-name set) are all `NOT HUMAN-VERIFIED`.
3. Several commercial-rights and privacy cells are sourced from third-party legal-
   summary sites rather than primary contract text, flagged `LEGAL REVIEW
   REQUIRED`.
4. The benchmark corpus actually exercised is a reduced subset of the brief's full
   15-class matrix (10 cases, English only, one provider).
5. Rime AI's cost basis could not be confirmed from a primary source and is
   explicitly not used in any economic comparison.
6. This report's cost model uses one measured speech rate (~1,000 chars/min) as a
   cross-provider constant; actual per-provider pacing will vary by voice and
   language and was only independently measured for OpenAI.
