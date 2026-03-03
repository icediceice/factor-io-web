# Tool Reference

Look up the tool you need. Copy the invocation block. Do not read this file end-to-end.

---

## Pacing Wrapper (shared by all Gemini tools)

Paste this at the top of every Gemini invocation. Replace `PROMPT="..."` with the prompt template below.

```bash
_SI_SLEEP="${SMART_INDEX_SLEEP:-5}"
_SI_LAST=$(cat /tmp/.smart_index_last 2>/dev/null || echo 0)
_SI_NOW=$(date +%s)
_SI_ELAPSED=$((_SI_NOW - _SI_LAST))
if [ "$_SI_ELAPSED" -lt "$_SI_SLEEP" ]; then
  sleep $((_SI_SLEEP - _SI_ELAPSED))
fi

PROMPT="..."   # ← replace with prompt template below

date +%s > /tmp/.smart_index_last
RESULT=$(cd /mnt/d/Git/factor-io-web && gemini --yolo -m gemini-2.5-flash -p "$PROMPT" --output-format json 2>&1)
if echo "$RESULT" | grep -qi "quota\|rate.limit\|429\|exhausted"; then
  echo "[smart-index] Flash limit hit — falling back..."
  sleep "$_SI_SLEEP"
  date +%s > /tmp/.smart_index_last
  RESULT=$(cd /mnt/d/Git/factor-io-web && gemini --yolo -m gemini-3-flash-preview -p "$PROMPT" --output-format json 2>&1)
fi
if echo "$RESULT" | grep -qi "quota\|rate.limit\|429\|exhausted\|not.found\|unavailable"; then
  echo "[smart-index] Both models rate limited. Waiting 30s..."
  sleep 30
  date +%s > /tmp/.smart_index_last
  RESULT=$(cd /mnt/d/Git/factor-io-web && gemini --yolo -m gemini-2.5-flash -p "$PROMPT" --output-format json 2>&1)
fi
if echo "$RESULT" | grep -qi "quota\|rate.limit\|429\|exhausted\|not.found\|unavailable"; then
  echo '[smart-index] {"error":"all_models_limited","action":"gemini auth login"}'
else
  echo "$RESULT"
fi
```

---

## index_summarize

**Use:** Session start and after every compaction. Gets the architecture map.

**Prompt template:**
```
PROMPT="Give me a complete architectural overview of this codebase.

Respond ONLY as JSON, no markdown:
{
  \"project_type\": \"what this project is\",
  \"tech_stack\": [\"technology1\", \"technology2\"],
  \"services\": [
    {\"name\": \"service name\", \"purpose\": \"what it does\", \"key_files\": [\"file1\"]}
  ],
  \"entry_points\": [\"how to run or start the project\"],
  \"data_flow\": \"how data moves through the system\",
  \"key_directories\": {\"dir\": \"purpose\"}
}"
```

---

## index_batch

**Use:** 2+ unknown file locations. Always use this instead of looping index_query.

**Prompt template:**
```
PROMPT="Answer all of the following questions about this codebase.

Questions:
1. {QUESTION_1}
2. {QUESTION_2}
3. {QUESTION_3}

Respond ONLY as JSON, no markdown:
{
  \"answers\": [
    {
      \"question\": \"exact question text\",
      \"locations\": [{\"file\": \"relative/path\", \"context\": \"what it does here\"}],
      \"summary\": \"one sentence answer\"
    }
  ]
}"
```

---

## index_query

**Use:** Single unknown file location. Use index_batch if 2+ unknowns.

**Prompt template:**
```
PROMPT="Locate the following in this codebase: {QUESTION}

Respond ONLY as JSON, no markdown:
{
  \"locations\": [
    {\"file\": \"relative/path/to/file\", \"context\": \"what it does here\"}
  ],
  \"summary\": \"one sentence answer\"
}"
```

---

## index_analyze

**Use:** Before modifying anything that touches multiple files. Get impact map first.

**Prompt template:**
```
PROMPT="Analyze the following in this codebase: {QUESTION}

Respond ONLY as JSON, no markdown:
{
  \"answer\": \"clear explanation\",
  \"relevant_files\": [\"file1\", \"file2\"],
  \"data_flow\": \"how data or control moves through the system\",
  \"warnings\": [\"anything important to know before modifying\"]
}"
```

---

## index_trace

**Use:** Tracing a call chain or data flow across files.

**Prompt template:**
```
PROMPT="Trace the following flow in this codebase: from {TRACE_FROM} to {TRACE_TO}

Respond ONLY as JSON, no markdown:
{
  \"chain\": [
    {\"step\": \"1\", \"file\": \"path/to/file\", \"description\": \"what happens here\"}
  ],
  \"entry_point\": \"where it starts\",
  \"exit_point\": \"where it ends\",
  \"summary\": \"one sentence overview of the flow\"
}"
```

---

## nlm ask

**Use:** External framework/library/platform documentation queries.

**Notebook ID:** `CONFIGURE_NOTEBOOK_ID`

```bash
nlm ask "<your question>" --notebook-id CONFIGURE_NOTEBOOK_ID
```

---

## nlm source add

**Use:** Adding new documentation sources to the project notebook.

```bash
nlm source add CONFIGURE_NOTEBOOK_ID --file docs/reference/<topic>.md
```

---

## nlm notebook create

**Use:** Creating the project documentation notebook (first time only).

```bash
REPO_NAME=$(basename -s .git $(git config --get remote.origin.url) 2>/dev/null || basename $(pwd))
nlm notebook create "${REPO_NAME} Docs"
```
