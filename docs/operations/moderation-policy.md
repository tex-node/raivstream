# Moderation policy

## Self-approval

An account that holds both a creator role and a moderator/admin role **may approve or
reject its own content** through `/admin/moderation`. This is intentional: the platform
operates with a small trusted operator set, and separating creation from moderation would
prevent the operator from managing their own published work.

The control is not a prohibition but an **audit requirement**: every moderation action
writes a `ModerationLog` row with `automated = false` and the acting `moderatorId`, and
`analytics_events` records the action. Reviewers can answer "who approved this, and when"
for any video by querying `moderation_logs` by `videoId`:

```sql
SELECT action, automated, "moderatorId", reason, "createdAt"
FROM moderation_logs WHERE "videoId" = '<id>' ORDER BY "createdAt";
```

Because the trail is the control, a rejection should carry a `reason`. The admin UI
requires one for reject; the API keeps the field optional so other callers are not broken.

### When this should change

If the operator set grows beyond trusted accounts, revisit this policy. The guard to add
at that point is a `creatorId === moderatorId` check in the approval path, plus a
second-approver requirement for rejections. Do not add that guard without changing this
document first — the absence of the guard is a decision, not an oversight.
