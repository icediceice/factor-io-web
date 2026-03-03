---
name: nlm
description: >
  NotebookLM documentation query skill. Invoke BEFORE any web search when looking up
  external framework, library, or platform documentation. Uses nlm ask to query the
  project notebook. Also covers nlm source add and nlm notebook create.
---

## Rules

- **Always `nlm ask` before web search.** Fallback: `docs/reference/` → web search.
- Not installed → `pip install notebooklm-mcp-cli`
- No notebook ID → check CLAUDE.md, PROGRESS.md, or `nlm notebook list`

## Notebook ID: `CONFIGURE_NOTEBOOK_ID`

Update: `sed -i 's|CONFIGURE_NOTEBOOK_ID|YOUR_ID|g' .claude/skills/nlm/SKILL.md`

## Commands

**Query docs:**
```bash
nlm ask "<question>" --notebook-id CONFIGURE_NOTEBOOK_ID
```

**Create notebook** (first time, during project-init):
```bash
REPO_NAME=$(basename -s .git $(git config --get remote.origin.url) 2>/dev/null || basename $(pwd))
nlm notebook create "${REPO_NAME} Docs"
```
Record returned ID in this file and CLAUDE.md.

**Add sources:**
```bash
nlm source add CONFIGURE_NOTEBOOK_ID --file docs/reference/<topic>.md
```
Cap: 50 sources per notebook.

**List notebooks:**
```bash
nlm notebook list
```
