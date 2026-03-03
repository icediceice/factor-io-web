---
name: smart-index
description: >
  Gemini-powered codebase index for discovery reads. Invoke whenever a file location is
  unknown, for architecture mapping at session start, or after context compaction. Never
  use grep/find/Glob to locate unknown files — use this skill instead. Provides pacing
  wrapper and prompt templates for index_summarize, index_batch, index_query, index_analyze,
  and index_trace.
---

## Rules

- Unknown location → `index_query`. 2+ unknowns → `index_batch` (never loop query).
- Multi-file / cross-service → `index_analyze` or `index_trace`.
- Never use `grep -r`, `find`, `ls`, `rg`, Glob, or Grep for discovery.
- Exception: user explicitly requests a search (audit, etc.).
- `-p` flag always. One Gemini call per response turn. Wait for result before reading files.
- Paths confirmed this session are valid until compaction. `[using cached: path/to/file]`

## Pacing Wrapper

Prepend to every Gemini call. Set `PROMPT="..."` per tool below.

```bash
_SI_SLEEP="${SMART_INDEX_SLEEP:-5}"
_SI_LAST=$(cat /tmp/.smart_index_last 2>/dev/null || echo 0)
_SI_NOW=$(date +%s)
_SI_ELAPSED=$((_SI_NOW - _SI_LAST))
[ "$_SI_ELAPSED" -lt "$_SI_SLEEP" ] && sleep $((_SI_SLEEP - _SI_ELAPSED))

PROMPT="..."

date +%s > /tmp/.smart_index_last
RESULT=$(cd /mnt/d/Git/factor-io-web && gemini --yolo -m gemini-2.5-flash -p "$PROMPT" --output-format json 2>&1)
if echo "$RESULT" | grep -qi "quota\|rate.limit\|429\|exhausted"; then
  sleep "$_SI_SLEEP"; date +%s > /tmp/.smart_index_last
  RESULT=$(cd /mnt/d/Git/factor-io-web && gemini --yolo -m gemini-3-flash-preview -p "$PROMPT" --output-format json 2>&1)
fi
if echo "$RESULT" | grep -qi "quota\|rate.limit\|429\|exhausted\|not.found\|unavailable"; then
  sleep 30; date +%s > /tmp/.smart_index_last
  RESULT=$(cd /mnt/d/Git/factor-io-web && gemini --yolo -m gemini-2.5-flash -p "$PROMPT" --output-format json 2>&1)
fi
if echo "$RESULT" | grep -qi "quota\|rate.limit\|429\|exhausted\|not.found\|unavailable"; then
  echo '[smart-index] {"error":"all_models_limited","action":"gemini auth login"}'
else
  echo "$RESULT"
fi
```

## index_summarize

Session start + after compaction.

```
PROMPT="Give me a complete architectural overview of this codebase.
Respond ONLY as JSON, no markdown:
{\"project_type\":\"...\",\"tech_stack\":[...],\"services\":[{\"name\":\"...\",\"purpose\":\"...\",\"key_files\":[\"...\"]}],\"entry_points\":[...],\"data_flow\":\"...\",\"key_directories\":{\"dir\":\"purpose\"}}"
```

## index_query

Single unknown location. Use `index_batch` for 2+.

```
PROMPT="Locate the following in this codebase: {QUESTION}
Respond ONLY as JSON, no markdown:
{\"locations\":[{\"file\":\"relative/path\",\"context\":\"what\"}],\"summary\":\"...\"}"
```

## index_batch

2+ unknowns. Always use instead of looping query.

```
PROMPT="Answer all questions about this codebase.
Questions: 1. {Q1} 2. {Q2} 3. {Q3}
Respond ONLY as JSON, no markdown:
{\"answers\":[{\"question\":\"...\",\"locations\":[{\"file\":\"path\",\"context\":\"what\"}],\"summary\":\"...\"}]}"
```

## index_analyze

Multi-file task impact map.

```
PROMPT="Analyze the following in this codebase: {QUESTION}
Respond ONLY as JSON, no markdown:
{\"answer\":\"...\",\"relevant_files\":[\"...\"],\"data_flow\":\"...\",\"warnings\":[\"...\"]}"
```

## index_trace

Cross-file flow trace.

```
PROMPT="Trace the following flow: from {FROM} to {TO}
Respond ONLY as JSON, no markdown:
{\"chain\":[{\"step\":\"1\",\"file\":\"path\",\"description\":\"what\"}],\"entry_point\":\"...\",\"exit_point\":\"...\",\"summary\":\"...\"}"
```
