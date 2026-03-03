# Reference: Git Discipline

**Load this file when:** Committing, pushing, or unsure about commit format.

---

Git is both version control and a backup layer. Commit and push frequently.

## Commit Message Format

```
<type>: <short description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `init`, `wip`

Examples:
```bash
git commit -m "feat: add JWT token refresh on 401"
git commit -m "fix: null pointer in order processor when cart is empty"
git commit -m "refactor: extract payment validation to PaymentService"
git commit -m "docs: update API reference for /orders endpoint"
git commit -m "chore: update crawl4ai to v0.4.1"
git commit -m "wip: progress on notification system — queue integration done"
```

## When to Commit

Commit after every meaningful unit of work:
- A feature or function completed
- A file or module created or restructured
- A bug fixed
- A config change applied and verified
- Any point where losing the work would be painful

**Never let more than ~3 meaningful changes accumulate without a commit.**
A `wip: progress on <feature>` commit is always better than lost work.

## When to Push

Push as a backup at minimum:
- After completing each task from the queue
- Before switching to a different task
- Before any risky refactor or destructive operation
- At end of session

If push fails (no remote, auth issue): note it in PROGRESS.md and continue.
Don't block work on a push failure — commit locally and push when unblocked.

## Staging Discipline

Stage specific files. Do not use `git add -A`:
```bash
git add src/auth/token.ts src/api/middleware.ts
```

Do not use `git add -A` or `git add .` unless you have verified every changed file belongs
to this commit. They accidentally include `.env`, debug artifacts, or unrelated edits.

## Commit Frequency by Tier

**Haiku (mechanical):** Batch commits are acceptable. Commit at logical group boundaries
(e.g., "all import updates done", "all config files generated") or at subtask completion.
Aim for 1–3 commits per subtask, not 1 per file.
Message format: `chore: [batch description]`

**Sonnet (engineering):** Commit after each logical unit of work. One feature, one fix,
one refactor step = one commit. This is the baseline the rest of the system assumes.

**Opus (architect):** Commit aggressively. Every individual change gets its own commit.
Before any risky operation, commit what you have as `wip:`. The cost of extra commits
is nothing compared to losing work on a complex refactor. After completing a
cross-cutting change, make a `checkpoint:` commit even if the work isn't done —
this creates a known-good restore point.

---

## Destructive Operations

Always confirm before:
- `git reset --hard` — discards uncommitted changes permanently
- `git push --force` — overwrites remote history
- `git branch -D` — deletes a branch

When in doubt, `git stash` first and proceed from a clean state.
