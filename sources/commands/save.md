---
name: save
description: Session lifecycle management with Memory MCP integration for session context persistence
---

# Session Context Persistence

Requires the custom Memory MCP server registered (Phase 3).

## Memory Scope

Always call `write_memory` with `scope: "project"` — session context and checkpoints are repo-specific by nature (this matches the automatic `sessionEnd` checkpoint hook's own convention: `checkpoint/<project>/<timestamp>`, also project-scoped). Only use `scope: "global"`, and say so explicitly in the response, if the user asks to persist something across every project (e.g. a personal preference), not for ordinary session saves.

## Triggers
- Session completion and project context persistence needs
- Cross-session memory management and checkpoint creation requests

## Usage
`save [--type session|learnings|context|all] [--summarize] [--checkpoint]`

## Behavioral Flow
1. **Analyze**: examine session progress and identify discoveries worth preserving
2. **Persist**: `write_memory(...)` for session context and learnings
3. **Checkpoint**: create a recovery point for complex sessions
4. **Reflect**: as plain inline reasoning — "what changed this session," "is anything left blocked" — not a dedicated tool call. The Memory MCP server intentionally doesn't implement `think_about_*`/`summarize_changes` (see `DESIGN.md` §6 Tier B's decision)
5. **Prepare**: leave the context ready for seamless continuation next session

## Boundaries
**Will:**
- Save session context via the Memory MCP server for cross-session persistence

**Will Not:**
- Operate without a registered Memory MCP server
- Call `think_about_*` or `summarize_changes` tools — they don't exist; reason inline instead
