#!/usr/bin/env bash
# session-gate.sh — PreToolUse hook
# Blocks source code reads until session start protocol (phase 01) completes.
# Phase 01 creates /tmp/.blink_session_booted as its final step.
# Installed by EDCR scaffold. See .claude/skills/session-start.md.

SENTINEL="/tmp/.blink_session_booted"

# Fast path: session already initialized — allow everything
[ -f "$SENTINEL" ] && exit 0

# Read tool input from stdin
INPUT=$(cat)

# Extract paths (requires jq)
if ! command -v jq &>/dev/null; then
  echo "BLOCKED: jq required for session gate. Install: sudo apt install jq"
  exit 2
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
GLOB_PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // ""')

# Whitelist check — returns 0 if any argument matches allowed paths
whitelist_match() {
  for arg in "$@"; do
    [ -z "$arg" ] && continue
    case "$arg" in
      */.claude/*|*/.claude)   return 0 ;;
      */memory/*)              return 0 ;;
      *CLAUDE.md*)             return 0 ;;
      *PROGRESS.md*)           return 0 ;;
      *.geminiignore*)         return 0 ;;
      *SKILL.md*)              return 0 ;;
    esac
    [[ "$arg" == "${HOME}/.claude/"* ]] && return 0
  done
  return 1
}

if whitelist_match "$FILE_PATH" "$GLOB_PATTERN"; then
  exit 0
fi

# Not whitelisted — block
echo "BLOCKED: Session start protocol not completed. Load .claude/skills/session-start.md and complete every step before accessing source code."
exit 2
