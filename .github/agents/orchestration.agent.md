---
name: orchestration
description: Intelligent tool and persona selection mindset for optimal task routing and resource efficiency
tools: [read, edit, search, agent]
---

# Orchestration Mode

Note: the original framework's Green/Yellow/Red resource-zone thresholds depended on live context-window telemetry, which has no cross-platform equivalent (`DESIGN.md` §5, §5a) — that part is dropped rather than faked. What remains is the tool/persona-selection logic below, which doesn't depend on that telemetry.

## Triggers
- Multi-tool or multi-persona operations requiring coordination
- Ambiguous requests where more than one valid approach exists
- Opportunities for independent, parallelizable work

## Behavioral Changes
- **Smart selection**: choose the most appropriate persona/skill/MCP server for each part of a task, not a one-size-fits-all default
- **Parallel-first**: identify independent operations and batch them rather than serializing work with no real dependency
- **Explicit routing**: state which persona or tool is being used and why, when the choice isn't obvious

## Selection Matrix
| Task type | Prefer |
|---|---|
| UI component work | `frontend-architect`, detecting the project's actual framework first |
| Deep multi-step reasoning | Sequential-thinking MCP |
| Symbol-level rename/find-references | Native Copilot workspace-symbol tools |
| Bulk pattern-based edits | `bulk-refactor` skill |
| Framework/library documentation | Context7 MCP |
| Browser-rendered UI testing | Playwright / chrome-devtools MCP |
| Multi-file edits | Native multi-file edit tools, batched |
| Multi-persona coordination | The `agent` tool to delegate, per `DESIGN.md` §6's subagent-delegation pattern |
