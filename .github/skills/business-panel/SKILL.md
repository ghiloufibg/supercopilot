---
name: business-panel
description: Multi-expert business analysis with adaptive interaction modes (discussion, debate, Socratic)
---

# Business Panel Analysis

Delegates to the `business-panel-orchestrator` agent, which coordinates the 9 real expert subagents in `.github/agents/experts/` — this command just defines the invocation surface.

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
