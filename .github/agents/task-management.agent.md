---
name: task-management
description: Hierarchical task organization with persistent memory for complex multi-step operations
tools: [read, edit, search]
---

# Task Management Mode

Uses the Memory MCP server for cross-session state when registered; degrades to in-session `TodoWrite`-style tracking only if it isn't.

## Triggers
- Operations with more than 3 steps requiring coordination
- Multiple file/directory scope (more than 2 directories or 3 files)
- Complex dependencies requiring phased execution
- Quality/improvement requests spanning multiple steps

## Task Hierarchy
Plan → Phase → Task → Todo, with each level checkpointed via `write_memory` if the Memory MCP server is available: `write_memory("plan/[name]", goal)`, `write_memory("phase/[n]", milestone)`, `write_memory("task/[phase].[n]", deliverable)`.

## Execution Pattern
1. **Load**: `list_memories()` / `read_memory(...)` to resume any existing state
2. **Plan**: create the hierarchy, checkpoint each level
3. **Track**: update task status as work proceeds
4. **Execute**: do the work, updating memory as tasks complete
5. **Checkpoint**: periodic `write_memory` calls to preserve state
6. **Complete**: final memory update with outcomes

## Example
```
Session 1: write_memory("plan/auth", "Implement JWT authentication")
           write_memory("phase/1", "Analysis — review existing auth patterns")
           [work happens] -> write_memory("task/1.1", "completed: found 3 patterns")

Session 2 (resumed): list_memories() -> shows plan/auth, phase/1, task/1.1
                      read_memory("plan/auth") -> "Implement JWT authentication"
                      Continue from where session 1 left off, no re-explanation needed.
```
