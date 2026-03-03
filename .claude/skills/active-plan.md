# Skill: Active Plan

**Trigger:** Creating, transitioning, pausing, or expanding a plan in `.claude/active-plan.md`.

---

## File Format

```markdown
## Active Plan: [Task Name]

**Status:** [see State Machine below]
**Tier:** [Opus / Sonnet / Haiku]
**Size:** [S / M / L]
**Approved:** [yes / no]
**Current Step:** [number]

### Steps
- [>] 1. [Action] → [files] → [verify outcome]
- [ ] 2. [Action] → [files]
- [x] 3. [Completed action] → [files]

### File Boundary
[Complete list of files this plan is authorized to touch]
- path/to/file1
- path/to/file2

### Boundary Changes
[Log any runtime additions: "Added path/to/file3 — discovered during step 2"]

### Delegation
[Omit section if no sub-agents]
- Subtask A → Haiku — files: [list] — status: pending
- Subtask B → Sonnet — files: [list] — status: running

### Notes
[Known risks, blockers, or context for recovery]
```

---

## Status State Machine

```
approved → in-progress → complete
                ↓
             paused
                ↓
          in-progress (resume)

approved → in-progress → delegating → in-progress
```

Valid values: `approved`, `in-progress`, `paused`, `delegating`, `complete`

---

## Step Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending — not started |
| `[>]`  | In progress — currently executing |
| `[x]`  | Complete — verified and committed |

Only ONE step may be `[>]` at a time.

---

## Operations

### Create (new task)

1. Write the file using the format above
2. Set Status to `approved`, Current Step to `1`, first step `[>]`
3. File Boundary must list every file the plan may touch

**Size S fast path:**
```markdown
## Active Plan: [one-line description]
**Status:** in-progress
**Tier:** [tier]
**Size:** S
**Approved:** yes
**Current Step:** 1

### Steps
- [>] 1. [the single action] → [file]

### File Boundary
- [the single file]
```

### Transition (step complete)

1. Change current `[>]` to `[x]`
2. Mark next step `[>]`
3. Increment `Current Step:`
4. If step revealed new files → add to File Boundary, note under Boundary Changes

### Pause

1. Set Status to `paused`
2. Keep Current Step and markers as-is (resume point)
3. Log state to PROGRESS.md before overwriting with a new plan

### Expand Boundary

When execution discovers a file not in the boundary:
1. Add file to File Boundary list
2. Add entry under Boundary Changes with reason
3. Continue execution — no user approval needed for boundary expansion

### Complete

1. Last step `[>]` → `[x]`
2. Set Status to `complete`
3. Trigger: load `commit-and-log.md` for final bookkeeping
4. Clear the file (overwrite with empty) after PROGRESS.md is updated
