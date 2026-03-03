# Phase 09 — Session End

**Trigger:** Session is wrapping up.

---

## STOP — Before Anything Else

```
[ ] git status → any unstaged changes? → stage + commit as "wip: <description>"
[ ] git push → confirm push succeeded (or note failure)
[ ] Construct final trace string from active-plan.md Phase Trace field:
      task done    → "[Size] <trace>→done"    e.g. "[M] 02→03→05→done"
      task paused  → "[Size] <trace>→paused"  e.g. "[M] 02→03→05→paused"
[ ] Final trace string written into PROGRESS.md work log entry
[ ] active-plan.md handled:
      task done    → file cleared (overwrite with empty)
      task paused  → Status set to paused, Current Step accurate, steps checked off
```

Only then proceed to documentation.

---

## Instructions

### 1. Commit all work (even incomplete)
```bash
git status
git add <files>
git commit -m "wip: progress on <current task>"
git push
```
A `wip:` commit is always better than lost work. Never end a session with uncommitted changes.

### 2. Update PROGRESS.md

Write a final Work Log entry for the session:
```
#### HH:MM — Session end
- **What:** <summary of what was accomplished this session>
- **Trace:** [M] 02→03→05→done   ← replace with actual [Size] and trace from active-plan.md
- **Files:** <key files changed>
- **Next:** <first task to resume next session>
- **Known issues:** <any known issues, or "No known issues">
```

Ensure Current Focus reflects where work will resume.
Ensure Task Queue shows remaining work accurately.

**Compaction check:** If PROGRESS.md would exceed 60 lines, compact first.
Load `.claude/references/progress-tracking.md` for compaction procedure.

### 3. Summarize to the developer

Provide a brief session summary:
- What was completed (checked off from Task Queue)
- What is in progress (current state)
- What's queued next (so the handoff is clean)
- Any blockers or pending decisions

---

## Load References

- `.claude/references/git-discipline.md` — if unsure about commit format
- `.claude/references/progress-tracking.md` — for compaction procedure if needed

---

## Exit Condition

- All changes committed (at minimum as `wip:`)
- Pushed to remote (or failure noted)
- PROGRESS.md updated with session summary
- Developer briefed on state

**Next phase:** None — session ends.
