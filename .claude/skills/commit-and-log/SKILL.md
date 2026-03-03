---
name: commit-and-log
description: >
  Atomic commit and work log protocol. Invoke after any verified change, at step
  boundaries, before session end, and at milestones. Covers git sequence, plan
  transitions, PROGRESS.md entries, compaction, and commit conventions.
---

## Sequence (every commit, no step optional)

1. **Stage & Commit** — specific files only, never `git add -A` or `git add .`
   ```bash
   git add <specific-files>
   git commit -m "<type>: <description>"
   ```
2. **Push** — after completed tasks, before switching tasks, before risky ops, at session end. Failure → note in PROGRESS.md, continue locally.
3. **Mark step** — in `active-plan.md`: `[>]` → `[x]`, next `[>]`, increment Current Step.
4. **Boundary** — new file touched? Add to File Boundary + Boundary Changes.
5. **PROGRESS.md** — milestones only (~2–5 per session):
   - Task completed, blocker hit, direction change, session start/end
   - Skip: intermediate edits, test runs, routine commits, small fixes

## Commit Messages

Format: `<type>: <short description>`
Types: `feat` `fix` `refactor` `docs` `chore` `init` `wip`

## Commit Frequency

| Tier | Cadence |
|------|---------|
| Haiku | Batch at group boundaries (1–3 per subtask). `chore:` |
| Sonnet | Each logical unit. One feature/fix/refactor = one commit. |
| Opus | Every change. `wip:` before risky ops. `checkpoint:` after cross-cutting. |

## Commit Gate

Done and verified → commit now.
About to touch 2nd file → commit current first.
Approaching session end → commit before exit.

## Work Log Entry

```markdown
#### HH:MM — <task name>
- **What:** <what the code does>
- **Files:** <list>
- **Next:** <next task or "Awaiting direction">
- **Known issues:** <issues or "No known issues">
```
Every entry MUST have "Known issues". Omitting = incomplete.

## Compaction

When PROGRESS.md exceeds 60 lines:
1. Archive sessions older than last 2 → `.claude/history/progress-archive.md`
2. Remove archived sessions + completed Task Queue items
3. Tier Overrides survive compaction — carry forward

## Session End

```bash
git add <files>
git commit -m "wip: progress on <current task>"
git push
```
A `wip:` commit is always better than lost work.

## Destructive Ops

Confirm with user before: `git reset --hard`, `git push --force`, `git branch -D`. When in doubt, `git stash` first.
