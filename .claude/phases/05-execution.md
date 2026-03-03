# Phase 05 — Execution

**Trigger:** Actively writing code. File paths are confirmed and git is clean.

---

## Phase Entry Gate

Every time this phase is loaded (including re-entries from the loop):

- [ ] Append `05` to `Phase Trace:` in `.claude/active-plan.md`
  - e.g. `02→03→05` on first entry, `02→03→05→05` on second pass

---

## Discovery Read Gate

**Before reading any file whose location is not already confirmed in this session:**

```
STOP — run index_query first (or index_batch for 2+ unknowns)
```

- Look up the invocation in `.claude/references/tools.md`
- Never use `grep -r`, `find`, `ls`, or directory browsing to locate code
- Never issue more than one Gemini CLI call per response turn
- Always wait for Gemini result before reading any files
- Read ONLY the files listed in the Gemini response — no extras

**Exception:** If the user explicitly asks you to grep or search, follow the user's instruction.

## Index Result Validity

File paths confirmed by smart-index earlier **in this session** are valid for the
rest of the session. Do NOT re-query smart-index for a file already located.

Re-query ONLY when:
- You need files not yet located in this session
- Compaction occurred (all previous index results are invalidated — re-run `index_summarize`)
- The task involves newly created files that didn't exist during earlier queries

When reusing a confirmed path: `[using cached index result for path/to/file]`

---

## Commit Gate

Check this after EACH logical change:

```
✓ Change verified working          → commit now
✓ About to touch a 2nd file        → commit current work first
✓ Approaching a phase transition   → commit before exiting
✗ Skip commit only for:            trivial typo fix within same logical unit
```

---

## Progress Update Gate

```
MUST update PROGRESS.md:           SKIP update:
- Task completed                   - Intermediate edits
- Significant blocker hit          - Test runs
- Direction change                 - Routine commits
- Session start or end
```

---

## Build → Verify → Commit Loop

For each plan step, in order:

**0. Mark step in-progress**
In `.claude/active-plan.md`: change current step from `[ ]` to `[>]`.
Update `Current Step:` number if it hasn't been set yet.
- [ ] active-plan.md current step marked `[>]`

**1. Build / Edit**
- Use `Edit` (targeted line changes). Do not rewrite entire files.
- Read back the changed section after every edit — do not proceed until the edit is confirmed correct
- Load `.claude/references/code-hygiene.md` before writing substantive new code

**2. Verify**
Run in order (cheapest first):
- Syntax / linter
- Unit tests for the changed behavior
- Build / integration test if change crosses module boundaries
- If verification fails → diagnose first, then either fix or revert (see below)

**3. Commit**
```bash
git add <specific-files>               # stage what belongs to this change
git commit -m "<type>: <description>"  # feat / fix / refactor / chore / wip
git push                               # immediately after commit
```
Load `.claude/references/git-discipline.md` for format rules if needed.

**4. Mark step complete**
In `.claude/active-plan.md`: change `[>]` to `[x]`. Mark next step `[>]`. Increment `Current Step:`.
If a step revealed new files to touch, add them to **File Boundary** and note under **Boundary Changes**.
- [ ] active-plan.md step marked `[x]`, next step marked `[>]` (or Status: complete if last step)

---

---

## Revert Cleanly When Blocked

Do NOT layer fix on top of fix. First diagnose, then revert if approach is wrong:

```bash
git checkout -- <file>    # discard changes to one file
git checkout -- .         # discard all uncommitted changes
git reset --soft HEAD~1   # undo last commit, keep changes staged
git stash                 # stash and try fresh approach
```

---

## Stay on Scope

If you notice something unrelated that needs fixing:
- Add it to Task Queue in PROGRESS.md
- Keep going on the current task
- Do not context-switch mid-task

---

## Load References

- `.claude/references/tools.md` — for discovery reads (index_query / index_batch)
- `.claude/references/code-hygiene.md` — when writing substantial new code
- `.claude/references/git-discipline.md` — for commit format and push rules

---

## Exit Condition

One logical change is complete: edited, verified, committed, pushed.

**Next phase:**
- More work remaining on task → loop back to this phase
- Task complete → `09-session-end.md` (or continue to next task via `02-task-received.md`)
- Sub-task needs delegation → `06-delegation.md`
- Blocked, needs escalation → `07-escalation.md`
