---
name: delegation
description: >
  Sub-agent delegation protocol. Invoke when spawning any sub-agent or reviewing any
  agent return. Covers when to delegate, tier-specific context loads, prompt template,
  and subtask review checklist.
---

## When to Delegate

**Do:** Independent parallelizable subtasks. Subtask below current tier (Sonnet→Haiku). Subtask needs higher tier (→Opus, see ESCALATION).
**Don't:** Shared state or ordering dependency. Work too small for delegation overhead. Blocked and need result first.

## Pre-Delegation

- [ ] `active-plan.md` Status → `delegating`
- [ ] Delegation section subtasks → `status: running`

## Context by Tier

**Haiku** (rename, format, boilerplate):
```
LOAD: .claude/skills/commit-and-log/SKILL.md
Commit: batch at group boundaries (1-3). chore: [description]
```

**Sonnet** (implementation, refactor, bug fix):
```
LOAD: .claude/skills/smart-index/SKILL.md, .claude/skills/commit-and-log/SKILL.md
Commit: each logical unit (one fix/feature = one commit).
```

**Opus** (architecture, complex debug, security):
```
LOAD: .claude/skills/smart-index/SKILL.md, .claude/skills/commit-and-log/SKILL.md, .claude/references/tiering.md
Commit: every change. wip: before risky ops.
```

## Prompt Template

```
You are a [Tier] agent. Task: [description]

[LOAD block for tier]

Constraints:
- Do not modify files outside: [scope]. Report if you need to.
- Commit all changes before returning. Format: <type>: <description>
- Report: files changed, what was done, known issues
- Escalate if blocked by architectural questions
Starting state: [description or escalation-report.md ref]
Expected output: [specific deliverables]
```

## Subtask Review

1. **Verify:** Committed? (`git log --oneline -5`) Output matches prompt? Issues reported? Update Delegation section → `status: complete`.
2. **Integrate:** Resolve conflicts → verify (test/build/lint) → `git commit -m "chore: integrate [subtask]"`
3. **Incomplete:** Minor → fix and continue. Significant → revert cleanly, re-delegate with corrected prompt. Never stack corrections on bad work.
4. **Resume:** Update PROGRESS.md → `active-plan.md` Status back to `in-progress` → return to EXECUTION.
