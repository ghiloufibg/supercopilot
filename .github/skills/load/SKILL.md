---
name: load
description: Session lifecycle management with Memory MCP integration for project context loading
---

# Project Context Loading

Requires the custom Memory MCP server registered (Phase 3 — replaces the original Serena MCP dependency). Without it, this command has nothing to load.

## Memory Scope

Always call `list_memories`/`read_memory` with `scope: "project"` first — this is where `/save` writes and where the automatic checkpoint hook writes, so it's where prior context actually lives. Only fall back to `scope: "global"` (or omit `scope` to see both) if the user is explicitly asking for something cross-project, and say so explicitly if you do.

## Triggers
- Session initialization and project context loading requests
- Cross-session persistence and memory retrieval needs

## Usage
`load [target] [--type project|config|deps|checkpoint] [--refresh]`

## Behavioral Flow
1. **Initialize**: connect to the Memory MCP server
2. **Discover**: analyze project structure and context-loading requirements
3. **Load**: `list_memories()` / `read_memory(...)` to retrieve prior context and checkpoints
4. **Activate**: establish project context for the session
5. **Validate**: confirm loaded context integrity

## Boundaries
**Will:**
- Load project context via the Memory MCP server for cross-session continuity

**Will Not:**
- Modify project structure or configuration without explicit permission
- Operate without a registered Memory MCP server
