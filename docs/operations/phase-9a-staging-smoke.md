# Phase 9A Staging Smoke

Run this only in an isolated staging environment. Do not use production.

## Preflight

1. Create a database backup and checksum before applying the Phase 9A migration.
2. Deploy the Phase 9A worktree to a staging path.
3. Apply `20260823090000_sequence_workspace_phase9a`.
4. Run the full verification gate.

## Smoke Project

Use an existing real Story Playground project or create:

```text
A Dog Going To School
```

## Checks

1. Sequence opens from Story Workspace.
2. Existing scenes populate exactly once.
3. Eligible approved/active/favorite/latest images appear.
4. Deleted, moderation-rejected, and creatively rejected images are not selectable.
5. Select specific images for shots.
6. Reorder timeline entries.
7. Duplicate one timeline entry.
8. Disable one entry.
9. Remove one entry without deleting the source scene.
10. Restore/add a source scene to the sequence.
11. Change durations, including a decimal duration.
12. Set shot types.
13. Set camera movement and custom speed.
14. Set transitions and transition duration.
15. Runtime recalculates from enabled durations and holds.
16. Timed storyboard preview follows the current order.
17. Save Version 1.
18. Make changes and save Version 2.
19. Restore Version 1 and confirm complete timeline restoration.
20. Duplicate a version.
21. Confirm Film Blueprint matches the restored sequence.
22. Confirm Storybook selection did not change.
23. Confirm Asset Manager state did not change.
24. Confirm Creative Critic data did not change.
25. Confirm another signed-in user cannot access the sequence.
26. Confirm R16 exposes no Sequence UI or internal payload.
27. Confirm `/admin/sequence` is ADMIN-only and shows aggregate metrics only.
28. Confirm production health remains untouched.

## Verification Gate

```bash
pnpm --filter @raivstream/database db:generate
pnpm --filter @raivstream/database exec prisma validate
pnpm --filter @raivstream/api type-check
pnpm --filter @raivstream/web type-check
pnpm --filter @raivstream/web lint --max-warnings=0
pnpm --filter @raivstream/api test
pnpm --filter @raivstream/web build
```
