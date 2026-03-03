# Skill: Commit & Log

**Trigger:** After a verified change, at step boundaries, at session end, or at milestones.

---

## Atomic Bookkeeping Sequence

Every commit follows this sequence. No step is optional.

### 1. Stage & Commit

```bash
git add <specific-files>               # stage what belongs to this change
git commit -m "<type>: <description>"  # feat / fix / refactor / chore / wip
```

**Stage specific files.** Never `git add -A` or `git add .` unless every changed file
belongs to this commit. They accidentally include `.env`, debug artifacts, or unrelated edits.

### 2. Push

```bash
git push
```

Push as backup after: each completed task, before switching tasks, before risky
operations, at session end. If push fails, note it in PROGRESS.md and continue locally.

### 3. Mark Step in Active Plan

In `.claude/active-plan.md`: change `[>]` to `[x]`, mark next step `[>]`,
increment `Current Step:`. (Load `active-plan.md` skill for format details.)

### 4. Update File Boundary

If the change touched a file not yet in the boundary, add it and note under
Boundary Changes.

### 5. PROGRESS.md Entry (milestones only)

```
MUST update:                       SKIP:
- Task completed                   - Intermediate edits
- Significant blocker hit          - Test runs
- Direction change                 - Routine commits
- Session start or end             - Small fixes
```

~2–5 entries per session. Each write costs context — don't waste it on micro-logging.

---

## Commit Message Format

```
<type>: <short description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `init`, `wip`

Examples:
```
feat: add JWT token refresh on 401
fix: null pointer in order processor when cart is empty
refactor: extract payment validation to PaymentService
wip: progress on notification system — queue integration done
```

---

## Commit Frequency by Tier

**Haiku (mechanical):** Batch commits at logical group boundaries (1–3 per subtask).
Format: `chore: [batch description]`

**Sonnet (engineering):** Commit after each logical unit of work. One feature, one fix,
one refactor step = one commit.

**Opus (architect):** Commit aggressively. Every individual change. `wip:` before risky
operations. `checkpoint:` after cross-cutting changes even if incomplete.

---

## Commit Gate (check after EACH logical change)

```
Done and verified          → commit now
About to touch a 2nd file  → commit current work first
Approaching session end    → commit before exiting
Skip only for:             trivial typo fix within same logical unit
```

---

## Work Log Entry Format

```markdown
#### HH:MM — <task name>
- **What:** <what the code does — NOT what the spec said>
- **Files:** <comma-separated list>
- **Next:** <next task name or "Awaiting direction">
- **Known issues:** <list issues, or "No known issues">
```

Every entry MUST have a "Known issues" line. "No known issues" if clean.
Omitting = incomplete entry.

---

## Compaction Procedure

When PROGRESS.md would exceed **60 lines**, compact FIRST:

1. Identify sessions older than the last 2 in the Work Log
2. Append each old session to `.claude/history/progress-archive.md` with `## [date]` header
3. Remove those sessions from PROGRESS.md
4. Remove completed tasks from Task Queue
5. Write the new entry

Tier Overrides **survive compaction** — move them forward into updated PROGRESS.md.

Archive is ordered oldest-at-top, newest-at-bottom. Never auto-load the archive.

---

## Session End Commit

Always commit before ending, even incomplete work:
```bash
git add <files>
git commit -m "wip: progress on <current task>"
git push
```

A `wip:` commit is always better than lost work.

---

## Destructive Operations

Always confirm with user before: `git reset --hard`, `git push --force`, `git branch -D`.
When in doubt, `git stash` first.
