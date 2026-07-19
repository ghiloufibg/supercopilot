# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A GitHub Copilot port of the SuperClaude framework: 26 commands, 17 personas (+ 9 Business Panel expert subagents), 7 behavioral modes, and a custom Memory MCP server, targeting Copilot CLI, VS Code, and JetBrains identically. It is a **generator + deployer**, not an app — the actual product is the set of files it writes into `~/.copilot/` (and the IDEs' global MCP config locations) so the plugin applies to every project on the machine, not just this repo.

This is a **personal-use project** for one person's own Copilot setup — no license, no publishing, no distribution tooling.

**Read `DESIGN.md` before changing anything here** — it's the actual design document (70KB), including the corporate-safety review and language-bias audit behind every non-obvious decision. This CLAUDE.md is a navigation aid, not a substitute for it.

## Source of truth vs. generated output

This is the single most important thing to internalize before editing:

- **Author here:** `sources/commands/*.md` (26 files), `sources/mcp-servers.json`, `.github/agents/*.agent.md` (personas + orchestrator + mode agents), `.github/agents/experts/*.agent.md` (9 Business Panel experts), `.github/copilot-instructions.md`.
- **Never hand-edit — generated, overwritten on every run:** `.github/skills/*/SKILL.md`, `.github/prompts/*.prompt.md`, `.copilot/mcp-config.json`, `.vscode/mcp.json`.
- **Never hand-edit — deployed, overwritten on every `deploy:global` run:** anything under `~/.copilot/` or the IDEs' global MCP config paths. These are a *copy*, not a symlink — this repo can be moved/deleted after deploying without breaking what's already installed.

One authored command source (`sources/commands/<name>.md`, frontmatter + body) generates a matched `SKILL.md` + `.prompt.md` pair via `scripts/generate.js`. One `sources/mcp-servers.json` generates the CLI, VS Code, *and* JetBrains MCP configs (JetBrains reads the same `.vscode/mcp.json` VS Code does — no separate artifact).

## Commands

```
npm run generate            # regenerate .github/skills, .github/prompts, .copilot/, .vscode/ from sources/
npm run generate:skills     # sources/commands/*.md -> skill+prompt pairs only
npm run generate:mcp-configs   # sources/mcp-servers.json -> CLI + VS Code MCP configs only
npm run deploy:global       # generate (above) + copy/install everything out to ~/.copilot/ and IDE global configs
```

Memory MCP server (`memory-mcp-server/`, the one piece of custom runtime code in this repo):

```
cd memory-mcp-server
npm install                 # required once — not automatic, the server won't start without it
npm test                    # node --test test/*.test.js — 5 functional + 3 network-isolation tests
node --test test/store.test.js               # run a single test file
node --test test/network-isolation.test.js   # network-isolation check only
npm start                   # run the server directly over stdio for manual smoke-testing
```

There is no build step, linter, or type checker configured anywhere in this repo — `npm test` (inside `memory-mcp-server/`) is the only automated check.

## Architecture

### The generator (`scripts/generate.js`)
Parses `---\n<frontmatter>\n---\n<body>` from each `sources/commands/*.md` file. `name` and `description` in the frontmatter drive the output filenames/metadata; the body is copied verbatim into both the skill and the prompt mirror. The `.prompt.md` mirror exists *only* so VS Code and JetBrains get the same explicit `/name` invocation Copilot CLI gets natively from Skills — CLI never reads `.github/prompts/`.

`sources/mcp-servers.json` → `{command, args, env}` per server, re-keyed as `mcpServers` (CLI) or `servers` (VS Code); JetBrains shares the VS Code file (high-confidence from docs, not yet hands-on confirmed — see `TESTING.md`).

### The deployer (`scripts/deploy-global.js`)
Runs the generator, then copies output to `~/.copilot/skills/`, `~/.copilot/agents/*.agent.md` (agent files flattened from `.github/agents/` and `.github/agents/experts/`), `~/.copilot/copilot-instructions.md`, and `~/.copilot/mcp-config.json`. The Memory MCP server itself (`package.json` + `src/`, deliberately never `test/` or `node_modules/`) is deployed as a real independent **install** at `~/.copilot/mcp-servers/memory-mcp-server/` with its own `npm install` run there — not a path reference back into this repo. This is what makes the repo safely movable/deletable post-deploy.

Also invokes `scripts/patch-vscode-settings.js`, which surgically inserts `chat.agentFilesLocations` into VS Code's `settings.json` via text insertion rather than `JSON.parse`/`stringify` (the file is JSONC — comments and trailing commas that a naive round-trip would destroy). Always backs up first; leaves the key alone and prints instructions if it already exists; validates the result parses as JSON before writing, discards the change otherwise.

### Memory MCP server (`memory-mcp-server/`)
A local-only MCP server (`src/index.js` + `src/store.js`) implementing `write_memory`/`read_memory`/`list_memories`/`delete_memory` over a single JSON file. Two properties are load-bearing and enforced by tests, not just convention:

1. **Zero outbound network calls, by design** (`DESIGN.md` §5b) — `test/network-isolation.test.js` statically checks `src/store.js` and its dependency tree never `require()`/`import` a network-capable module.
2. **Storage is global, not per-project** — `STORE_DIR` defaults to `~/.copilot/memory-data/` (overridable via `COPILOT_MEMORY_DIR`), deliberately not `process.cwd()`-relative, so `/save` in one project and `/load` in a completely different one see the same store.

All four operations (reads included) go through a single FIFO `operationQueue` in `store.js` — not just writes. This exists because a bare write-then-immediate-read raced and returned `found: false` during manual smoke-testing when only writes/deletes were serialized; reads jumping the queue ahead of an in-flight write is the bug this closes.

### Corporate-safety posture
The default MCP profile is exactly five servers: `context7`, `sequential-thinking`, `playwright`, `chrome-devtools`, `memory`. **Magic, Morphllm, and Tavily are deliberately excluded** (`DESIGN.md` §5b/§5c) — Magic sent full file content to a third-party inference API, Morphllm only ever supported React, Tavily (web search) has no default-safe local substitute so it's opt-in only if wired in separately. When touching `sources/mcp-servers.json`, any command source, or any agent file, do not reintroduce these three — grep for `magic|morphllm|tavily` across the repo should only ever match explanatory "why it's excluded" prose, never an actual server registration.

### Verification status
Per `README.md`/`TESTING.md`: the generator's structural output and the Memory MCP server are automated-tested; the plugin has **not yet been exercised in a real Copilot CLI/VS Code/JetBrains session** end-to-end. Don't assume `.github/hooks/post-implementation.json`'s schema or Business Panel's real subagent delegation are confirmed working — both are flagged unverified in `TESTING.md`.
