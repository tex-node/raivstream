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

The common shape: **the tool reports success while doing something other than
what was intended.** PowerShell string manipulation is the worst offender
because its failure modes are silent — a no-op replace returns the original
string, and a partial write leaves a file that still parses.

## What to do instead

- Use the `edit` tool for targeted changes and `write` for new files.
- If a mechanical rename is genuinely bulk (dozens of files), use `git grep -l`
  plus a script that **fails loudly** on zero matches, and verify with
  `git diff --stat` afterwards.
- Never switch branches inside a script that may have left uncommitted work.
- Treat any gate that prints a result as informational only: the ship step must
  `exit 1` on a non-zero exit code, or the gate is decorative.

## Why this is written down

"I will remember" has failed twice in this stretch. A rule that depends on
recall is not a rule. This one is checkable: a diff that touches many lines of a
file for a one-line intent is the signature of the wrong tool.
