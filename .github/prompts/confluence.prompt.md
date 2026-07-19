---
description: Fetch read-only Confluence page, search, and child-page data via a lightweight local script, not an MCP tool, for token-frugal lookups
---

This prompt mirrors the `confluence` skill — see `.github/skills/confluence/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/confluence` invocation Copilot CLI gets natively from Skills.

# Confluence Read-Only Lookup

## Triggers
- User asks about the content of a specific Confluence page by ID or link
- User asks to search Confluence by CQL-shaped criteria (space, title, text)
- User asks what sub-pages exist under a given page

## Usage
Run the installed script directly via the shell tool — this is a subprocess call, not an
MCP tool call, so it carries no standing tool-schema cost:
```
node {{CONFLUENCE_SCRIPT_PATH}} page <PAGE_ID> [--format=json]
node {{CONFLUENCE_SCRIPT_PATH}} search "<CQL>" [--format=json]
node {{CONFLUENCE_SCRIPT_PATH}} children <PAGE_ID> [--format=json]
```
Default output is a compact plain-text digest (id, title, space, last-updated, body
text with HTML stripped) — read it directly from stdout, no JSON parsing needed. Pass
`--format=json` only when the full raw Confluence payload is actually required; it
costs more tokens to read back.

## Behavioral Flow
1. Identify the page ID from the request (or extract it from a pasted Confluence URL),
   or phrase a CQL query for a search
2. Run the script via the shell tool with the appropriate subcommand
3. Read the plain-text digest from stdout and answer directly from it
4. If the script errors (missing credentials, 404, network failure), surface its error
   message as-is — it's already redacted of any credential and safe to show verbatim

## Requirements
- Only usable if this machine installed the `confluence` tool (`--all` or
  `--tool=confluence` at plugin deploy time). Before running anything, check whether the
  command above still contains the literal text `{{CONFLUENCE_SCRIPT_PATH}}` — if so, it
  was never substituted with a real path, meaning the tool isn't installed here. Say
  that directly rather than running the literal placeholder or guessing at page content.
- Credentials come from `~/.copilot/tools/.env` (`CONFLUENCE_BASE_URL`,
  `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`), set up once by the user — this skill
  never reads, writes, or asks for those values directly.

## Boundaries

**Will:**
- Fetch and summarize a single page, a CQL search, or a page's child pages, read-only
- Default to the compact text digest to keep responses cheap; use `--format=json` only
  when the user explicitly needs the full raw payload

**Will Not:**
- Create, edit, comment on, or delete any Confluence content — the underlying script
  has no write-capable code path at all, by construction
- Fall back to a separately configured Confluence MCP server, or guess at page content,
  if this script isn't installed or a call to it fails
