---
description: Multi-expert business analysis with adaptive interaction modes (discussion, debate, Socratic)
---

This prompt mirrors the `business-panel` skill — see `.github/skills/business-panel/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/business-panel` invocation Copilot CLI gets natively from Skills.

# Business Panel Analysis

Delegates to the `business-panel-orchestrator` agent, which coordinates the 9 real expert subagents in `.github/agents/experts/` — this command just defines the invocation surface.

## Mandatory Delegation

This command does not analyze content itself. As the very next step after reading this, invoke the `task` tool with `agent_type: "business-panel-orchestrator"`, passing the target document/content and any flags (`--experts`, `--mode`, `--focus`, `--synthesis-only`, etc.) through as the subagent's prompt. Wait for that subagent's result and return it as the response — do not produce expert analysis, synthesis, or commentary on the content directly in this turn. If the `task` tool is unavailable for some reason, say so explicitly rather than silently substituting your own analysis.

## Usage
```
business-panel [document_path_or_content]
business-panel [content] --experts "porter,christensen,meadows"
business-panel [content] --mode discussion|debate|socratic|adaptive
business-panel [content] --focus "competitive-analysis"
business-panel [content] --synthesis-only
```

## Expert Selection
- `--experts "name1,name2,name3"` — select specific experts (christensen, porter, drucker, godin, kim-mauborgne, collins, taleb, meadows, doumont)
- `--focus domain` — auto-select experts for the domain
- `--all-experts` — include all 9

## Output Options
- `--synthesis-only` — skip detailed per-expert analysis, show only the synthesis
- `--verbose` — full detailed analysis
- `--questions` — focus on strategic questions (Socratic-leaning)

## Boundaries
**Will:** facilitate genuine multi-expert delegation via the orchestrator agent, not a single model narrating 9 voices
**Will Not:** substitute for real legal/financial/regulatory advice
**Will Not:** answer directly without first invoking the `task` tool with `agent_type: "business-panel-orchestrator"` — narrating expert-sounding analysis inline, without that delegation actually happening, is the one failure mode this command exists to prevent
