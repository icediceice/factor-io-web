# Phase 04 — Pre-Execute

**Trigger:** About to start writing code on a Size L task. Planning is complete.

**Note:** Size M tasks have this checklist inlined at the bottom of `03-planning.md`.
Load this file only for Size L tasks that loaded `03-planning.md` separately.

---

## STOP — Entry

- [ ] `.claude/active-plan.md` exists with `Status: approved`
- [ ] All file locations confirmed via index? If not → run `index_batch` for all unknowns in ONE call
- [ ] Git status is clean (or intentionally dirty — stashed or acknowledged)?
- [ ] Working on the correct branch?
- [ ] No incomplete changes from previous work sitting unstaged?

---

## Instructions

### Confirm all file paths before coding

If you have 2+ unknown locations → run `index_batch` (one call, all questions).
If you have 1 unknown → run `index_query`.
Look up the invocations in `.claude/references/tools.md`.

**Never start coding and then discover you're in the wrong file.**

### Verify git state

```bash
git status
git branch
```

If there are unexpected uncommitted changes:
- Stash them: `git stash`
- Or commit them first if they're complete (stage → commit → push)

### Check branch alignment

If on a feature branch, verify it's not diverged from base:
```bash
git log HEAD..origin/main --oneline 2>/dev/null | head -5
```

---

## STOP — Exit Gate

Before loading `05-execution.md`:

- [ ] `active-plan.md` Status updated to `in-progress`
- [ ] `Current Step: 1` confirmed, first step marked `[>]`
- [ ] `→04` appended to `Phase Trace:` in active-plan.md (e.g. `02→03→04`)

---

## Exit Condition

- All file paths confirmed (returned by index tool or known from prior work in this session)
- Git state is clean and branch is correct
- active-plan.md updated (Status: in-progress, step 1 marked [>])

**Next phase:** `05-execution.md`

---

## Preload Hint

Deterministic transition — load in the same response turn as this phase:
- **All checks pass** → load `05-execution.md` now
