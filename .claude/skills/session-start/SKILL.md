---
name: session-start
description: >
  Session initialization protocol. Invoke at session start, on !p reset with no active
  plan, or after context compaction. Verifies Gemini CLI, sets rate-limit pacing, creates
  .geminiignore, reads PROGRESS.md, and unlocks the session gate.
---

## Checklist

All items mandatory. Failure on any = session not initialized.

- [ ] Gemini CLI available (Step 1)
- [ ] Rate-limit pacing initialized (Step 2)
- [ ] `.geminiignore` present (Step 3)
- [ ] `PROGRESS.md` read — Current Focus and Task Queue noted
- [ ] Do NOT read `.claude/history/progress-archive.md` unless asked
- [ ] `/tmp/.blink_session_booted` created (Step 4)

## Step 1 — Gemini CLI

```bash
which gemini && gemini --version
```
Missing → `npm install -g @google/gemini-cli && gemini`
Present → `npm update -g @google/gemini-cli && gemini --version`

## Step 2 — Auth & Pacing

```bash
if [ -z "$SMART_INDEX_SLEEP" ]; then
  if [ -n "$GEMINI_API_KEY" ] || [ -n "$GOOGLE_API_KEY" ]; then
    [ -n "$GOOGLE_CLOUD_PROJECT" ] && export SMART_INDEX_SLEEP=3 || export SMART_INDEX_SLEEP=12
  elif [ -n "$GOOGLE_CLOUD_PROJECT" ] && [ -n "$GOOGLE_CLOUD_LOCATION" ]; then
    export SMART_INDEX_SLEEP=3
  else
    export SMART_INDEX_SLEEP=5
  fi
fi
echo 0 > /tmp/.smart_index_last
echo "[smart-index] Pacing: ${SMART_INDEX_SLEEP}s"
```

## Step 3 — .geminiignore

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
fi
```

## Step 4 — Unlock Gate

Must be last — unlocks source code reads for the session.

```bash
touch /tmp/.blink_session_booted
echo "[session-gate] Session initialized."
```

## Compaction Recovery

If context feels thin or you can't recall plan specifics:
1. Read `.claude/active-plan.md` → follow `!p` routing in CLAUDE.md
2. Reload skill files — don't trust memory after compaction
