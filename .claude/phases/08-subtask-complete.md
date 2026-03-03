# Phase 08 — Subtask Complete

**Trigger:** A delegated sub-task (from `06-delegation.md`) or escalated agent (from `07-escalation.md`) has returned results.

---

## STOP Checklist

- [ ] Did the agent commit its changes? Check: `git log --oneline -5`
- [ ] Does the output match what was specified in the delegation/escalation report?
- [ ] Are there any known issues reported by the agent?
- [ ] `active-plan.md` Delegation section updated: subtask status set to `complete`, one-line result recorded
- [ ] `→08` appended to `Phase Trace:` in active-plan.md

---

## Instructions

### 1. Review the output

Check the agent's completion report against the expected output defined when delegating.

Verify:
- Deliverables are present (the specific files/functions/changes that were requested)
- No unexpected file changes: `git diff HEAD~1 --name-only` (or relevant range)
- No regressions introduced (run tests if available)

### 2. Integrate if needed

If the agent's work needs to be combined with changes from the main task thread:
- Resolve any conflicts
- Run verification (tests, build, linter)
- Commit the integration as its own commit: `git commit -m "chore: integrate [subtask name]"`

### 3. Handle incomplete or incorrect output

If the output is wrong or incomplete:
- **If minor:** Fix it at current tier and continue
- **If significant:** Revert the agent's changes (`git revert` or `git reset`) and re-delegate with a corrected prompt — document what went wrong in the new delegation

Do NOT stack corrections on top of bad work. Revert cleanly, then redo.

### 4. Update project state

- Update PROGRESS.md to reflect the delegated work as complete
- Ensure Task Queue shows accurate remaining work
- Resume the main task thread from where it was paused

---

## Exit Condition

- Agent output reviewed and accepted (or corrected and re-integrated)
- Changes committed
- PROGRESS.md updated

**Next phase:** Back to main task (`05-execution.md` for more work, or `09-session-end.md` if done)

---

## Preload Hint

Deterministic transitions — load in the same response turn as this phase:
- **More plan steps remain** → load `05-execution.md` now
- **All work complete** → load `09-session-end.md` now

*Do not preload if it's unclear whether more work remains after reviewing the agent output.*
