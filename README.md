# copilot-superclaude (provisional name — see DESIGN.md §9.1)

A GitHub Copilot port of the SuperClaude framework, targeting Copilot CLI, VS Code, and JetBrains identically. Full design rationale, the corporate-safety review, and the language-bias audit are in [`DESIGN.md`](./DESIGN.md) — read that before touching anything here.

**Status: Phases 0–3 built and unit-tested, deployed globally (`~/.copilot/`). Not yet exercised in a real Copilot session — that's on you, see `TESTING.md`.**

**Personal-use project** — no license, no publishing, no distribution tooling. Built for one person's own Copilot setup, not for others to install.

**Deployed globally, not per-repo.** This repo is the version-controlled source of truth; `npm run deploy:global` copies/generates everything out to `~/.copilot/` (and the VS Code/JetBrains global MCP config locations), so it applies across every project, not just one. See "Global Deployment" below.

## Prerequisites

- **Node.js 18+** — runs the generator, the Memory MCP server, and the `npx`-invoked MCP servers below.
- **`npm install` inside `memory-mcp-server/`** — a manual one-time step, not automatic. Without it, the `memory` server won't start.
- **Internet access on first run** for `context7`, `sequential-thinking`, `playwright`, and `chrome-devtools` — each is configured as `npx -y <package>`, which fetches it from the npm registry the first time it launches, then caches it.
- **A local Chrome/Chromium install** for `chrome-devtools-mcp` to drive. Playwright may need its own separate `npx playwright install` step for browser binaries — not yet confirmed whether `@playwright/mcp` handles that automatically.
- **GitHub Copilot itself**, with agent mode available in whichever surface (CLI/VS Code/JetBrains) you're using.

## What This Plugin Actually Does

Every command below is invoked as `/name` in Copilot Chat (CLI/VS Code/JetBrains alike). Personas either activate automatically based on what you're doing, or you can pick one manually from the agent picker.

### Commands (26)

**Core development**
- `implement` — build a feature, auto-detecting the repo's actual stack (Node/Python/Java/.NET/Go/Rust) rather than assuming JS
- `build` — compile/package the project
- `test` — run tests with coverage; only reaches for browser automation when the target actually has a browser UI
- `cleanup` — remove dead code, optimize structure
- `improve` — systematic quality/performance/maintainability improvements
- `troubleshoot` — diagnose bugs, build failures, deployment issues
- `git` — commit messages and workflow help

**Understanding & docs**
- `analyze` — quality/security/performance/architecture analysis
- `explain` — explain code or concepts at a chosen depth
- `document` — generate docs in the target language's own convention (docstrings, JSDoc, Javadoc, etc.)
- `index` — generate/maintain project-wide documentation and a knowledge base
- `help` — list every command and the current MCP profile

**Planning**
- `design` — architecture/API/component/database design specs
- `estimate` — time/effort/complexity estimates
- `brainstorm` — Socratic requirements discovery for vague ideas
- `workflow` — turn a PRD or feature description into a structured implementation plan
- `spawn` — break a large multi-domain task into a coordinated hierarchy
- `task` — execute a complex task with multi-persona delegation

**Expert panels**
- `business-panel` — 9 real business-strategy experts (Christensen, Porter, Drucker, Godin, Kim & Mauborgne, Collins, Taleb, Meadows, Doumont), in discussion/debate/Socratic mode
- `spec-panel` — 10 specification/software-engineering experts (Wiegers, Adzic, Cockburn, Fowler, Nygard, Newman, Hohpe, Crispin, Gregory, Hightower) reviewing a spec

**Session & memory** (need the Memory MCP server registered)
- `save` / `load` — persist and restore project context across sessions
- `reflect` — check task adherence and completion against the stated goal

**Research** (needs a web-search MCP server registered separately — not on by default)
- `research` — adaptive multi-hop web research with cited, confidence-scored output

**Meta / tooling**
- `select-tool` — routes an operation to the right underlying tool (symbol rename vs. bulk pattern edit vs. memory)
- `pm` — the default orchestration layer: delegates to the right persona automatically and keeps a running record of what was built and why

