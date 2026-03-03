# Phase 03 — Planning

**Trigger:** Task is Size M or Size L and requires a plan before coding begins.

---

## STOP — Entry

- [ ] Is planning actually needed? Skip for Size S — execute directly.
- [ ] Do you have enough architectural context to plan? If not → run `index_analyze` first.

---

## Instructions

### 1. Understand scope

Use `index_analyze` or `index_trace` to map the affected files and systems.
Look up the invocations in `.claude/references/tools.md`.

**Do not guess which files are involved. Always verify via index before planning.**

### 2. Check model tiering

If the task requires complex reasoning or architectural judgment:
Load `.claude/references/tiering.md` to decide if escalation or delegation is needed.

### 3. Draft the plan

Fill in the template below directly in your response. Write it to PROGRESS.md before coding.

---

## Plan Template

```
## Plan: <Task Name>

**Tier:** Tier 2 (Sonnet)  |  *Escalate to Tier 1 if: [reason, or N/A]*
**Size:** M / L

### Files Affected

| File | Change |
|------|--------|
| `path/to/file` | what changes and why |

*All paths confirmed via index_batch / index_analyze.*

### Steps

1. **<Step>** — <what and why>
   - Files: `file1`, `file2`
   - Verify: <how to confirm this step worked>

2. **<Step>** — <what and why>

### Risk

| Risk | Mitigation |
|------|------------|
| <what could go wrong> | <how to detect/recover> |

**Rollback:** `git checkout -- <files>` or `git reset --soft HEAD~1`
```

---

### 4. Document before coding

Write the plan to PROGRESS.md (or at minimum present it inline before starting).
The litmus test: could another Claude instance pick this up and continue without asking?

### 5. Write Plan to Disk

After formulating the plan, write it to `.claude/active-plan.md` before presenting to
the user. Use this format:

```markdown
## Active Plan: [Task Name]

**Status:** approved
**Tier:** [Opus / Sonnet / Haiku]
**Size:** [M / L]
**Approved:** yes
**Current Step:** 1
**Phase Trace:** 02→03

### Steps
- [>] 1. [Action] → [files] → [verify outcome]
- [ ] 2. [Action] → [files]

### File Boundary
[Complete list of files this plan is authorized to touch]
- path/to/file1
- path/to/file2

### Delegation
[Omit section if no sub-agents involved]
- Subtask A → Haiku — files: [list] — status: pending

### Notes
[Leave blank or add known risks]
```

Then present the plan to the user in conversation as normal.

---

## STOP — Exit Gate

Do not present the plan to the user until this is done:

- [ ] Plan written to `.claude/active-plan.md` with `Status: approved`
- [ ] `Phase Trace: 02→03` recorded in active-plan.md
- [ ] First step marked `[>]` in the Steps list

When the user approves, update `.claude/active-plan.md` before loading the next phase:
- Set **Status:** `in-progress`
- **Current Step:** stays at `1` (already marked `[>]`)

---

## Pre-Execute Checklist (Size M — inline, no separate file load needed)

Before writing code on a Size M task, verify:

- [ ] All file paths confirmed via index (not guessed)?
- [ ] Git status clean: `git status` → no unexpected uncommitted changes?
- [ ] On correct branch: `git branch` → expected branch?

If any check fails: stash (`git stash`) or commit current work, then proceed.

*Size L tasks: load `04-pre-execute.md` separately instead of using this checklist.*

---

## Load References

- `.claude/references/tools.md` — for `index_analyze` / `index_trace` invocations
- `.claude/references/tiering.md` — if model escalation or delegation is needed

---

## Exit Condition

- Plan drafted (inline or written to PROGRESS.md)
- Affected files confirmed via index
- Pre-execute checks passed (Size M: checklist above; Size L: load `04-pre-execute.md`)

**Next phase:**
- Size M: `05-execution.md` (pre-execute checklist already done above)
- Size L: `04-pre-execute.md` (full boundary verification)

---

## Preload Hint

Deterministic transitions — load in the same response turn as this phase:
- **Plan approved, Size M, no delegation** → load `05-execution.md` now
- **Plan approved, Size L, no delegation** → load `04-pre-execute.md` now
- **Plan approved, delegation needed** → load `06-delegation.md` now

*Do not preload when the delegation/no-delegation decision hasn't been made yet.*
