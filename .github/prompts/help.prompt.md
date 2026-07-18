---
description: List all available commands and their functionality
---

This prompt mirrors the `help` skill — see `.github/skills/help/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/help` invocation Copilot CLI gets natively from Skills.

# Command Reference

Information display only — no execution.

| Command | Description |
|---|---|
| `analyze` | Comprehensive code analysis across quality, security, performance, architecture |
| `brainstorm` | Interactive requirements discovery through Socratic dialogue |
| `build` | Build, compile, and package projects with intelligent error handling |
| `business-panel` | Multi-expert business analysis with adaptive interaction modes |
| `cleanup` | Systematically clean up code, remove dead code, optimize structure |
| `design` | Design system architecture, APIs, and component interfaces |
| `document` | Generate focused documentation for components, functions, APIs |
| `estimate` | Provide development estimates with intelligent analysis |
| `explain` | Provide clear explanations of code, concepts, system behavior |
| `git` | Git operations with intelligent commit messages |
| `help` | List all available commands |
| `implement` | Feature and code implementation with stack auto-detection |
| `improve` | Apply systematic improvements to quality, performance, maintainability |
| `index` | Generate comprehensive project documentation and knowledge base |
| `load` | Session context loading (requires the Memory MCP server) |
| `pm` | Project-management orchestration and self-improvement documentation |
| `reflect` | Task reflection and validation (requires the Memory MCP server) |
| `research` | Deep web research (requires an opt-in web-search MCP server) |
| `save` | Session context persistence (requires the Memory MCP server) |
| `select-tool` | Choose between the Memory MCP server, native symbol tools, and the bulk-refactor skill for a given operation |
| `spawn` | Meta-system task orchestration with intelligent breakdown |
| `spec-panel` | Multi-expert specification review |
| `task` | Execute complex tasks with delegation |
| `test` | Execute tests with coverage analysis |
| `troubleshoot` | Diagnose and resolve issues in code, builds, deployments |
| `workflow` | Generate structured implementation workflows from PRDs |

Plus two skills that aren't ported commands but replace dropped MCP servers: `bulk-refactor` (replaces Morphllm) and `ui-components` (replaces Magic), and `deep-research` (the research-methodology policy content used by `research`).

## MCP Servers in the Corporate Default Profile
Context7 (docs), Sequential-thinking (reasoning), Playwright + chrome-devtools (browser/web debugging, no-op outside a web context), the custom Memory MCP server (cross-session state, Phase 3).

**Not bundled by default** — Morphllm and 21st.dev Magic were dropped entirely (replaced by local codemod tooling and native UI generation + your org's own design system, respectively). Tavily/web-search is opt-in only, never a default, since live web search has no local substitute. If you're looking for flags that enabled these in the original framework (`--magic`, `--morph`/`--morphllm`), they don't apply here — removed, not just hidden.

## Boundaries
**Will:** display the command list and current MCP profile
**Will Not:** execute commands or reference tools that aren't actually part of this plugin
