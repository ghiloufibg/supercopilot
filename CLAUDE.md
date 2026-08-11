# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A GitHub Copilot port of the SuperClaude framework: 29 commands, 17 personas (+ 9 Business Panel expert subagents), 7 behavioral modes, and a custom Memory MCP server, targeting Copilot CLI, VS Code, and JetBrains identically. It is a **generator + deployer**, not an app — the actual product is the set of files it writes into `~/.copilot/` (and the IDEs' global MCP config locations) so the plugin applies to every project on the machine, not just this repo.

Licensed under MIT (see `LICENSE`). There is no publishing or packaging pipeline — the deployed output is copied into a global Copilot configuration directory rather than installed as a package (see "Global Deployment" in `README.md`).

This file is a navigation aid — the practical rules for working in this repo, not the full rationale behind every decision.

Alongside the plugin, `tools/` holds a second, separate capability: read-only Jira/Confluence/GitLab REST fetch scripts. These are plain subprocess scripts rather than MCP servers because many organizations already run their own Jira/Confluence MCP servers, so a second one is pure token overhead; they also install to a location distinct from the plugin itself (see "Source of truth vs. generated output" below).

## Source of truth vs. generated output

This is the single most important thing to internalize before editing:

- **Author here:** `sources/commands/*.md` (29 files, including `jira.md`/`confluence.md`/`gitlab.md`), `sources/mcp-servers.json`, `.github/agents/*.agent.md` (personas + orchestrator + mode agents), `.github/agents/experts/*.agent.md` (9 Business Panel experts), `.github/copilot-instructions.md`, `.github/hooks/*.json` (Copilot CLI hooks — pm-agent capture reminder, plus the memory-automation pipeline, see below), `tools/` (the Jira/Confluence/GitLab scripts themselves).
- **Never hand-edit — generated, overwritten on every run:** `.github/skills/*/SKILL.md`, `.github/prompts/*.prompt.md`, `.copilot/mcp-config.json`, `.vscode/mcp.json`, `memory-mcp-server/dist/index.js` (the bundled server — regenerate with `npm run build`, see "Bundled, install-free deploy" below).
- **Never hand-edit — deployed, overwritten on every `deploy:global` run:** anything under `~/.copilot/` or the IDEs' global MCP config paths. These are a *copy*, not a symlink — this repo can be moved/deleted after deploying without breaking what's already installed. `~/.copilot/tools/` is the one exception to "deployed on every run": it's opt-in (`--all` / `--tool=jira,confluence,gitlab`), and `~/.copilot/tools/.env` specifically is never overwritten once created, since it holds real credentials.

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
npm install                 # required once for dev (tests + build tooling) — not needed to RUN the
                            # deployed server, which ships as a dependency-free bundle (see below)
npm run build               # regenerate the committed dist/index.js bundle via esbuild — run this
                            # after ANY change to src/index.js or src/store.js, and commit the result
npm test                    # node --test test/*.test.js — 39 tests across 9 files (CRUD/concurrency,
                             # sharding/lifecycle, legacy migration, the three memory-automation hooks,
                             # network-isolation, and the shipped dist bundle)
