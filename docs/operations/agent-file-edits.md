# File edits by agents: mechanical rule

**Rule: use the editor tools. Do not edit repository files with PowerShell string
replacement.**

This is not a style preference. It exists because the same class of silent
failure has now happened four times in one stretch:

| Incident | What happened | How it surfaced |
|---|---|---|
| here-string terminator | a `'@ ` line inside a here-string truncated the script; `video.ts` was left corrupted | TypeScript |
| `.Replace(old, new, 1)` | three-argument overload does not exist on Windows PowerShell 5; the call threw and the file was not written, but the script printed success | Type-check on the *next* run |
| `git switch main` mid-script | after a failed merge, the branch holding the fix was left behind while the working tree moved to `main`, so the next test run exercised the wrong tree | Grep for the guard, found absent |
| multi-line string replacement | the replacement text spanned lines inside a single-quoted string literal; the `homeTab` declaration was deleted and its uses orphaned | TypeScript |
| `git switch -c` did not take effect | the branch was never created, `git commit` then ran **on `main`**; the commit had to be moved to a branch and `main` reset to `origin/main` | `git log` inspection before pushing |
| Prisma `select` omitted a flag | a behaviour flag was `true` in the database and `undefined` in the code, so the feature silently took its default path; 80 credits were spent producing a control image that looked like a result | Inspecting the composed prompt instead of trusting the flag |
| env flag not live in the rendering process | a test harness set `RENDER_SEGMENTS_ENABLED=true` via shell-prefixed `pm2 restart --update-env`, but the app also loads `env_file: '../../.env'` and the file won; the render silently took the other path and the two arms produced byte-identical output | No `[export.segments]` lines in the run log - the result was too perfect |
| uncommitted edit reported as clean | a docs edit existed in the working tree but not in the repository; a later `git switch` would have discarded it silently | `git status --porcelain \| grep -v '^??'` before reporting |

The common shape: **the tool reports success while doing something other than
what was intended.** PowerShell string manipulation is the worst offender
because its failure modes are silent — a no-op replace returns the original
string, and a partial write leaves a file that still parses. The `select` row is
the same shape one layer down: a flag that is true in storage can be false in
every consumer, silently.

Note the direction reversal in the last row. The first five are *a state present
where it was not expected* — a commit on `main`, a guard on the wrong branch. The
last is *a state missing where it was expected*: the edit existed, but not where
it had to be. Same class, opposite direction, and the same check catches both.

## Verify state, do not assume it

Two mechanical checks, because both have already failed once:

```bash
test "$(git branch --show-current)" != "main" || { echo "refusing to commit on main"; exit 1; }
```

```ts
// a flag that gates behaviour must be asserted in the path that consumes it
expect(composePrompt({ identityRefsEnabled: true })).not.toContain(identityProse);
```

The second is the general rule: **a flag that gates behaviour must be asserted
in the path that consumes it, not in the database that stores it.** A test on the
stored value proves nothing about the read.

And one check that belongs at the **end** of every ship script, not the start:

```bash
test -z "$(git status --porcelain | grep -v '^??')" || { echo "refusing to report clean: uncommitted changes"; exit 1; }
```

It is easy to check the tree before starting and forget it after finishing —
which is precisely when uncommitted work exists. Placed last, it answers "what
is the difference between what I think I did and what is committed?" without
relying on memory of the work.


## What to do instead

- Use the `edit` tool for targeted changes and `write` for new files.
- If a mechanical rename is genuinely bulk (dozens of files), use `git grep -l`
  plus a script that **fails loudly** on zero matches, and verify with
  `git diff --stat` afterwards.
- Never switch branches inside a script that may have left uncommitted work.
- Treat any gate that prints a result as informational only: the ship step must
  `exit 1` on a non-zero exit code, or the gate is decorative.
- **Address `gh` PRs by number, not by current branch.** `gh pr checks` infers its
  target from the checked-out branch, so after any script that ends with
  `git switch main` it silently checks the wrong thing — and reports "no pull
  requests found", which reads like a missing PR rather than a wrong branch.
  `gh pr checks <number>` and `gh pr merge <number>` cannot drift. Same discipline
  as passing a flag explicitly: **a command that infers its target from ambient
  state is a command that can lie.**
- Pass long PR/commit bodies via `--body-file`. A `$(...)` or `||` inside a
  double-quoted `--body` argument is parsed by the shell, not by `gh`.

## Why this is written down

"I will remember" has failed twice in this stretch. A rule that depends on
recall is not a rule. This one is checkable: a diff that touches many lines of a
file for a one-line intent is the signature of the wrong tool.

## The through-line

Every durable artifact from this stretch is a **mechanism that reports when it is
bypassed**, not a convention that assumes care: a failing test, an exit code, a
log line, a named incident row. The ones that survived are the ones that fire;
the ones that did not survive were the ones that depended on remembering.

## The self-consistency class

A distinct failure mode, named after its third instance in one stretch: **a
system that agrees with itself cannot detect its own error.** Each of these was
internally coherent, and coherence is what made it invisible.

| Instance | Why it looked correct | What was actually happening |
|---|---|---|
| Creative Critic | provider real, model real, API key real, 802 completed runs | the prompt contained a filled-in JSON example; every score was the example echoed back |
| Export cache | `sourceHash` matched the exported file exactly, and re-exports were consistent | the hash covered `sceneId:assetId` but not a project flag that changed the rendered prompt |
| Export derivation | `durationSeconds` in the DB matched the probe to the millisecond | the probe measured a file that had already been truncated by the declared-duration cap |

The shared tell: **agreement between two artefacts that share an input**. DB
matching the probe proves the DB is honest, not that the probe measured the
intended thing; a cache hit proves the key matched, not that the key covered
every input; a stable score proves stability, not discrimination.

The check that catches the class is always external to the system that agrees
with itself: calibrate the gate against a known-bad input, put the
behaviour-determining input into the key, and compare the artefact against the
sum of its parts rather than against its own record.


