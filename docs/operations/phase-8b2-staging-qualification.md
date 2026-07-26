# Phase 8B.2 Creative Critic Staging Qualification

Date: 2026-07-26

## Scope

Phase 8B.2 qualified the Creative Critic runtime on an isolated VPS staging deployment. Production was not deployed or restarted.

Excluded from this qualification:

- Timeline and Movie Builder
- Movie stitching
- Video generation expansion
- Read-aloud and narration
- Publishing or marketplace work
- Academy expansion

## Isolated Staging Environment

- Staging path: `/root/raivstream-phase8b2-staging`
- PM2 process: `raivstream-phase8b2-staging`
- Port: `3032`
- Database container: `raivstream-phase8b2-postgres`
- Database: `raivstream_phase8b2`
- Database host/port: `127.0.0.1:55482`
- Base commit: `29158a14c753a3e1cf8c65c1304c14d2d4e41e73`
- Source patch SHA256: `537e48b7b3559683a66b4fc3d8631b16481084ecc49b8598860b864116a7bf9a`
- Source untracked archive SHA256: `5b0e2047fece7eec66e83da502bb54237ad2abd119850fab036ae6de0430fc96`

## Backups

- Initial backup: `/root/raivstream/backups/pre_phase_8b2_critic_20260726-230340.sql`
- Initial backup SHA256: `56dd3ebc895c026669356a3c519268d9e5274fb14c59b5f2e6680c2fde971e1c`
- Baselined staging backup: `/root/raivstream/backups/pre_phase_8b2_critic_baselined_20260726-230529.sql`
- Baselined staging backup SHA256: `60a5b8241d1c120d34769acc0baa53b73e0693fb85fc3086ae0bbdd248c00c14`

## Migration Notes

The repo migration chain is not fully replayable into a fresh empty database because the earliest Story Playground migration assumes existing enum/type state. To keep this qualification production-like, the staging DB was initialized from the pre-Phase-8B schema with `prisma db push`, prior migrations were resolved as applied, and the Phase 8B migration was then applied with `prisma migrate deploy`.

Final migration status:

- 9 migrations found
- `20260726090000_creative_critic_phase_8b` applied
- Database schema up to date

## Validation Gate

These commands passed on the isolated staging checkout:

```bash
pnpm --filter @raivstream/database exec prisma migrate deploy
pnpm --filter @raivstream/database exec prisma validate
pnpm --filter @raivstream/database db:generate
pnpm --filter @raivstream/api type-check
pnpm --filter @raivstream/web type-check
pnpm --filter @raivstream/web lint --max-warnings=0
pnpm --filter @raivstream/api test
rm -rf apps/web/.next
pnpm --filter @raivstream/web build
pm2 restart raivstream-phase8b2-staging --update-env
```

API tests passed:

- 6 test files
- 24 tests

Staging health passed:

```bash
curl --fail --silent --show-error -H 'x-forwarded-proto: https' -H 'host: app.raivstream.com' http://127.0.0.1:3032/api/health
```

## Real Provider Smoke Test

Smoke input:

- Story idea: `A dog going to school`
- Scene tested: `Road to School`
- Visual style: `THREE_D_ANIMATED`
- Critic threshold for smoke: `100`
- Max retries: `1`

Runtime dependencies confirmed present in staging:

- RunPod: yes
- OpenAI critic: yes
- R2: yes

Result:

- Story generated
- 6 scenes generated
- 3 initial Road to School images generated
- 1 critic retry image generated
- 4 assets mirrored to R2
- 4 Creative Critic runs completed
- Retry replay returned the existing asset and did not create another generation
- Credits deducted once per generated image
- Storybook selected the approved retry asset, not the rejected first asset
- R16 API payloads did not expose prompts, provider/model, critic issues, or improvement plan data
- Non-admin admin access was denied
- Admin prompt-quality returned rows
- Analytics contained critic, retry, feedback, approval, and rejection events

Generated R2 keys:

```text
story-projects/cms2avmdr0005dvnulzdzd3gz/scenes/cms2avrk10019dvnu46wjaf4n/assets/cms2avv0d001rdvnuuulomsec.png
story-projects/cms2avmdr0005dvnulzdzd3gz/scenes/cms2avrk10019dvnu46wjaf4n/assets/cms2aw9p0002mdvnu21dmecmg.png
story-projects/cms2avmdr0005dvnulzdzd3gz/scenes/cms2avrk10019dvnu46wjaf4n/assets/cms2awpcy003hdvnupk35wxej.png
story-projects/cms2avmdr0005dvnulzdzd3gz/scenes/cms2avrk10019dvnu46wjaf4n/assets/cms2axcg5004gdvnuy6eem1f5.png
```

Provider/model metadata:

- Requested model: `FLUX`
- Actual provider: `RunPod`
- Actual provider model: `z-image-turbo`
- Output size: `720x1280`

Credit result:

- Starting balance: `5000`
- Ending balance: `4680`
- Usage transactions: `4`
- Usage amount per transaction: `-80`
- Duplicate credit references: none

## NO-GO Found And Fixed

The first smoke test found a release-blocking issue:

- Storybook selected a creativeStatus `REJECTED` image if that image was still the active scene asset.

Fix:

- `selectStorybookImageForScene` now excludes creativeStatus `REJECTED` assets.
- Storybook selection test now covers active creative rejection and falls back to an approved image.

After the fix:

- API tests passed locally and on staging.
- Full staging validation/build gate passed.
- Real provider smoke passed.

## Production Health

Production was checked after staging work:

```bash
curl --fail --silent --show-error https://app.raivstream.com/api/health
curl --fail --silent --show-error https://r16.raivstream.com/api/health
```

Both returned healthy database status.

Production PM2 `raivstream-web` was not restarted during this qualification.

## Decision

GO for controlled production deployment after committing the Phase 8B, Phase 8B.1, and Phase 8B.2 Storybook rejection fix together.

Remaining risk:

- The historical migration chain still needs a separate cleanup/baseline plan for brand-new empty environments. Existing production-like databases are compatible with the additive Phase 8B migration.
