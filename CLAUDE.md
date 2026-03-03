# CLAUDE.md — Project Discipline Bootloader

## ⚠️ HARD RULES — Invariants that never change

**1. Discovery reads → smart-index first.**
Don't know which file? → `index_query`. Never `grep -r`, `find`, or `ls` to locate code.
Known paths from your own work or directives → open directly, no query needed.

**2. External docs → NotebookLM first.**
Need framework docs? → `nlm ask`. Never web search or load entire doc files.
Fallback to `docs/reference/` only if `nlm` is unavailable — read targeted sections only.

**3. PROGRESS.md → milestones only.**
Update on: task completed, significant blocker, direction change, session start/end.
Skip: intermediate edits, small fixes, test runs. ~2–5 entries per session.

**4. PROGRESS.md → log code reality.**
Document what the code DOES, not what was planned. Every complete entry needs a
"known issues" line — write "No known issues" if clean. Omitting is not allowed.

---

## Context Pressure — Adapt to Session Depth

Track approximate session depth by turn count.

**Low pressure (turns 1–15):** Load all phase files and references as directed. Full protocol.

**Medium pressure (turns 16–30):** Before loading a reference file, check:
- Have I loaded this exact file earlier this session?
- Do I remember the specific section I need?

If BOTH are true, use recall instead of reloading. If unsure, reload.
NEVER skip reloading phase files — STOP checklists always get fresh reads.

**High pressure (turns 30+):** Same as medium, plus:
- Use inline tool syntax recall instead of loading `tools.md` if you've used that tool this session
- When updating PROGRESS.md, keep entries shorter
- Suggest a session handoff to the user if significant work remains

This rule applies to reference files only. Phase file STOP checklists are
**always reloaded** regardless of context pressure. Behavioral gates never get skipped.

---

## Compaction Recovery

If you suspect context compaction has occurred (you cannot recall details from
earlier in the conversation, context feels thin, or you've lost track of what
you were doing):

1. Read `.claude/active-plan.md`
2. Check the status field
3. Re-enter the appropriate phase:
   - `approved` → load phase 04 or 05 based on task size
   - `in-progress` → load phase 05, continue from first unchecked step
   - `paused` → inform user the previous plan is paused, await direction
   - (absent/empty) → no active task, await user direction
4. Reload the phase file — do not rely on memory of previous reads
5. File boundary in `active-plan.md` is authoritative — do not touch files not listed

Do NOT re-run `index_summarize` unless you need to discover new file locations.
Smart-index behavioral rules in phase files will trigger index queries when needed.

Signs that compaction likely occurred:
- You cannot recall specifics of the approved plan (steps, files, tier)
- You cannot recall which step you were working on
- You cannot recall sub-agent assignments or their status
- The conversation feels like it "jumped" — recent context exists but middle is vague

When in doubt, read `.claude/active-plan.md`. It's a file read — cheap and definitive.
If the file has content and you don't remember writing it, compaction occurred. Recover.

---

## Phase Dispatch Table

At each decision point, load the appropriate phase file from `.claude/phases/`.

| When | Load |
|------|------|
| Starting a new session | `01-session-start.md` |
| Receiving a new task | `02-task-received.md` |
| Task needs a plan | `03-planning.md` |
| Pre-execute boundary check (Size L only) | `04-pre-execute.md` |
| Actively coding | `05-execution.md` |
| Delegating to a sub-agent | `06-delegation.md` |
| Escalating to a higher tier | `07-escalation.md` |
| Sub-task / delegated work returned | `08-subtask-complete.md` |
| Ending the session | `09-session-end.md` |

Load the file. Complete every STOP checklist item before proceeding. Then follow the phase instructions.

---

## Reference Library

Load only when a phase instructs it or you explicitly need it.

| Reference | Load When |
|-----------|-----------|
| `references/tools.md` | You need Gemini CLI or NotebookLM invocation syntax |
| `references/tiering.md` | Choosing which model tier to use |
| `references/code-hygiene.md` | Writing or reviewing code |
| `references/git-discipline.md` | Committing or pushing |
| `references/progress-tracking.md` | Formatting or compacting PROGRESS.md |

All reference files are in `.claude/references/`.

---

## NotebookLM

**Notebook:** factor-io-web Docs
**ID:** `c03ca4e9-c81e-498f-aa56-38675b140280`
**URL:** https://notebooklm.google.com/notebook/c03ca4e9-c81e-498f-aa56-38675b140280

Sources: none yet — upload `docs/reference/` files as project stack is defined.
