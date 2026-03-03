# Phase 06 — Delegation

**Trigger:** Task requires parallel work or a different model tier than current session.

---

## STOP Checklist

Before writing the delegation prompt:

- [ ] `active-plan.md` Status set to `delegating`
- [ ] Each subtask entry in the Delegation section set to `status: running`
- [ ] `→06` appended to `Phase Trace:` in active-plan.md

---

## When to Delegate

**Delegate when:**
- Work can be parallelized (independent sub-tasks with clean handoff points)
- A sub-task is below the current tier's optimal use (Sonnet delegating rename/format tasks to Haiku)
- A sub-task needs higher capability (Sonnet escalating architectural decisions to Opus — see `07-escalation.md`)

**Do NOT delegate when:**
- Sub-tasks share state or ordering matters
- Total work is small enough that delegation overhead exceeds the benefit
- You're blocked and need the result before continuing

---

## Tier-Specific Context Load Lists

When writing a delegation prompt, specify exactly which files the agent must load.
Giving an agent irrelevant context reduces signal-to-noise. Match the load list to the tier.

**Haiku agent context (mechanical tasks — rename, format, simple transform, boilerplate):**
```
LOAD THESE FILES BEFORE STARTING:
- .claude/phases/05-execution.md
- .claude/references/code-hygiene.md
- .claude/references/git-discipline.md

Commit cadence: batch commits at logical group boundaries (1-3 commits per subtask).
Format: chore: [batch description]
```

**Sonnet agent context (engineering tasks — implementation, refactor, bug fix):**
```
LOAD THESE FILES BEFORE STARTING:
- .claude/phases/04-pre-execute.md
- .claude/phases/05-execution.md
- .claude/references/tools.md  (look up: index_query, index_batch)
- .claude/references/code-hygiene.md
- .claude/references/git-discipline.md

Commit cadence: commit after each logical unit of work (one fix/feature/refactor = one commit).
```

**Opus agent context (architect tasks — design, complex debugging, security review):**
```
LOAD THESE FILES BEFORE STARTING:
- .claude/phases/04-pre-execute.md
- .claude/phases/05-execution.md
- .claude/references/tools.md
- .claude/references/code-hygiene.md
- .claude/references/git-discipline.md
- .claude/references/tiering.md  (if sub-delegation might be needed)

Commit cadence: commit aggressively — every individual change, wip: before any risky
operation, checkpoint: after cross-cutting changes even if work is incomplete.
```

---

## Hard Rules for All Agent Prompts (Every Tier)

Always include these constraints:
- **Boundaries:** "Do not modify files outside [scope]. Report back if you need to touch something outside this."
- **Commit:** "Commit all changes before returning. Format: `<type>: <short description>`"
- **Report back:** "When complete, provide: files changed, what was done, any known issues."
- **Escalate if blocked:** "If you encounter a problem requiring architectural judgment, stop and report back rather than guessing."

---

## Delegation Prompt Template

Document handoff state using `.claude/templates/escalation-report.md`.

Write the agent prompt as:
```
You are a [Tier] agent. Your task: [specific task description]

[LOAD THESE FILES block for this tier]

Constraints:
- Do not modify files outside: [scope]
- Commit all changes before returning
- Report: files changed, what was done, known issues
- Escalate if blocked by architectural questions

Starting state: [brief description or reference to escalation-report.md]
Expected output: [specific, verifiable deliverables]
```

---

## Exit Condition

- Agent prompt written with correct tier and context load list
- Handoff state documented

**Next phase:** `08-subtask-complete.md` (when agent returns with results)
