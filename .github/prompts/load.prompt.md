---
description: Session lifecycle management with Memory MCP integration for project context loading
---

This prompt mirrors the `load` skill — see `.github/skills/load/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/load` invocation Copilot CLI gets natively from Skills.

# Project Context Loading

Requires the custom Memory MCP server registered (Phase 3 — replaces the original Serena MCP dependency). Without it, this command has nothing to load.

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
