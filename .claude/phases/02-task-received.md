# Phase 02 — Task Received

**Trigger:** A new task is received from the user.

---

## Check for Active Plan

Before analyzing the new task, check if `.claude/active-plan.md` has content.

**If status is `in-progress`:**
1. Ask the user: "There's an active plan for [task name] with [N] steps remaining. Should I pause it and start the new task, or finish the current plan first?"
2. If pausing: update `active-plan.md` status to `paused`, log current state to PROGRESS.md
3. Then proceed with the new task — write a new `active-plan.md` (overwrites the file, but state was saved to PROGRESS.md)

**If status is `paused`:**
- Proceed with the new task normally — the paused plan is already saved in PROGRESS.md
- If the user later asks to resume, recreate `active-plan.md` from the PROGRESS.md notes

**If file is absent or empty:**
- Proceed normally

---

## Task Sizing — Determine Before Anything Else

**Size S (trivial):** Single file, obvious change, no cross-file impact. You already know which file and what to do.
→ Fast path: present one-liner to user: `"Fix: [what] in [file:line] — approve?"`
→ On approval: execute directly. No plan load, no pre-execute load.
→ Still commit. Still follow code hygiene. Still respect file boundaries.
→ Skip to `05-execution.md` after approval.

**Size M (standard):** Multiple files or needs analysis, but scope is clear.
→ Load `03-planning.md` — it includes the pre-execute checklist inline.
→ One file load serves both planning and pre-execute boundary verification.

**Size L (complex):** Cross-cutting, multi-module, needs delegation or architectural reasoning.
→ Load `03-planning.md` for planning, then `04-pre-execute.md` separately.
→ This is where the full ceremony pays for itself.

---

## Tier Override Check

Before sizing this task, check PROGRESS.md for a `### Tier Overrides` section.
If the task touches an area with an override, that override is the minimum tier.
Assess complexity normally, but never route below the override minimum.

Example: If PROGRESS.md has "Auth module changes → minimum Sonnet", a task modifying
auth code cannot be Size S (Haiku) regardless of apparent simplicity — floor it at M.

---

## STOP Checklist

- [ ] Task clearly sized as S / M / L?
- [ ] Do you have an architecture map from this session? If not → return to `01-session-start.md`
- [ ] Is the task description clear enough to proceed? If not, ask one clarifying question.

---

## Instructions

### Size S — Fast Path

1. Identify the exact file and the exact change needed.
2. Present to user: `"Fix: [what] in [file:line] — approve?"`
3. On approval: write a minimal `active-plan.md` then proceed to `05-execution.md`.
   ```
   ## Active Plan: [one-line description]
   **Status:** in-progress
   **Tier:** [tier]
   **Size:** S
   **Approved:** yes
   **Current Step:** 1

   ### Steps
   - [ ] 1. [the single action] → [file]

   ### File Boundary
   - [the single file]
   ```
4. No planning file load, no pre-execute file load.

### Size M — Combined Path

1. If 2+ file locations are unknown, run `index_batch` first (one call, all questions).
   Look up the invocation in `.claude/references/tools.md` → `index_batch`.
2. Load `03-planning.md`. It includes pre-execute boundary verification inline.

### Size L — Full Path

1. Run `index_analyze` or `index_trace` to map scope.
   Look up invocations in `.claude/references/tools.md`.
2. Load `03-planning.md` for planning.
3. After plan is approved, load `04-pre-execute.md` for boundary verification.
4. If parallel work or sub-agent delegation needed → load `06-delegation.md`.

---

## Progress Update Gate

```
MUST update PROGRESS.md:           SKIP update:
- Accepting a significant task      - Quick questions
- Direction change                  - Trivial (S) fixes
```

---

## Exit Condition

Task sized and routed.

**Next phase:**
- Size S: `05-execution.md` (after user approval)
- Size M: `03-planning.md`
- Size L: `03-planning.md`

---

## Preload Hint

Deterministic transitions — load in the same response turn as this phase:
- **Size S approved** → load `05-execution.md` now
- **Size M** → load `03-planning.md` now
- **Size L** → load `03-planning.md` now