### Personas (17) — architecture, quality, and specialist expertise
`system-architect`, `backend-architect`, `frontend-architect`, `devops-architect`, `security-engineer`, `performance-engineer`, `quality-engineer`, `refactoring-expert`, `python-expert`, `requirements-analyst`, `root-cause-analyst`, `technical-writer`, `learning-guide`, `socratic-mentor`, `pm-agent`, `deep-research-agent`, plus the `business-panel-orchestrator` (delegates to the 9 experts above, kept out of the manual picker).

### Behavioral Modes (7) — how to *approach* a problem, not what to do
`brainstorming` (discovery through questions), `introspection` (expose reasoning, catch your own mistakes), `task-management` (hierarchical, checkpointed via memory), `token-efficiency` (compressed output for long sessions), `orchestration` (pick the right tool/persona for each part of a task); `business-panel` and `deep-research` modes are the two agents above, not separate files.

### What's deliberately *not* here
Magic (AI UI-component generation) and Morphllm (bulk AI-powered edits) are dropped entirely — replaced by native Copilot generation plus the `ui-components`/`bulk-refactor` skills, which do the same job locally without sending code to a third party. Tavily (web search) is opt-in only, never default — see the corporate-safety section below for why.

## Corporate-safety posture, up front
The default MCP profile is **Context7, Sequential-thinking, Playwright, chrome-devtools, and the custom Memory MCP server** — nothing else. Magic, Morphllm, and Tavily are deliberately not part of this plugin (see `DESIGN.md` §5b/§5c for why: one sent full file content to a third-party inference API, one only ever supported React, one has no local substitute for live web search). Verified absent from every generated config and every skill/prompt/agent file — `grep -ri "magic\|morphllm\|tavily"` across the repo returns only explanatory text ("dropped, here's why"), never an actual wiring.

The Memory MCP server (the one piece of custom code here) has an automated test (`memory-mcp-server/test/network-isolation.test.js`) confirming it and its one dependency's transport module have no network-capable imports — not just a promise to code-review it once.

## Layout
```
DESIGN.md                        # the actual design document — start here
sources/commands/*.md            # authored once per command (26); generates skill + prompt pair
sources/mcp-servers.json         # authored once; generates every MCP config, local and global
scripts/generate.js               # local generator: sources -> .github/skills, .github/prompts, .copilot, .vscode
scripts/deploy-global.js          # deploys this repo's content OUT to ~/.copilot/ and the IDEs' global MCP configs
scripts/patch-vscode-settings.js  # surgically adds chat.agentFilesLocations to VS Code's settings.json, comments-safe
.github/agents/*.agent.md         # 16 personas + orchestrator + 5 behavioral-mode agents — authored directly
.github/agents/experts/*.agent.md # 9 Business Panel expert subagents, user-invocable: false
.github/skills/*/SKILL.md         # 29 skills (26 generated commands + bulk-refactor + ui-components + deep-research)
.github/prompts/*.prompt.md       # generated locally only — no global equivalent exists, see DESIGN.md Revision 10
.github/hooks/post-implementation.json  # pm-agent capture reminder — UNVERIFIED schema, see below
.copilot/mcp-config.json          # generated locally (repo-relative, for testing this repo standalone)
.vscode/mcp.json                   # generated locally, same reason
memory-mcp-server/                # Tier B: the Memory MCP server, real Node code + tests
```

This repo is the version-controlled **source of truth**. Nothing in `~/.copilot/`, VS Code's user-profile `mcp.json`, or JetBrains's global `mcp.json` should be hand-edited — edit here and redeploy instead.

## Global Deployment

```
npm run deploy:global
```

Copies/generates this repo's content to the actual locations Copilot reads from globally, across every project on the machine — not just this repo. See `DESIGN.md` Revision 10 for the full research behind each path.

