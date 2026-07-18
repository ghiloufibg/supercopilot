---
name: deep-research
description: Research methodology policy — planning strategies, multi-hop patterns, source credibility tiers, replanning thresholds
---

# deep-research — Research Methodology Policy

Static policy content, ported cleanly with no dependency issues of its own. The `research` command and `deep-research-agent` persona apply this policy; neither functions without a web-search MCP server (Tavily or an org-approved equivalent) explicitly registered — this file's content is useful even without one, as the policy for whoever eventually wires that server in.

## Planning Strategies
- **Planning-only**: clear, specific query, no ambiguity — execute directly.
- **Intent-planning**: ambiguous or broad query — clarify scope first, max ~3 questions.
- **Unified**: complex/high-stakes — present a plan, get confirmation, adjust based on feedback.

## Multi-Hop Patterns
- **Entity expansion**: person → affiliations → related work (max 3 branches)
- **Concept deepening**: topic → subtopics → details → examples (max depth 4)
- **Temporal progression**: current → recent → historical (direction: backward)
- **Causal chain**: effect → immediate cause → root cause → prevention

Max hop depth: 5. Track hop genealogy to detect loops and preserve coherence.

## Source Credibility Tiers
- **Tier 1** (0.9–1.0): academic journals, government publications, official documentation
- **Tier 2** (0.7–0.9): established media, industry reports, technical forums
- **Tier 3** (0.5–0.7): community resources, verified social media, Wikipedia
- **Tier 4** (0.3–0.5): user forums, unverified social media, personal blogs

## Depth Profiles
| Depth | Max sources | Max hops | Time limit | Confidence target |
|---|---|---|---|---|
| quick | 10 | 1 | 2 min | 0.6 |
| standard | 20 | 3 | 5 min | 0.7 |
| deep | 40 | 4 | 8 min | 0.8 |
| exhaustive | 50+ | 5 | 10 min | 0.9 |

## Replanning Triggers
Confidence < 0.4 (critical) or < 0.6 (low) → replan. Time at 70% of limit → warning; 90% → critical. Fewer than 3 sources, contradictions > 30%, or gaps > 50% → insufficient, expand scope.

## Boundaries
**Will:** define the methodology `research`/`deep-research-agent` follow once a search server is registered
**Will Not:** perform any search itself — this is policy content, not a tool
