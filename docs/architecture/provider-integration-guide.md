# Provider Integration Guide

How to add a new media provider (image / video / UGC) to Raivstream behind the
unified provider layer, without touching core story/generation logic.

See `docs/architecture.md` for the layer overview and `docs/product_roadmap.md` §7 for the capability taxonomy.

## 1. Capability taxonomy

The unified layer currently serves three capabilities, mapped to `MediaKind`:

| Capability | `MediaKind` | `ModelContract.kind` | Example |
|---|---|---|---|
| Image generation | `image` | `image` | `fal-ai/flux-2` |
| Image-to-video | `video` | `video` | `minimax/h3-max-turbo/image-to-video` |
| Talking-person / lip-sync | `ugc_video` | `ugc_video` | `veed/fabric-1.0` |

Planned (not yet served — do not add dead adapters until a provider is selected):

- `IMAGE_EDITING` (e.g. `fal-ai/flux-2/edit`)
- `TEXT_TO_VIDEO`
- `TEXT_TO_SPEECH` / `AUDIO_MIXING` / `CAPTIONING` / `VIDEO_ASSEMBLY`

Adding a new *kind* means extending `MediaKind` in `mediaProviders/types.ts`, the `ProviderCapabilityKind` in `mediaProviders/registry.ts`, and a corresponding provider method on `MediaProvider` (`image` / `video` / `ugc` — or a new one).

## 2. Steps to add a provider

1. **Contract** — in `mediaProviders/fal/contracts.ts` (or a new `<provider>/contracts.ts`), define the endpoint + input/output shapes and the normalized↔provider mappers (`toXInput`, `parseXOutput`). Reconcile against the live schema before enabling.
2. **Adapter** — implement `submit`/`getStatus`/`cancel` against the provider SDK (or `@fal-ai/client` queue API), returning a `MediaJobRef`. Keep provider shapes inside the adapter; mirror output to R2.
3. **Registry** — add the provider to `mediaProviders/registry.ts` (`ProviderId`, a `*Health(env)` builder). Report `configured`/`enabled`/`reason` from env presence + gates only — never a credential value.
4. **Dispatcher** — in `lib/generators/index.ts`: extend `SupportedModel`, add `submit`/`poll` cases, add a `cancel` case to `cancelProviderJob`, and a `MODEL_META` entry.
5. **Credits** — add a `generate:<model>` entry to `MODEL_FEATURE_KEY` (`lib/credits.ts`) and a placeholder rate in `packages/database/seed.ts` (reconcile real cost before production).
6. **Schema** — if it's a new model key, extend `GenerationModel` (migration `ALTER TYPE ... ADD VALUE`).
7. **UI** — if it should be user-facing, wire into `/generate` (automatic via `listModels`) and/or the Story Workspace. UGC requires the consent/moderation controls first.
8. **Tests** — add contract-mapper tests, a registry test, and an adapter test using an injected fake transport (no network).
9. **Docs** — update `docs/architecture.md` and `docs/product_roadmap.md`.

## 3. Feature flags & fail-closed

New providers ship **disabled by default**. A live call must require every gate:

- A master switch and a real-calls switch
- A per-capability switch
- A `maxRequests` cap
- A present credential

For fal this is already enforced by `readFalMediaConfig()` + `isFalCapabilityLive()`. Follow the same pattern for new providers, and add the flags to `.env.example` (never to a committed `.env`).

## 4. Release gates

Every provider must pass the gates in `docs/product_roadmap.md` §13 (Architecture → Security → Staging → Quality → Production Canary → GA) before production activation. No provider gains automatic refund/credit-mutation authority on connect.
