# Skill: Session Start

**Trigger:** New session begins, or `!p` reset when status is empty/absent.

---

## Checklist — Every item mandatory. No skip. No model exempt.

- [ ] Gemini CLI available and up to date (Step 1)
- [ ] Rate-limit pacing initialized (Step 2)
- [ ] `.geminiignore` present in project root (Step 3)
- [ ] `PROGRESS.md` read — Current Focus and Task Queue noted
- [ ] Do NOT read `.claude/history/progress-archive.md` unless explicitly asked
- [ ] Current Focus set for this session
- [ ] `/tmp/.blink_session_booted` created (Step 4 — unlocks source reads)

Failure on any item = session not initialized. No exceptions.

---

## Step 1 — Verify & Update Gemini CLI

```bash
which gemini && gemini --version
```
If not found, install:
```bash
npm install -g @google/gemini-cli && gemini
```
If found, ensure it's up to date:
```bash
npm update -g @google/gemini-cli && gemini --version
```

## Step 2 — Detect Auth & Set Pacing

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

## Step 3 — Create .geminiignore if Missing

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

## Step 4 — Unlock Session Gate

This MUST be the final step — it unlocks source code access for the session.

```bash
touch /tmp/.blink_session_booted
echo "[session-gate] Session initialized — source code access unlocked."
```

---

## Mid-Session Recovery (Compaction)

If you suspect compaction occurred (lost track of work, context feels thin, cannot
recall plan specifics):

1. Read `.claude/active-plan.md` — cheap and definitive
2. Check Status and re-enter the appropriate section:
   - `approved` → PRE-EXECUTE or EXECUTION based on task size
   - `in-progress` → EXECUTION, continue from first unchecked step
   - `paused` → inform user the previous plan is paused, await direction
   - absent/empty → no active task, await user direction
3. Reload the skill file — do NOT rely on memory of previous reads
4. File boundary in `active-plan.md` is authoritative — do not touch files not listed

**Signs compaction occurred:**
- Cannot recall plan specifics (steps, files, tier)
- Cannot recall which step you were on
- Cannot recall sub-agent assignments or status
- Conversation feels like it "jumped" — recent context exists but middle is vague

If `active-plan.md` has content and you don't remember writing it, compaction occurred.

---

## Index Cache

Smart-index results are valid within the current session until compaction occurs.
Do not assume file paths in PROGRESS.md are current — verify via `index_query` if
not confirmed this session.
