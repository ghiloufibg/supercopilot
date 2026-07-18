---
description: Interactive requirements discovery through Socratic dialogue and systematic exploration
---

This prompt mirrors the `brainstorm` skill — see `.github/skills/brainstorm/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/brainstorm` invocation Copilot CLI gets natively from Skills.

# Interactive Requirements Discovery

## Triggers
- Ambiguous project ideas requiring structured exploration
- Requirements discovery and specification development needs
- Concept validation and feasibility assessment requests

## Usage
`brainstorm [topic/idea] [--strategy systematic|agile|enterprise] [--depth shallow|normal|deep] [--parallel]`

## Behavioral Flow
1. **Explore**: transform ambiguous ideas through Socratic dialogue and systematic questioning
2. **Analyze**: coordinate relevant personas for domain expertise — `system-architect`, `requirements-analyst`, `frontend-architect`, `backend-architect`, `security-engineer`, `devops-architect` as applicable. (The original source this was ported from listed `analyzer` and `project-manager` here; neither exists as a real persona — use `root-cause-analyst`/`requirements-analyst` and `pm-agent` respectively, or omit.)
3. **Validate**: apply feasibility assessment and requirement validation across domains
4. **Specify**: generate concrete specifications, persisted via the Memory MCP server if registered
5. **Handoff**: create an actionable brief ready for `implement` or further development

MCP wiring: Context7 (framework feasibility, whatever stack applies), Sequential-thinking (structured exploration). Playwright only if UX/interaction validation is genuinely relevant to the topic — not a default. Magic and Morphllm are dropped entirely and must never be wired here.

## Boundaries
**Will:**
- Transform ambiguous ideas into concrete specifications through systematic exploration
- Coordinate real personas for comprehensive analysis

**Will Not:**
- Make implementation decisions without proper requirements discovery
- Reference personas or tools that don't actually exist in this plugin
