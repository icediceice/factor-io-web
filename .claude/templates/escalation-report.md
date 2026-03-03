# Escalation Report

*Use this template when handing off a sub-task to a higher-tier model or parallel agent.*

---

## Current State

**Current tier:** Tier 2 (Sonnet)
**Recommended tier:** Tier 1 (Opus)
**Reason for escalation:** <why this needs a higher tier — e.g., "architectural decision with complex trade-offs", "subtle concurrency bug resisting straightforward analysis">

---

## Task Description

<Clear description of what the sub-agent needs to accomplish.>

---

## What Has Been Done

<Summary of work already completed. What is already committed and working.>

---

## Files Involved

| File | Current State | What Sub-Agent Should Do |
|------|---------------|--------------------------|
| `path/to/file.ts` | <current state> | <what needs to change> |

---

## Context the Sub-Agent Needs

<Any critical context that isn't obvious from the code. Design decisions already made,
constraints, failed approaches already tried.>

---

## Expected Output

<What should the sub-agent produce? Specific files modified? A plan? A recommendation?
Be precise so the handoff is clean.>

---

## Handoff Checklist

- [ ] All relevant files committed (or noted as uncommitted with `git status`)
- [ ] Current PROGRESS.md is up to date
- [ ] Escalation reason clearly stated
- [ ] Expected output clearly defined
