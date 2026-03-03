# Reference: Progress Tracking

**Load this file when:** Updating PROGRESS.md or performing a compaction.

---

## PROGRESS.md Hard Limit: 60 Lines

If adding an entry would push `PROGRESS.md` over **60 lines**, compact FIRST.

```
Compaction = move sessions older than the last 2 to .claude/history/progress-archive.md
```

Never let PROGRESS.md grow beyond 60 lines. Archive-first is the rule — no exceptions.

---

## File Structure

### PROGRESS.md (always short — max 60 lines)

```markdown
# Project: <project-name>

> Initialized: <YYYY-MM-DD HH:MM>
> Last updated: <YYYY-MM-DD HH:MM>

## Current Focus

<one or two sentences on current state>

## Task Queue

- [ ] <pending task>
- [x] <completed task>
- [ ] <pending task>

## Work Log

### <YYYY-MM-DD> (session — keep last 2 sessions only)

#### HH:MM — <task name>
- **What:** <what the code does now>
- **Files:** <files changed>
- **Next:** <next task>
- **Known issues:** <issues, or "No known issues">
```

### .claude/history/progress-archive.md (never auto-loaded)

All sessions older than the last 2 live here. Appended, never overwritten.

```markdown
# Progress Archive

## [YYYY-MM-DD]

#### HH:MM — <task name>
- **What:** <summary>
- **Files:** <files>
- **Next:** <what was next at time of archiving>
- **Known issues:** <issues at time of archiving>

## [YYYY-MM-DD]
...
```

---

## When to Update PROGRESS.md

```
MUST update:                       SKIP:
- Task completed                   - Intermediate edits
- Significant blocker hit          - Test runs
- Direction change                 - Routine commits
- Session start / end              - Small fixes
```

~2–5 entries per session. Each write costs context — don't waste it on micro-logging.

---

## Work Log Entry Format

Every completed task entry:
```
#### HH:MM — <task name>
- **What:** <what the code does — NOT what the spec said>
- **Files:** <comma-separated list>
- **Next:** <next task name or "Awaiting direction">
- **Known issues:** <list issues, or "No known issues">
```

**Every complete entry needs a "known issues" line.** Write "No known issues" if clean.
Omitting it is not allowed — it signals the entry is incomplete.

---

## Compaction Procedure

When PROGRESS.md would exceed 60 lines:

1. Identify sessions older than the last 2 in the Work Log
2. For each old session, append it to `.claude/history/progress-archive.md` with a `## [date]` header
3. Remove those sessions from PROGRESS.md
4. Remove completed tasks from Task Queue (git has the history)
5. Then write the new entry

Archive format (append to end of file):
```markdown
## [YYYY-MM-DD]

#### HH:MM — <task name>
- **What:** ...
- **Files:** ...
- **Next:** ...
- **Known issues:** ...
```

Archive is ordered oldest-at-top, newest-at-bottom.
NEVER auto-load the archive. Read it only when the user explicitly asks ("show session history", "what did we do last week").

---

## Tier Overrides

When an escalation occurs, the orchestrator MUST add a tier override to PROGRESS.md.
Tier overrides **survive compaction** — they are persistent project knowledge, not
session-specific notes. When compacting, move them forward into the updated PROGRESS.md.

### Format (add this section to PROGRESS.md if not present)

```markdown
### Tier Overrides
- [module/area] → minimum [Tier] — escalated from [tier] on [YYYY-MM-DD], reason: [one-line]
```

Example entries:
```
### Tier Overrides
- Auth module changes → minimum Sonnet — escalated from Haiku 2025-03-01, reason: JWT validation touches 4 services
- Database migrations → minimum Sonnet — escalated from Haiku 2025-03-03, reason: requires understanding of data dependencies
```

During phase 02 (task intake), always check for this section before sizing.
If the current task touches an area with an override, that override is the minimum tier.

---

## Phase Trace

Every work log entry includes a compact phase trace on the timestamp line.

**Format:** `#### HH:MM — <task name> [Size] trace`

**Trace notation:**
- Numbers = phase IDs (`02`=task-received, `03`=planning, `04`=pre-execute, `05`=execution, etc.)
- `06(H:desc,S:desc)` = delegation with tier initial and subtask description
- `07↑T` = escalation, T = new tier initial (`S`=Sonnet, `O`=Opus)
- `done` = task complete within session
- `→09` = transitioned to session-end

**Examples:**
```
#### 09:15 — Fix null pointer in CartService [S] 02→05→done
#### 14:30 — Add auth token refresh [M] 02→03→05→done
#### 16:00 — Refactor payment module [L] 02→03→04→05→09
#### 10:45 — Migrate database schema [L] 02→03→04→06(H:boilerplate,S:logic)→08→08→05→09
#### 11:20 — Debug race condition [M] 02→03→05→07↑O→05→done
```

Include the trace on the same line as the work log timestamp. Keep it compact — this
is a diagnostic aid, not prose.

---

## Litmus Test

Before updating: "If another Claude instance opened PROGRESS.md right now, would it know
where things stand and what to do next?" If yes — the file is good enough. Don't over-document.
