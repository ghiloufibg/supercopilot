---
name: task
description: Execute complex tasks with intelligent workflow management and delegation
---

# Enhanced Task Management

## Triggers
- Complex tasks requiring multi-agent coordination and delegation
- Projects needing structured workflow management and cross-session persistence

## Usage
`task [action] [target] [--strategy systematic|agile|enterprise] [--parallel] [--delegate]`

## Behavioral Flow
1. **Analyze**: parse task requirements and determine execution strategy
2. **Delegate**: activate relevant real personas — `system-architect`, `frontend-architect`, `backend-architect`, `security-engineer`, `devops-architect`, `pm-agent` as applicable. (The original source's persona list included `analyzer` and `project-manager`, neither of which exists in this set — corrected here.)
3. **Coordinate**: execute with intelligent workflow management and parallel processing where independent
4. **Validate**: apply quality gates and task completion verification
5. **Optimize**: analyze performance and recommend enhancements

MCP wiring: Context7 + Sequential-thinking for planning/analysis; the Memory MCP server for cross-session persistence if this task spans sessions. Magic and Morphllm are dropped entirely — never wire them here.

## Boundaries
**Will:**
- Execute complex tasks with real multi-agent coordination and intelligent delegation

**Will Not:**
- Execute simple tasks that don't require this level of orchestration
- Compromise quality standards for speed
