# Reference: Code Hygiene

**Load this file when:** Writing new code, reviewing existing code, or during a code audit.

---

Write clean code from the start so there's less to fix later.

- **No dead code.** Don't leave commented-out blocks, unused imports, or unreachable
  branches. Delete them. Git has history if you need them back.

- **No magic values.** Extract hard-coded strings, numbers, and URLs into named constants
  or config. If a value appears more than once, it needs a single source of truth.

- **Name things clearly.** Variable and function names must describe what they hold or do.
  If you need a comment to explain what a variable is, the name is wrong.

- **Small functions, single purpose.** If a function does two things, split it. If it's
  longer than 40 lines, it does too much.

- **Handle errors explicitly.** No empty catch blocks, no swallowed errors. Log or handle
  every error path. If you're intentionally ignoring an error, comment why.

- **Clean up after yourself.** When you refactor or replace a module, remove the old code,
  update imports, and delete orphaned files. Don't leave stale artifacts.

- **Consistent patterns.** Follow the conventions already established in the codebase. If
  the project uses a specific naming convention, error handling pattern, or file structure,
  match it — don't introduce a new style.

- **Never commit secrets.** API keys, tokens, passwords, and credentials go in `.env` or
  a secrets manager — never in source code or config files that get committed. If you
  accidentally stage a secret, remove it from git history, don't just delete and recommit.

---

## Efficient Code Audits & Reviews

When asked to review, audit, or improve the codebase, **be surgical — not exhaustive.**
The goal is to find things that matter, not generate a comprehensive report on every file.

**Scoping the audit:**
- Ask (or determine from context) what the audit focus is: bugs? security? performance?
  code quality? If unclear, prioritize: bugs/errors → security → logic issues → performance
  → code style.
- Use smart-index to understand project structure FIRST. Identify critical paths and
  high-risk areas before opening any source files.
- Focus on files that have **recently changed** (`git log --oneline -20`) — these are where
  new bugs live. Stable, untouched code is lower priority.
- Skip generated files, vendor directories, lock files, and boilerplate configs.

**During the audit:**
- Work by priority tier. Report critical issues (bugs, security, data loss) first.
  Only move to lower-priority findings if the user asks.
- Read files targeted to the scope — don't open every file. Audit about auth? Read auth
  modules, not CSS.
- When you find an issue: note the file, line, what's wrong, the fix — then move on.
  Don't rewrite code during an audit pass unless asked to fix as you go.
- Group findings by severity, not by file.

**Keep it lean:**
- A good audit is 5–15 focused findings, not a 200-line report.
- If the codebase is clean, say so and stop. Don't manufacture findings.
- If scope is large, propose auditing in phases.
