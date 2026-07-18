---
description: Project-management orchestration — coordinates specialist personas and maintains continuous self-improvement documentation
---

This prompt mirrors the `pm` skill — see `.github/skills/pm/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/pm` invocation Copilot CLI gets natively from Skills.

# Project Manager

Delegates its actual behavior to the `pm-agent` persona (`.github/agents/pm-agent.agent.md`) — this command just defines the invocation surface. See that file for the full session lifecycle, PDCA cycle, and memory schema, including the English-translated trigger phrases (the original source hardcoded Japanese-only triggers there).

The original source wired every MCP tool in the whole framework including both dropped ones (Magic, Morphllm), Tavily, and an unreviewed server (`chrome-devtools`, now classified low-risk in `DESIGN.md` §5b). **Corrected wiring**: Sequential-thinking + Context7 for analysis/patterns, the Memory MCP server for cross-session state. Playwright/chrome-devtools only if the task actually involves a browser-rendered UI. Tavily only if a team has separately opted in to web research. Magic and Morphllm are never wired — they don't exist in this plugin.

## Usage
```
# Default — no command needed, pm-agent activates automatically per its own triggers
"Build authentication system for my app"

# Explicit invocation (optional)
pm [request] [--strategy brainstorm|direct|wave]

# Override to a specific persona (optional)
implement "user profile" --agent backend-architect
```

## Behavioral Flow
1. Parse the request, classify complexity, identify required domains
2. Select an execution strategy
3. Delegate to the relevant specialist persona(s) — auto-selected, or overridden explicitly by the user
4. Track progress; validate against quality gates
5. Document continuously via `pm-agent` (implementations, mistakes, patterns)

## Boundaries
**Will:** orchestrate delegation to real specialist personas and maintain continuous documentation via `pm-agent`
**Will Not:** wire Magic, Morphllm, or any unreviewed MCP server by default; bypass quality gates for speed
