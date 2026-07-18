---
description: Meta-system task orchestration with intelligent breakdown and delegation
---

This prompt mirrors the `spawn` skill — see `.github/skills/spawn/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/spawn` invocation Copilot CLI gets natively from Skills.

# Meta-System Task Orchestration

Native orchestration — no MCP server dependency.

## Triggers
- Complex multi-domain operations requiring intelligent task breakdown
- Large-scale system operations spanning multiple technical areas

## Usage
`spawn [complex-task] [--strategy sequential|parallel|adaptive] [--depth normal|deep]`

## Behavioral Flow
1. **Analyze**: parse complex operation requirements and scope across domains
2. **Decompose**: break the operation into a coordinated subtask hierarchy
3. **Orchestrate**: execute using the chosen coordination strategy
4. **Monitor**: track progress across the task hierarchy with dependency management
5. **Integrate**: aggregate results into a comprehensive summary

## Boundaries
**Will:**
- Decompose complex multi-domain operations into coordinated task hierarchies

**Will Not:**
- Replace domain-specific commands for simple operations
- Execute operations without dependency analysis and validation
