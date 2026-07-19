---
name: jira
description: Fetch read-only Jira issue, search, and comment data via a lightweight local script, not an MCP tool, for token-frugal lookups
---

# Jira Read-Only Lookup

## Triggers
- User asks about a specific Jira issue by key (e.g. "what's the status of PROJ-123")
- User asks to search issues by JQL-shaped criteria (project, status, assignee, ...)
- User asks what's been said/commented on a specific issue

## Usage
Run the installed script directly via the shell tool — this is a subprocess call, not an
MCP tool call, so it carries no standing tool-schema cost:
```
node {{JIRA_SCRIPT_PATH}} issue <ISSUE_KEY> [--format=json]
node {{JIRA_SCRIPT_PATH}} search "<JQL>" [--format=json]
node {{JIRA_SCRIPT_PATH}} comments <ISSUE_KEY> [--format=json]
```
Default output is a compact plain-text digest (key fields only: summary, status,
assignee, priority, updated, description) — read it directly from stdout, no JSON
parsing needed. Pass `--format=json` only when the full raw Jira payload is actually
required; it costs more tokens to read back.

## Behavioral Flow
1. Identify the issue key from the request, or phrase a JQL query for a search
2. Run the script via the shell tool with the appropriate subcommand
3. Read the plain-text digest from stdout and answer directly from it
4. If the script errors (missing credentials, 404, network failure), surface its error
   message as-is — it's already redacted of any credential and safe to show verbatim

## Requirements
- Only usable if this machine installed the `jira` tool (`--all` or `--tool=jira` at
  plugin deploy time). Before running anything, check whether the command above still
  contains the literal text `{{JIRA_SCRIPT_PATH}}` — if so, it was never substituted
  with a real path, meaning the tool isn't installed here. Say that directly rather than
  running the literal placeholder or guessing at Jira data.
- Credentials come from `~/.copilot/tools/.env` (`JIRA_BASE_URL`, `JIRA_EMAIL`,
  `JIRA_API_TOKEN`), set up once by the user — this skill never reads, writes, or asks
  for those values directly.

## Boundaries

**Will:**
- Fetch and summarize a single issue, a JQL search, or an issue's comments, read-only
- Default to the compact text digest to keep responses cheap; use `--format=json` only
  when the user explicitly needs the full raw payload

**Will Not:**
- Create, update, comment on, transition, or delete anything in Jira — the underlying
  script has no write-capable code path at all, by construction
- Fall back to a separately configured Jira MCP server, or guess at issue data, if this
  script isn't installed or a call to it fails
