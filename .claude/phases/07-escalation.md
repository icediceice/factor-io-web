# Phase 07 — Escalation

**Trigger:** Current tier cannot complete the task. Escalation to a higher-capability model needed.

---

## When to Escalate (Up)

**Escalate to Opus when:**
- The problem requires reasoning across many files or systems simultaneously
- There is genuine architectural ambiguity with significant competing trade-offs
- Debugging a subtle logic, concurrency, or memory bug that resists straightforward analysis
- Security review, threat modeling, or adversarial analysis
- The task failed at Sonnet tier and the approach was sound

**Do NOT escalate because:**
- The task is large (large ≠ complex — large structured work stays at Sonnet)
- You want "more intelligence" on a straightforward task
- The first attempt failed — attempt at least one alternative approach at current tier before escalating

---

## Escalation Report

Use `.claude/templates/escalation-report.md` to hand off state cleanly.

The report must include:
1. **What has been done** — committed files, what is working now
2. **What is specifically blocking this tier** — precise description, not "it's too hard"
3. **What the Opus agent needs to produce** — specific deliverables, not "figure it out"
4. **Failed approaches** — what was tried and why it didn't work (so Opus doesn't repeat)

---

## Escalation Checklist

- [ ] Committed all current work so Opus sees a clean starting state
- [ ] Escalation report written with precise blocking reason
- [ ] Expected output is specific and verifiable
- [ ] At least one alternative approach was tried at current tier before escalating

---

## De-escalation (Returning to Sonnet After Opus Completes)

When Opus returns with its sub-task result:
1. Review the output against the expected output in the escalation report
2. Integrate the result with current work
3. Verify the integration (run tests or re-read affected files)
4. Continue remaining tasks at Sonnet tier
5. Go to `08-subtask-complete.md` to process the handoff

---

## Tier Override Write-Back

After delivering the escalation report, add a tier override to PROGRESS.md:

```markdown
### Tier Overrides
- [affected area] → minimum [recommended tier] — escalated from [current tier] on [YYYY-MM-DD], reason: [one-line from report]
```

Example:
```
### Tier Overrides
- Auth token validation → minimum Opus — escalated from Sonnet on 2025-03-05, reason: cross-service JWT state machine with race condition
```

If PROGRESS.md already has a `### Tier Overrides` section, append the new line.
If not, add the section after Task Queue.

This ensures future sessions don't repeat the same under-tiering mistake.

---

## Exit Condition

- Escalation report complete and handed off to Opus
- Tier override written to PROGRESS.md
- OR: alternative approach found, continuing at Sonnet tier (no override needed)

**Next phase:** `08-subtask-complete.md` (after Opus returns)
