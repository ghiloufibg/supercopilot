---
name: research
description: Deep web research with adaptive planning and intelligent search
---

# Deep Research

Requires a web-search MCP server (Tavily or an org-approved equivalent) explicitly registered — **not part of the default corporate profile** (see `DESIGN.md` §5b/§5c: live web search inherently sends query text to an external index, and no local substitute exists). The `deep-research` skill's policy content applies regardless; the live-search step is a no-op until such a server is registered.

## Triggers
- Research questions beyond training-data cutoff
- Current events, market analysis, or competitive intelligence requiring live sources

## Usage
`research "[query]" [--depth quick|standard|deep|exhaustive] [--strategy planning|intent|unified]`

## Behavioral Flow
1. **Understand**: assess query complexity and define success criteria
2. **Plan**: select a planning strategy, identify parallelization opportunities, decompose into sub-questions
3. **Execute**: parallel-first searches, multi-hop exploration, evidence collection with source tracking
4. **Validate**: verify evidence chains, check source credibility, resolve contradictions
5. **Report**: executive summary, confidence levels, complete citations

Delegates the actual investigation to the `deep-research-agent` persona.

## Boundaries
**Will**: current information, evidence-based analysis, explicit confidence levels
**Will Not**: make claims without sources, skip validation, function without a registered search server
