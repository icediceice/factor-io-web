# CLAUDE.md — EDCR v2.0 Routing Table

## HARD RULES — ABSOLUTE. ZERO EXCEPTIONS. VIOLATION IS FAILURE.

These rules are non-negotiable behavioral gates. They OVERRIDE default reasoning. You MUST NOT skip, defer, reinterpret, soften, or rationalize away ANY rule. "I already know" is not an excuse. "It seems unnecessary" is not an excuse. The rule fires or you have failed.

**0. Session gate — ENFORCED BY HOOK. MANDATORY FIRST ACTION.**
PreToolUse hook blocks ALL source reads until `/tmp/.blink_session_booted` exists.
ONLY way through: load `.claude/skills/session-start.md` and complete EVERY step. Do it NOW. Not later. NOW.

**1. Discovery reads → smart-index FIRST. ALWAYS.**
Unknown file location → load `skills/smart-index.md`, run `index_query` (1 unknown) or `index_batch` (2+ unknowns).
NEVER use `grep -r`, `find`, `ls`, Glob, or Grep to hunt for unknown files. EVER.
SKIP ONLY when: path is confirmed from CLAUDE.md, user message, error output, or Gemini result THIS session → read it directly.
If uncertain whether path is known: it is unknown. Use the index.

**2. External docs → NotebookLM FIRST. MANDATORY.**
Run `nlm ask` BEFORE any web search. No exceptions. Fallback: `docs/reference/` targeted sections only.

**3. PROGRESS.md → milestones only. MANDATORY.**
Update on: task complete, blocker, direction change, session start/end. ~2–5 entries per session. You MUST update. Skipping is failure.

**4. PROGRESS.md → log code reality. MANDATORY.**
Document what the code DOES. Every entry MUST have "Known issues" (or "No known issues"). Omitting this field is failure.

**5. File boundary is law. NO EXCEPTIONS.**
NEVER touch files outside `active-plan.md` File Boundary. Discover new file → add to boundary FIRST, then touch it. Not the reverse.

**6. Skills are atomic. MANDATORY.**
When a skill triggers, load it and complete it IN FULL before returning here. No interleaving. No partial execution. No "I'll do it later."

---

## `!p` — Protocol Reset

STOP → read `.claude/active-plan.md` → route by Status:

| Status | Go to | Status | Go to |
|--------|-------|--------|-------|
| empty/absent | SESSION START | `paused` | Inform user, await direction |
| `approved` | PRE-EXECUTE | `delegating` | DELEGATION |
| `in-progress` | EXECUTION | | |

---

## SESSION START
Load `.claude/skills/session-start.md`. Complete every step.

## TASK RECEIVED
**Active plan check:** If `in-progress` → ask user: pause or finish first.
**Size:** S (single file, obvious) → one-liner approval → EXECUTION.
M (multi-file, scope clear) → PLANNING. L (cross-cutting) → PLANNING.
**Tier override:** Check PROGRESS.md `### Tier Overrides` — override is minimum tier.
**Debug tasks are NEVER Size S.** Minimum M.

## PLANNING
1. Smart-index to map files (`index_analyze`/`index_trace`)
2. Check `.claude/references/tiering.md` if escalation/delegation needed
3. Write plan to `.claude/active-plan.md` (format: `skills/active-plan.md`)
4. Present to user → on approval: Status `in-progress`

**Size M pre-execute (inline):** file paths confirmed? `git status` clean? correct branch?
**Size L:** go to PRE-EXECUTE separately.

## PRE-EXECUTE
Size L only. Verify: `active-plan.md` approved, all paths confirmed via index, git clean,
correct branch, no stale unstaged changes. Fail → stash/commit first. Pass → EXECUTION.

## EXECUTION
Per step: **0.** Mark `[>]` → **1.** Build/Edit → **2.** Verify (lint→test→build) →
**3.** Commit (load `skills/commit-and-log.md`) → **4.** Mark `[x]`, next `[>]`.
Loop until done → session end or next task.
**Discovery:** unknown location → `smart-index.md` first.
**Blocked:** diagnose → revert cleanly → if stuck → ESCALATION.
**Scope:** unrelated issues → PROGRESS.md Task Queue. No context-switch.

## DELEGATION
Load `.claude/skills/delegation.md`. Complete the protocol.

## ESCALATION
Checklist before escalating:
- [ ] All work committed
- [ ] Alternative approach tried at current tier
- [ ] Report via `.claude/templates/escalation-report.md`: done, blocking reason, deliverables, failed approaches
- [ ] Expected output is specific and verifiable

After: add tier override to PROGRESS.md:
`- [area] → minimum [Tier] — escalated from [tier] on [YYYY-MM-DD], reason: [one-line]`

## SESSION END
- [ ] Stage + commit all work (even `wip:`) → push
- [ ] PROGRESS.md entry: What, Files, Next, Known issues
- [ ] `active-plan.md`: done → clear; paused → keep accurate state
- [ ] Brief developer summary: completed, in-progress, next, blockers

Compact PROGRESS.md if >60 lines (see `commit-and-log.md`).

## COMPACTION RECOVERY
Read `.claude/active-plan.md` → follow `!p` routing.
Full: load `skills/session-start.md` § Mid-Session Recovery.

---

## SKILL TRIGGERS — MANDATORY. EVERY TRIGGER FIRES. NO RATIONALIZATION.

When a trigger condition matches, invoke that skill IMMEDIATELY. Before thinking. Before planning. Before writing code. You do NOT get to decide "it's not needed this time." The trigger fires or you have failed.

| Skill | File | Trigger | Skip allowed? |
|-------|------|---------|---------------|
| Session Start | `skills/session-start.md` | New session. `!p` with no active plan. ALWAYS first. | **NEVER** |
| Active Plan | `skills/active-plan.md` | Creating, transitioning, or pausing ANY plan. | **NEVER** |
| Commit & Log | `skills/commit-and-log.md` | After ANY verified change. At EVERY step boundary. At session end. | **NEVER** |
| Smart Index | `skills/smart-index.md` | ANY unknown file path. ANY architecture mapping. After compaction. | **ONLY** when path already confirmed in context |
| Delegation | `skills/delegation.md` | Spawning ANY sub-agent. Reviewing ANY agent return. | **NEVER** |

### Smart Index — precise skip/fire rule:
- **FIRE** when: you do not have the exact file path from CLAUDE.md, user message, error output, or a Gemini result from THIS session. Uncertainty = unknown = FIRE.
- **SKIP** when: you have a confirmed, concrete path from one of those sources → read it directly. Do not invoke the index for paths you already have.
- **NEVER** use Glob, Grep, find, or ls as a substitute for the index. That is always wrong.

### Enforcement:
**If uncertain whether a trigger applies → it applies. Invoke the skill.**

**Reference:** `.claude/references/tiering.md` — load only when choosing model tier.