node --test test/store.test.js               # run a single test file
node --test test/network-isolation.test.js   # network-isolation check only
node --test test/dist.test.js                # bundle runs with no node_modules + persists across runs
npm start                   # run the server directly over stdio for manual smoke-testing
```

### Bundled, install-free deploy
The memory server has one real dependency (`@modelcontextprotocol/sdk`, which itself is a 90+ package
tree because it also ships express/cors/eventsource for HTTP+SSE transports this stdio-only server never
uses) plus `zod`. To make it deploy in **restricted/air-gapped environments where the public npm registry
is blocked**, `npm run build` (esbuild, `build.js`) tree-shakes from the two modules we actually import
and inlines everything into a single committed file, `dist/index.js` — the express/cors/eventsource code
and all `node:http`/`node:net` imports are unreachable and get dropped. `./store.js` is kept *external*
(it has no third-party deps and the `bin/` hooks import it too), so it stays one real shared file beside
the bundle. `test/network-isolation.test.js` asserts the shipped `dist/index.js` contains zero
network-capable imports; `test/dist.test.js` spawns it with no `node_modules` present to prove it's
self-contained. Building needs registry access (esbuild), so it happens on a maintainer machine; the
committed bundle is what restricted machines deploy. See `README.md` for the offline install flow.

There is no build step, linter, or type checker configured anywhere in this repo — `npm test` (inside `memory-mcp-server/`) is the only automated check.

## Commit messages
A `commit-msg` hook (`.githooks/`, active once `git config core.hooksPath .githooks` has run — `npm install` at the repo root does this automatically) rejects commits whose message names an AI assistant/tool (Claude, ChatGPT, Anthropic, OpenAI, GPT, Gemini, Codeium, Windsurf, Tabnine, a `claude.ai` URL, an `@anthropic.com` address, or the 🤖 emoji — "Copilot" is exempt, see `.githooks/commit-msg.js`) or has more than 3 lines of body content. **Do not add a `Co-Authored-By`, `Generated with`, or session-link footer to commits in this repo** — the hook will reject it, and it wouldn't be wanted here even if it didn't.

## Architecture

### The generator (`scripts/generate.js`)
Parses `---\n<frontmatter>\n---\n<body>` from each `sources/commands/*.md` file. `name` and `description` in the frontmatter drive the output filenames/metadata; the body is copied verbatim into both the skill and the prompt mirror. The `.prompt.md` mirror exists *only* so VS Code and JetBrains get the same explicit `/name` invocation Copilot CLI gets natively from Skills — CLI never reads `.github/prompts/`.

`sources/mcp-servers.json` → `{command, args, env}` per server, re-keyed as `mcpServers` (CLI) or `servers` (VS Code); JetBrains shares the VS Code file (high-confidence from docs, not yet hands-on confirmed).

### The deployer (`scripts/deploy-global.js`)
Runs the generator, then copies output to `~/.copilot/skills/`, `~/.copilot/agents/*.agent.md` (agent files flattened from `.github/agents/` and `.github/agents/experts/`), `~/.copilot/copilot-instructions.md`, and `~/.copilot/mcp-config.json`. The Memory MCP server is deployed as a self-contained copy at `~/.copilot/mcp-servers/memory-mcp-server/` — the committed bundle `dist/index.js` is copied in **as `src/index.js`** (so the MCP config's `src/index.js` path stays stable), alongside the real `src/store.js` (kept external to the bundle, shared with the `bin/` hooks) and a deps-free `package.json` (just `"type":"module"`, no `dependencies` key). **No `npm install` runs at deploy time** — every third-party dependency is already inlined into the bundle, so the deploy succeeds even with the npm registry blocked (this was the original failure mode in corporate environments). If `dist/index.js` is missing from the source tree, `installMemoryServer()` aborts the whole deploy with instructions to run `npm run build` first. This copy still has nothing to do with where this repo lives, so the repo stays safely movable/deletable post-deploy.

`.github/hooks/*.json` is copied to `~/.copilot/hooks/` (the user-level location per GitHub's hooks docs — `.github/hooks/` alone only ever applies inside this dev repo, which is why it was previously never deployed at all). Any occurrence of `{{MEMORY_HOOK_SCRIPT_PATH}}`, `{{MEMORY_NUDGE_HOOK_SCRIPT_PATH}}`, or `{{MEMORY_CHECKPOINT_HOOK_SCRIPT_PATH}}` in an authored hook file is substituted with the real installed path under the memory server directory above — same resolve-at-deploy-time idiom as the MCP config's `${workspaceFolder}` handling and the tools' skill-path patching, just for hook scripts instead.

Also invokes `scripts/patch-vscode-settings.js`, which surgically inserts `chat.agentFilesLocations` into VS Code's `settings.json` via text insertion rather than `JSON.parse`/`stringify` (the file is JSONC — comments and trailing commas that a naive round-trip would destroy). Always backs up first; leaves the key alone and prints instructions if it already exists; validates the result parses as JSON before writing, discards the change otherwise.

`scripts/deploy-global.js` also handles the opt-in Jira/Confluence/GitLab tools (`--all` / `--tool=jira,confluence,gitlab`), deployed to `~/.copilot/tools/` — a sibling to `skills/`/`agents/`/`mcp-servers/`, not inside any of them. An unrecognized `--tool=` name is validated and rejected *before* any deploy step runs at all, so a typo can't cause a partial deploy. Like the memory server (which deploys a pre-built bundle), the tools install with no `npm install` step — `tools/` has zero dependencies by design.

### Memory MCP server (`memory-mcp-server/`)
A local-only MCP server (`src/index.js` + `src/store.js`) implementing `write_memory`/`read_memory`/`list_memories`/`delete_memory`, each accepting an optional `scope: "global" | "project"` argument (default `"global"`). Storage is **sharded**, not one flat file: `~/.copilot/memory-data/global.json` for global-scope entries, `~/.copilot/memory-data/projects/<project-id>.json` (one file per repo, `project-id` = a hashed, normalized `git remote get-url origin`) for project-scope entries. A pre-existing flat `memory.json` from before sharding existed auto-migrates into `global.json` the first time the store is touched, renamed to `memory.json.migrated` rather than deleted.

Three properties are load-bearing and enforced by tests, not just convention:

1. **Zero outbound network calls, by design** — `test/network-isolation.test.js` statically checks `src/store.js`, `src/index.js`, and every `bin/*.js` hook script for a network-capable import. (Shelling out to the local `git` binary for project-id resolution is not a network call and isn't flagged.)
2. **Storage is global, not per-repo-checkout** — `STORE_DIR` defaults to `~/.copilot/memory-data/` (overridable via `COPILOT_MEMORY_DIR`), deliberately not `process.cwd()`-relative, so the same global/project-scoped entries are visible regardless of which checkout of a repo you're in, or which project you're currently working in for global-scope entries.
3. **Cross-process safe, not just cross-call safe** — every shard file has its own advisory lock (`<file>.lock`, exclusive create + staleness detection + atomic tmp-then-rename writes), applied inside `store.js` itself so it covers two separate MCP server processes (e.g. two IDE windows open at once) and the hook scripts below, not only concurrent calls within one already-running server. An in-process FIFO `operationQueue` still also exists, closing an unrelated same-process bug (a write-then-immediate-read race, found during manual smoke-testing before sharding existed) — the two mechanisms solve different problems and both remain.

### Memory automation hooks (`memory-mcp-server/bin/`)
Three Copilot CLI hooks (`.github/hooks/session-memory.json`), each a thin script calling `store.js` functions directly — no MCP round-trip, no LLM calls inside any hook script:

- **`bin/memory-hook.js`** (`sessionStart`) — auto-loads a digest of relevant memories (global + current-repo project-scoped) as `additionalContext`, so `/load` is never required. Also runs opportunistic lifecycle maintenance while it's already reading the store: project shards untouched 90 days are deleted (overridable via `write_memory("config/project-purge-days", "<n>")`); global entries beyond a 50-entry cap are LRU-evicted to `archive/global-overflow.jsonl`, not deleted (overridable via `write_memory("config/global-cap", "<n>")`).
- **`bin/memory-nudge-hook.js`** (`agentStop`) — nudges the model to call `write_memory` itself, at most once per session, when a turn looks worth remembering (a file-editing tool call, 3+ assistant turns, or a 10-minute-plus session — whichever trips first). Guarded against ever blocking twice in a row by both the CLI's own `stop_hook_active` flag and a one-shot sentinel file (`~/.copilot/memory-data/.nudged/<sessionId>`). `write_memory("config/nudge", "off")` disables it entirely. Transcript format for parsing tool calls/turn count is unconfirmed (§ below); the duration trigger works independently of it.
- **`bin/memory-checkpoint-hook.js`** (`sessionEnd`) — fallback only: if nothing was saved this session (tracked via a `~/.copilot/memory-data/sessions/<sessionId>.json` start-marker compared against a global last-write timestamp, since `sessionEnd`'s documented payload has no transcript path), writes one low-fidelity `checkpoint/<project>/<timestamp>` entry so nothing is silently lost.

Not yet run inside a real Copilot CLI session — every hook is unit-tested by spawning it as a subprocess with a hand-built JSON payload on stdin, not by the actual Copilot runtime invoking it.

### Corporate-safety posture
The default MCP profile is exactly five servers: `context7`, `sequential-thinking`, `playwright`, `chrome-devtools`, `memory`. **Magic, Morphllm, and Tavily are deliberately excluded** — Magic sent full file content to a third-party inference API, Morphllm only ever supported React, Tavily (web search) has no default-safe local substitute so it's opt-in only if wired in separately. When touching `sources/mcp-servers.json`, any command source, or any agent file, do not reintroduce these three — grep for `magic|morphllm|tavily` across the repo should only ever match explanatory "why it's excluded" prose, never an actual server registration.

### Verification status
The generator's structural output, the Memory MCP server, and the memory-automation hooks are all automated-tested; the plugin has **not yet been exercised in a real Copilot CLI/VS Code/JetBrains session** end-to-end. `.github/hooks/*.json` now use the real, documented hook schema (fixed from an earlier invalid `action`/`message` shape) but neither those hooks nor Business Panel's real subagent delegation have been hands-on verified against an actual Copilot runtime. See `README.md`'s "Verification status" section for the full breakdown.
