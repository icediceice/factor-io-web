# Reference: Model Tiering

**Load this file when:** Choosing which Claude model tier to use for a task or sub-task.

---

## Tier Definitions

| Tier | Model | When to Use |
|------|-------|-------------|
| Tier 1 | Claude Opus 4.6 (`claude-opus-4-6`) | Complex reasoning, architecture decisions, cross-system analysis, ambiguous debugging, security review |
| Tier 2 | Claude Sonnet 4.6 (`claude-sonnet-4-6`) | General implementation, code review, refactoring, most feature work |
| Tier 3 | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | Routine transforms, simple lookups, boilerplate generation, formatting |

---

## Decision Heuristic

Start at Tier 2 (Sonnet). Escalate up or delegate down based on these signals:

### Escalate to Tier 1 (Opus) when:
- The problem requires reasoning across many files or systems simultaneously
- There is genuine architectural ambiguity with significant trade-offs
- Debugging a subtle logic or concurrency bug that resists straightforward analysis
- Security review or threat modeling
- The task failed at Tier 2 and the approach was sound

### Stay at Tier 2 (Sonnet) for:
- Most coding tasks — implementing features, fixing bugs, refactoring
- Code review and explanation
- Multi-file changes with clear structure
- Test writing

### Delegate to Tier 3 (Haiku) for:
- Simple, repetitive code generation (boilerplate, scaffolding)
- Format conversion (JSON → CSV, rename variables)
- Quick factual lookups within known context
- Generating structured output from well-defined input

---

## Parallel vs. Sequential

### Use parallel sub-agents when:
- Tasks are truly independent (no shared state, no ordering dependency)
- Each sub-task is self-contained and has a clear handoff point
- You have 3+ independent tasks that would each take >2 minutes sequentially

### Use sequential (same agent) when:
- Tasks share context (output of one informs the next)
- Tasks modify overlapping files
- Order matters for correctness
- The total work is small enough that parallelism adds overhead without benefit

### When escalating to a sub-agent:
Use `.claude/templates/escalation-report.md` to hand off state cleanly.
Include: current tier, recommended tier, what's been done, what files are involved,
what the sub-agent needs to produce.

---

## Cost Awareness

Every model call has a cost. Follow this priority:
1. Completing in the current tier before escalating
2. Batching related questions into one call over making multiple small calls
3. Using Gemini CLI (free) for codebase exploration before loading files into Claude context

Escalation is a tool, not a default. If Sonnet can handle it, keep it at Sonnet.
