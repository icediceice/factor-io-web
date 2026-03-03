# Phase 01 — Session Start

**Trigger:** New Claude Code session begins on this project.

---

## STOP Checklist

- [ ] Run Gemini CLI session start protocol (Steps 1–4 below)
- [ ] Read `PROGRESS.md` — use Current Focus and Task Queue to orient
- [ ] Do NOT read `.claude/history/progress-archive.md` unless explicitly asked
- [ ] Set Current Focus for this session

---

## Smart-Index Behavioral Rules

These apply for the entire session. Read once here; do not re-read from a reference file.

**Discovery reads require index first:**
- File location unknown → run `index_query` before reading anything
- 2+ unknowns → run `index_batch` (one call, all questions) — never loop index_query
- Multiple files or cross-service task → run `index_analyze` or `index_trace` first

**Never use these to locate code:**
- `grep -r`, `find`, `ls` on source directories
- `ag`, `rg`, `ack` for discovering code locations
- Browsing directories by reading them

**Gemini CLI mechanics:**
- Always use `-p` flag (headless mode only — never agent/interactive mode)
- Never issue more than one Gemini CLI call per response turn
- Always wait for Gemini result before reading any files — no speculative reads
- Quota fallback is built into the pacing wrapper in `references/tools.md`

**Exception:** If the user explicitly asks you to grep or search the codebase (e.g., a codebase audit), follow the user's instruction. The rule prevents self-directed discovery, not user-requested searches.

---

## Instructions

### Step 1 — Verify Gemini CLI
```bash
which gemini && gemini --version
```
If not found, install before continuing:
```bash
npm install -g @google/gemini-cli && gemini
```

### Step 2 — Detect Auth & Set Rate Limit Pacing
```bash
if [ -z "$SMART_INDEX_SLEEP" ]; then
  if [ -n "$GEMINI_API_KEY" ] || [ -n "$GOOGLE_API_KEY" ]; then
    if [ -n "$GOOGLE_CLOUD_PROJECT" ]; then
      export SMART_INDEX_SLEEP=3
      echo "[smart-index] Auth: API Key (paid) — 3s pacing"
    else
      export SMART_INDEX_SLEEP=12
      echo "[smart-index] Auth: API Key (free) — 12s pacing"
    fi
  elif [ -n "$GOOGLE_CLOUD_PROJECT" ] && [ -n "$GOOGLE_CLOUD_LOCATION" ]; then
    export SMART_INDEX_SLEEP=3
    echo "[smart-index] Auth: Vertex AI — 3s pacing"
  else
    export SMART_INDEX_SLEEP=5
    echo "[smart-index] Auth: OAuth (Pro default) — 5s pacing"
  fi
fi
echo 0 > /tmp/.smart_index_last
echo "[smart-index] Rate limit pacing: ${SMART_INDEX_SLEEP}s"
```

### Step 3 — Create .geminiignore if missing
```bash
if [ ! -f .geminiignore ]; then
  cp "$(git rev-parse --show-toplevel)/.geminiignore" . 2>/dev/null || \
  cat > .geminiignore << 'EOF'
node_modules/
dist/
build/
.next/
.venv/
venv/
__pycache__/
*.log
*.lock
coverage/
.git/
*.min.js
*.min.css
*.zip
*.tar.gz
*.mp4
*.png
*.jpg
*.pdf
.idea/
.vscode/
docs/reference/
EOF
  echo "[smart-index] .geminiignore created"
fi
```

### Step 4 — Run index_summarize (Architecture Map)

Look up the `index_summarize` invocation in `.claude/references/tools.md`.
Run it now — get the architecture map before doing anything else.

**Do not read any project files before completing Step 4.**

---

## Index Cache

Smart-index results from **previous sessions are not valid**. The codebase may have
changed between sessions. Every session starts fresh with `index_summarize`.

Do not assume file paths recorded in PROGRESS.md are current — they may be stale.
If you see a path in PROGRESS.md notes and haven't re-confirmed it via index this
session, treat it as a hint to verify, not a confirmed path to use directly.

Within the current session, index results remain valid until compaction occurs
(see `05-execution.md` → Index Result Validity).

---

## Load References

- `.claude/references/tools.md` — for `index_summarize` bash invocation

---

## Exit Condition

- Architecture map obtained from index_summarize
- PROGRESS.md read and Current Focus set for this session

**Next phase:** `02-task-received.md` (when user gives a task) or `05-execution.md` (if continuing an in-progress task from the queue)
