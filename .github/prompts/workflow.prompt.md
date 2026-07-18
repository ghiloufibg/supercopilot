---
description: Generate structured implementation workflows from PRDs and feature requirements
---

This prompt mirrors the `workflow` skill — see `.github/skills/workflow/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/workflow` invocation Copilot CLI gets natively from Skills.

# Implementation Workflow Generator

## Triggers
- PRD and feature specification analysis for implementation planning
- Structured workflow generation for development projects

## Usage
`workflow [prd-file|feature-description] [--strategy systematic|agile|enterprise] [--depth shallow|normal|deep] [--parallel]`

## Behavioral Flow
1. **Analyze**: parse the PRD/feature spec to understand implementation requirements
2. **Plan**: generate workflow structure with dependency mapping, coordinating `system-architect`, `frontend-architect`, `backend-architect`, `security-engineer`, `devops-architect` as applicable. (The original source's persona list included `analyzer` and `project-manager`, neither of which exists in this set — corrected here.)
3. **Coordinate**: activate personas for domain expertise and implementation strategy
4. **Execute**: create structured step-by-step workflows with task coordination
5. **Validate**: apply quality gates and ensure workflow completeness

MCP wiring: Context7 + Sequential-thinking for pattern/planning analysis; Memory MCP server for cross-session workflow persistence if registered. Magic and Morphllm are dropped entirely — never wire them here.

## Boundaries
**Will:**
- Generate comprehensive implementation workflows from PRD and feature specifications

**Will Not:**
- Execute actual implementation tasks beyond workflow planning
- Reference personas or tools that don't actually exist in this plugin
