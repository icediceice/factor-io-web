---
name: active-plan
description: >
  Active plan management for .claude/active-plan.md. Invoke when creating, transitioning,
  pausing, expanding, or completing any plan. Defines file format, status state machine,
  step markers, and all plan operations.
---

## Format

```markdown
## Active Plan: [Task Name]

**Status:** approved | in-progress | paused | delegating | complete
**Tier:** Opus / Sonnet / Haiku
**Size:** S / M / L
**Approved:** yes / no
**Current Step:** [number]

### Steps
- [>] 1. [Action] → [files] → [verify]
- [ ] 2. [Action] → [files]
- [x] 3. [Done] → [files]

### File Boundary
- path/to/file1
- path/to/file2

### Boundary Changes
- Added path/to/file3 — discovered during step 2

### Delegation
- Subtask A → Haiku — files: [list] — status: pending

### Notes
[Risks, blockers, recovery context]
```

## State Machine

`approved` → `in-progress` → `complete`
`in-progress` → `paused` → `in-progress` (resume)
`in-progress` → `delegating` → `in-progress`

## Markers

`[ ]` pending | `[>]` in progress (one at a time) | `[x]` complete

## Operations

**Create:** Write format above. Status `approved`, step 1 `[>]`, File Boundary lists all files.

**Size S fast path:**
```markdown
## Active Plan: [one-line]
**Status:** in-progress
**Tier:** [tier]  **Size:** S  **Approved:** yes  **Current Step:** 1

### Steps
- [>] 1. [action] → [file]

### File Boundary
- [file]
```

**Transition:** `[>]` → `[x]`, next step `[>]`, increment Current Step. New files → add to boundary + log under Boundary Changes.

**Pause:** Status `paused`, keep markers as-is. Log state to PROGRESS.md.

**Expand Boundary:** Add file + log reason under Boundary Changes. No approval needed.

**Complete:** Last `[>]` → `[x]`, Status `complete`. Load `skills/commit-and-log/SKILL.md` for bookkeeping. Clear file after PROGRESS.md is updated.