| What | Deployed to | Confirmed for |
|---|---|---|
| 29 skills | `~/.copilot/skills/<name>/SKILL.md` | CLI, VS Code (JetBrains: preview) |
| 31 agent files (flattened) | `~/.copilot/agents/*.agent.md` | CLI (JetBrains: likely, unconfirmed) |
| `copilot-instructions.md` | `~/.copilot/copilot-instructions.md` | CLI only — VS Code/JetBrains global instructions are settings-based, not a drop-in file |
| MCP servers (5, including `memory` with an absolute path) | `~/.copilot/mcp-config.json` | CLI — confirmed |
| Same MCP servers | VS Code's user-profile `mcp.json`, if found on the machine | Written only if VS Code's user-data folder is actually detected — otherwise the script prints the exact JSON to paste in via "MCP: Add Server" → Global |
| Same MCP servers | `~/.config/github-copilot/intellij/mcp.json` | Written per documentation, not yet hands-on confirmed |

**`chat.agentFilesLocations` in VS Code's `settings.json` is now patched automatically** (`scripts/patch-vscode-settings.js`, called by `deploy:global`) — no manual step. Since `settings.json` is JSONC (comments and trailing commas allowed, which a plain `JSON.parse`/`stringify` round-trip would silently destroy), it's patched via surgical text insertion instead: the file is backed up first, unconditionally; if the key already exists it's left alone with instructions printed rather than risking a bad merge; the result is sanity-checked as valid JSON before anything is written, and the original is left untouched if that check fails. Tested against 6 scenarios (no file, plain JSON, comments + trailing commas, key already present, empty `{}`, pre-existing trailing comma) — all produce clean, valid output. If VS Code isn't installed on the machine running the deploy script, it says so and does nothing, same as the MCP config step.

Re-run `npm run deploy:global` any time you change `sources/commands/*.md`, `sources/mcp-servers.json`, `.github/agents/*.agent.md`, or `.github/copilot-instructions.md`.

## Local Testing (this repo standalone)
```
npm run generate            # both skills+prompts and MCP configs, written locally to .github/.vscode/.copilot
npm run generate:skills
npm run generate:mcp-configs
```
Edit `sources/commands/*.md` or `sources/mcp-servers.json`, then regenerate — never hand-edit the generated `.github/skills/`, `.github/prompts/`, `.copilot/`, or `.vscode/` output directly, it'll be overwritten.

## Memory MCP server
```
cd memory-mcp-server
npm install
npm test          # 8 tests: 5 functional (write/read/list/delete/concurrency) + 3 network-isolation
npm start          # runs the server directly over stdio, for manual smoke-testing
```

## What's verified so far (by me, automated)
- Generator produces structurally correct output for all 26 commands, checked against the documented CLI (`mcpServers`)/VS Code (`servers`) formats.
- Magic/Morphllm/Tavily confirmed absent everywhere, not just unused.
- Memory MCP server: all 8 tests pass, including a concurrent-write race the tests actually caught and a real fix had to be made for (see `memory-mcp-server/src/store.js`'s mutation queue).
- Memory MCP server responds correctly to a real MCP `initialize` handshake and lists all 4 tools correctly via `tools/list` (manually smoke-tested, not just unit-tested in isolation).

## Resolved by research since the last pass (Revision 8) — high confidence, not yet hands-on confirmed
- **JetBrains MCP config**: no separate file needed — it reads the same `.vscode/mcp.json` VS Code does (project-level; a `~/.config/github-copilot/intellij/mcp.json` global fallback also exists but isn't relevant here). The generator no longer produces a speculative JetBrains artifact.
- **Copilot CLI's `${workspaceFolder}` substitution**: confirmed supported in `mcp-config.json`, so the Memory MCP server's registered path should work as already written.

Both still need the actual hands-on check in `TESTING.md` — documentation research is high-confidence, not proof.

## What's NOT yet verified (needs you, with real IDEs — see `TESTING.md`)
- **Nothing has been loaded into a real Copilot CLI, VS Code, or JetBrains session.** All 26 commands, 17 personas, and the Memory MCP server need to be installed into an actual test repo and exercised in all three surfaces.
- **`.github/hooks/post-implementation.json`'s exact schema is unverified** against a real Copilot hooks runtime — written against documented event names (`agentStop`) but not hands-on tested.
- **Business Panel's real subagent delegation** (orchestrator → 9 experts) needs an actual run in each surface to confirm genuine delegation, not just file structure correctness.

## Next steps
See `TESTING.md` for the full manual test checklist, organized per surface.
