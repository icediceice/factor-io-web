# Skill: Delegation

**Trigger:** Task requires parallel work, a different model tier, or a sub-agent.

---

## When to Delegate

**Delegate when:**
- Work can be parallelized (independent sub-tasks with clean handoff points)
- A sub-task is below the current tier's optimal use (Sonnet → Haiku for rename/format)
- A sub-task needs higher capability (Sonnet → Opus for architecture — see ESCALATION in CLAUDE.md)

**Do NOT delegate when:**
- Sub-tasks share state or ordering matters
- Total work is small enough that delegation overhead exceeds the benefit
- You're blocked and need the result before continuing

---

## Pre-Delegation Checklist — Every item mandatory.

- [ ] `active-plan.md` Status set to `delegating`
- [ ] Each subtask in the Delegation section set to `status: running`

Failure on any item = do not delegate. No exceptions.

---

## Tier-Specific Context Load Lists

Match the load list to the tier. Giving irrelevant context reduces signal-to-noise.

**Haiku agent (mechanical — rename, format, simple transform, boilerplate):**
```
LOAD THESE FILES BEFORE STARTING:
- .claude/skills/commit-and-log.md

Commit cadence: batch commits at logical group boundaries (1-3 commits per subtask).
Format: chore: [batch description]
```

**Sonnet agent (engineering — implementation, refactor, bug fix):**
```
LOAD THESE FILES BEFORE STARTING:
- .claude/skills/smart-index.md  (look up: index_query, index_batch)
- .claude/skills/commit-and-log.md

Commit cadence: commit after each logical unit of work (one fix/feature/refactor = one commit).
```

**Opus agent (architect — design, complex debugging, security review):**
```
LOAD THESE FILES BEFORE STARTING:
- .claude/skills/smart-index.md
- .claude/skills/commit-and-log.md
- .claude/references/tiering.md  (if sub-delegation might be needed)

Commit cadence: commit aggressively — every individual change, wip: before any risky
operation, checkpoint: after cross-cutting changes even if work is incomplete.
```

---

## Hard Rules for All Agent Prompts (Every Tier)

MUST include ALL of these in every delegation prompt:
- **Boundaries:** "Do not modify files outside [scope]. Report back if you need to touch something outside this."
- **Commit:** "Commit all changes before returning. Format: `<type>: <short description>`"
- **Report back:** "When complete, provide: files changed, what was done, any known issues."
- **Escalate if blocked:** "If you encounter a problem requiring architectural judgment, stop and report back rather than guessing."

---

## Delegation Prompt Template

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

Use `.claude/templates/escalation-report.md` for handoff state documentation.

---

## Subtask Review (when agent returns)

### 1. Verify Output

- [ ] Agent committed its changes? `git log --oneline -5`
- [ ] Output matches what was specified in the delegation prompt?
- [ ] Any known issues reported by the agent?
- [ ] `active-plan.md` Delegation section updated: status → `complete`, one-line result

### 2. Integrate

If agent work needs combining with the main task thread:
- Resolve conflicts
- Run verification (tests, build, linter)
- Commit integration: `git commit -m "chore: integrate [subtask name]"`

### 3. Handle Incomplete Output

- **Minor:** Fix at current tier and continue
- **Significant:** Revert (`git revert` or `git reset`), re-delegate with corrected prompt
  documenting what went wrong

Do NOT stack corrections on top of bad work. Revert cleanly, then redo.

### 4. Resume

- Update PROGRESS.md to reflect delegated work as complete
- Set `active-plan.md` Status back to `in-progress`
- Return to EXECUTION section in CLAUDE.md
