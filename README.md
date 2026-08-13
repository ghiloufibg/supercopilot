# copilot-superclaude

[![version](https://img.shields.io/github/v/release/ghiloufibg/supercopilot)](https://github.com/ghiloufibg/supercopilot/releases/latest)

> Project name is provisional.

A GitHub Copilot port of the SuperClaude framework, targeting Copilot CLI, VS Code, and JetBrains identically.

**Getting started:** see [Prerequisites](#prerequisites) and [Global Deployment](#global-deployment) below for installation and usage.

**Status:** Phases 0–3 are implemented and unit-tested, and the plugin deploys globally to `~/.copilot/`. Memory now auto-loads and auto-saves via Copilot CLI hooks (see [Memory Automation](#memory-automation) below) — also implemented and unit-tested, also not yet exercised end-to-end in a live Copilot session. See [Verification status](#verification-status) below.

**License:** [MIT](./LICENSE). No publishing or distribution tooling is set up; the deployed output is intended to be copied to a global Copilot configuration directory rather than installed as a package.

**Deployed globally, not per-repo.** This repo is the version-controlled source of truth; `npm run deploy:global` copies/generates everything out to `~/.copilot/` (and the VS Code/JetBrains global MCP config locations), so it applies across every project, not just one. See "Global Deployment" below.

## Prerequisites

- **Node.js 18+** — runs the generator, the Memory MCP server, and the `npx`-invoked MCP servers below.
- **No `npm install` needed for the memory server** — it deploys as a self-contained bundle (`dist/index.js`, all dependencies inlined), so it runs even where the npm registry is blocked. `npm install` inside `memory-mcp-server/` is only needed for *development* (running the tests and rebuilding the bundle). See "Offline / restricted-registry install" below.
- **`git` on PATH** (optional but recommended) — the memory hooks use `git remote get-url origin` to identify which repo a project-scoped memory belongs to. Falls back to the folder name if `git` isn't found or the folder isn't a repo, so it's not a hard requirement, just lower fidelity without it.
- **Internet access on first run** for `context7`, `sequential-thinking`, `playwright`, and `chrome-devtools` — each is configured as `npx -y <package>`, which fetches it from the npm registry the first time it launches, then caches it.
- **A local Chrome/Chromium install** for `chrome-devtools-mcp` to drive. Playwright may need its own separate `npx playwright install` step for browser binaries — not yet confirmed whether `@playwright/mcp` handles that automatically.
- **GitHub Copilot itself**, with agent mode available in whichever surface (CLI/VS Code/JetBrains) you're using.

## What This Plugin Does

Every command below is invoked as `/name` in Copilot Chat (CLI/VS Code/JetBrains alike). Personas either activate automatically based on what you're doing, or you can pick one manually from the agent picker.

### Commands (29)

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
- `save` / `load` — persist and restore project context across sessions manually
- `reflect` — check task adherence and completion against the stated goal
- Memory now also loads and saves **automatically**, without either command — see [Memory Automation](#memory-automation) below

**Research** (needs a web-search MCP server registered separately — not on by default)
- `research` — adaptive multi-hop web research with cited, confidence-scored output

**Meta / tooling**
- `select-tool` — routes an operation to the right underlying tool (symbol rename vs. bulk pattern edit vs. memory)
- `pm` — the default orchestration layer: delegates to the right persona automatically and keeps a running record of what was built and why

**External integrations** (opt-in, installed separately from the plugin — see below)
- `jira` — read-only issue/search/comment lookups via a local script, not an MCP tool call, to avoid the standing token cost of a separately hosted Jira MCP server
- `confluence` — same idea for read-only page/search/child-page lookups
- `gitlab` — same idea, broader surface: read-only projects/groups/merge requests/issues/commits/branches/files/pipelines/jobs/releases/milestones/labels/wikis/users/search, against gitlab.com or a self-hosted instance

### Personas (17) — architecture, quality, and specialist expertise
`system-architect`, `backend-architect`, `frontend-architect`, `devops-architect`, `security-engineer`, `performance-engineer`, `quality-engineer`, `refactoring-expert`, `python-expert`, `requirements-analyst`, `root-cause-analyst`, `technical-writer`, `learning-guide`, `socratic-mentor`, `pm-agent`, `deep-research-agent`, plus the `business-panel-orchestrator` (delegates to the 9 experts above, kept out of the manual picker).

### Behavioral Modes (7) — how to *approach* a problem, not what to do
`brainstorming` (discovery through questions), `introspection` (expose reasoning, catch your own mistakes), `task-management` (hierarchical, checkpointed via memory), `token-efficiency` (compressed output for long sessions), `orchestration` (pick the right tool/persona for each part of a task); `business-panel` and `deep-research` modes are the two agents above, not separate files.

### What's deliberately *not* here
Magic (AI UI-component generation) and Morphllm (bulk AI-powered edits) are dropped entirely — replaced by native Copilot generation plus the `ui-components`/`bulk-refactor` skills, which do the same job locally without sending code to a third party. Tavily (web search) is opt-in only, never default — see the corporate-safety section below for why.

## Corporate-safety posture
The default MCP profile is **Context7, Sequential-thinking, Playwright, chrome-devtools, and the custom Memory MCP server** — nothing else. Magic, Morphllm, and Tavily are deliberately not part of this plugin: Magic sent full file content to a third-party inference API, Morphllm only ever supported React, and Tavily (web search) has no local substitute for live web search, so it's opt-in only if wired in separately. Verified absent from every generated config and every skill/prompt/agent file — `grep -ri "magic\|morphllm\|tavily"` across the repo returns only explanatory text ("dropped, here's why"), never an actual wiring.

The Memory MCP server (the one piece of custom code here) has an automated test (`memory-mcp-server/test/network-isolation.test.js`) confirming it and its one dependency's transport module have no network-capable imports — not just a promise to code-review it once.

## Layout
```
sources/commands/*.md            # authored once per command (29); generates skill + prompt pair
sources/mcp-servers.json         # authored once; generates every MCP config, local and global
scripts/generate.js               # local generator: sources -> .github/skills, .github/prompts, .copilot, .vscode
scripts/deploy-global.js          # deploys this repo's content OUT to ~/.copilot/ and the IDEs' global MCP configs; also handles --all/--tool=jira,confluence,gitlab
scripts/patch-vscode-settings.js  # surgically adds chat.agentFilesLocations to VS Code's settings.json, comments-safe
.github/agents/*.agent.md         # 16 personas + orchestrator + 5 behavioral-mode agents — authored directly
.github/agents/experts/*.agent.md # 9 Business Panel expert subagents, user-invocable: false
.github/skills/*/SKILL.md         # 32 skills (29 generated commands, incl. jira/confluence/gitlab, + bulk-refactor + ui-components + deep-research)
.github/prompts/*.prompt.md       # generated locally only — no global equivalent exists
.github/hooks/post-implementation.json  # Copilot agent hook: pm-agent capture reminder — schema fixed, not yet hands-on run, see below
.github/hooks/session-memory.json # Copilot agent hooks: sessionStart/agentStop/sessionEnd memory automation, see "Memory Automation" below
.githooks/commit-msg(.js)         # git client-side hook: blocks AI-attribution mentions and long commit bodies — see "Git hooks" below
.copilot/mcp-config.json          # generated locally (repo-relative, for testing this repo standalone)
.vscode/mcp.json                   # generated locally, same reason
memory-mcp-server/                # Tier B: the Memory MCP server (src/) + its hook scripts (bin/) + tests
tools/                            # read-only Jira/Confluence/GitLab script tools — NOT deployed by default
```

This repo is the version-controlled **source of truth**. Nothing in `~/.copilot/`, VS Code's user-profile `mcp.json`, or JetBrains's global `mcp.json` should be hand-edited — edit here and redeploy instead.

## Global Deployment

```
npm run deploy:global
```

Copies/generates this repo's content to the actual locations Copilot reads from globally, across every project on the machine — not just this repo.

| What | Deployed to | Confirmed for |
|---|---|---|
| 32 skills | `~/.copilot/skills/<name>/SKILL.md` | CLI, VS Code (JetBrains: preview) |
| 31 agent files (flattened) | `~/.copilot/agents/*.agent.md` | CLI (JetBrains: likely, unconfirmed) |
| `copilot-instructions.md` | `~/.copilot/copilot-instructions.md` | CLI only — VS Code/JetBrains global instructions are settings-based, not a drop-in file |
| **Memory MCP server** (the committed `dist/index.js` bundle copied in as `src/index.js`, plus `src/store.js`, `bin/`, and a deps-free `package.json`; never `test/` or `node_modules/`) | `~/.copilot/mcp-servers/memory-mcp-server/` — a self-contained copy, not a reference back into this repo | **No `npm install` at deploy time** — all dependencies are inlined in the bundle, so the deploy works with the registry blocked. Deploy aborts with instructions if `dist/index.js` is missing from the source tree. |
| MCP servers (5, `memory` pointing at the installed copy above, not this repo) | `~/.copilot/mcp-config.json` | CLI — confirmed |
| Same MCP servers | VS Code's user-profile `mcp.json`, if found on the machine | Written only if VS Code's user-data folder is actually detected — otherwise the script prints the exact JSON to paste in via "MCP: Add Server" → Global |
| Same MCP servers | `~/.config/github-copilot/intellij/mcp.json` | Written per documentation, not yet hands-on confirmed |
| Hooks (`.github/hooks/*.json`, script paths resolved to the installed memory server above) | `~/.copilot/hooks/*.json` | User-level location per GitHub's hooks docs — applies across every repo, not just this one. Not yet hands-on run against a real Copilot hooks runtime. |

**Memory storage is shared globally by design, and sharded by project since the memory-automation work**: `~/.copilot/memory-data/global.json` (loads into every session everywhere) plus `~/.copilot/memory-data/projects/<id>.json` — one file per repo, keyed off a hashed `git remote get-url origin` so it survives re-clones. A pre-existing flat `memory.json` from before sharding existed is migrated into `global.json` automatically the first time it's touched, renamed to `memory.json.migrated` rather than deleted. Verified live (pre-sharding): wrote a key from one directory, read it back from a completely different one, got the same value; sharding/locking is unit-tested (see [Memory Automation](#memory-automation)) but not yet re-confirmed live.

**This repo can now be moved, renamed, or deleted without breaking anything already deployed** — the installed memory server at `~/.copilot/mcp-servers/memory-mcp-server/` is a self-contained copy (a single bundled `src/index.js` with all dependencies inlined, plus `src/store.js` and the `bin/` hooks), not a path back into this repo and not dependent on any `node_modules`. Re-running `deploy:global` re-syncs it from whatever this repo currently contains.

### Offline / restricted-registry install
Corporate/air-gapped machines where the public npm registry is blocked used to fail here: the old deploy ran `npm install` inside the installed memory server, and with no registry that step errored out. The server now ships as a single self-contained bundle instead, so deploy never touches npm:

1. **On a machine with npm registry access** (a maintainer's machine, or CI): `cd memory-mcp-server && npm install && npm run build`. This regenerates `dist/index.js` with the MCP SDK and `zod` inlined. Commit the result — it's a tracked build artifact. (Do this after any change to `src/index.js` or `src/store.js`; the bundle is what actually ships.)
2. **On the restricted machine**: clone/copy the repo (the committed `dist/index.js` comes with it) and run `npm run deploy:global`. The memory server is deployed by plain file copy — no `npm install`, no network. The other five MCP servers (`context7`, `sequential-thinking`, `playwright`, `chrome-devtools`) are `npx -y` and *do* still need registry access on first launch; only the local `memory` server is now fully offline-capable.

**`chat.agentFilesLocations` in VS Code's `settings.json` is now patched automatically** (`scripts/patch-vscode-settings.js`, called by `deploy:global`) — no manual step. Since `settings.json` is JSONC (comments and trailing commas allowed, which a plain `JSON.parse`/`stringify` round-trip would silently destroy), it's patched via surgical text insertion instead: the file is backed up first, unconditionally; if the key already exists it's left alone with instructions printed rather than risking a bad merge; the result is sanity-checked as valid JSON before anything is written, and the original is left untouched if that check fails. Tested against 6 scenarios (no file, plain JSON, comments + trailing commas, key already present, empty `{}`, pre-existing trailing comma) — all produce clean, valid output. If VS Code isn't installed on the machine running the deploy script, it says so and does nothing, same as the MCP config step.

**Jira/Confluence/GitLab script tools are opt-in, not part of the default deploy.** The `jira`/`confluence`/`gitlab` skills are always deployed like any other skill, but the underlying scripts they shell out to are not — run `npm run deploy:global -- --all` (all three tools) or `-- --tool=jira,confluence,gitlab` (any subset) to also install them to `~/.copilot/tools/`, a new sibling to `skills/`/`agents/`/`mcp-servers/`, not bundled inside the plugin itself. Without one of those flags, the skill exists but the script path it references was never resolved, and the skill itself is written to recognize that and say the tool isn't installed rather than fail confusingly. An unrecognized `--tool=` name aborts the whole deploy run, deploying nothing at all.

Re-run `npm run deploy:global` any time you change `sources/commands/*.md`, `sources/mcp-servers.json`, `.github/agents/*.agent.md`, or `.github/copilot-instructions.md`.

## Local Testing (this repo standalone)
```
npm run generate            # both skills+prompts and MCP configs, written locally to .github/.vscode/.copilot
npm run generate:skills
npm run generate:mcp-configs
```
Edit `sources/commands/*.md` or `sources/mcp-servers.json`, then regenerate — never hand-edit the generated `.github/skills/`, `.github/prompts/`, `.copilot/`, or `.vscode/` output directly, it'll be overwritten.

## Git hooks
A `commit-msg` hook lives in `.githooks/` (tracked, not `.git/hooks/` which never is) and rejects a commit if its message:
- names a known AI coding-assistant attribution marker (Claude, ChatGPT, Anthropic, OpenAI, GPT, Gemini, Codeium, Windsurf, Tabnine, the 🤖 emoji, a `claude.ai` URL, or an `@anthropic.com` address) — "Copilot" is deliberately exempt, since this repo is about GitHub Copilot and the word appears in normal commit messages
- has more than 3 lines of body content (the subject line doesn't count)

`npm install` at the repo root activates it automatically via the `prepare` script (`git config core.hooksPath .githooks`). To activate it by hand instead: `git config core.hooksPath .githooks`.

## Memory MCP server
```
cd memory-mcp-server
npm install        # dev only — for the tests and the bundler; the deployed server needs no install
npm run build      # regenerate the committed dist/index.js bundle (run after editing src/, then commit)
npm test          # 39 tests across 9 files: CRUD + concurrency, sharding/lifecycle, legacy migration,
                   # sessionStart/agentStop/sessionEnd hook behavior, network-isolation,
                   # and the shipped dist bundle (starts with no node_modules, persists across runs)
npm start          # runs the server directly over stdio, for manual smoke-testing
```

Four MCP tools, unchanged since Phase 3: `write_memory`, `read_memory`, `list_memories`, `delete_memory`. Each now accepts an optional `scope: "global" | "project"` argument (defaults to `"global"`, so nothing that already called these tools needs to change) — `"project"` scopes the entry to the current repo only, inferred automatically from `git remote get-url origin`, never something the caller has to name.

## Memory Automation

Three Copilot CLI hooks (`.github/hooks/session-memory.json`), all thin wrappers around `memory-mcp-server`'s own functions — no MCP round-trip, no LLM calls inside the hook scripts themselves:

| Hook event | Script | Does |
|---|---|---|
| `sessionStart` | `bin/memory-hook.js` | Injects a digest of relevant memories as context, so `/load` is never required. Merges global entries with the current repo's project-scoped entries, capped to ~20 entries / ~2K tokens. Silently emits nothing if there's nothing relevant, rather than sending boilerplate every session. |
| `agentStop` | `bin/memory-nudge-hook.js` | Nudges the model to call `write_memory` itself, at most once per session, when the turn looks worth remembering (a file-editing tool call, 3+ turns, or a 10-minute-plus session). Guarded against ever blocking twice in a row by both the CLI's own `stop_hook_active` flag and a one-shot sentinel file. |
| `sessionEnd` | `bin/memory-checkpoint-hook.js` | Fallback only: if nothing was saved this session, writes one low-fidelity `checkpoint/<project>/<timestamp>` entry (session id, repo, termination reason — `sessionEnd` has no transcript access, so no conversation content) so nothing is silently lost. |

**Turning it off**: `write_memory("config/nudge", "off")` disables the `agentStop` nudge specifically, without touching auto-load or the checkpoint fallback.

**Lifecycle** (runs opportunistically inside `sessionStart`'s load, no separate cron/schedule): project shards untouched for 90 days are deleted outright, not archived — overridable via `write_memory("config/project-purge-days", "<n>")`. Global entries are capped at 50, oldest-by-least-recently-read evicted to `~/.copilot/memory-data/archive/global-overflow.jsonl` rather than deleted — overridable via `write_memory("config/global-cap", "<n>")`.

**Concurrency**: an advisory file lock (`<file>.lock`, exclusive create + staleness detection) plus atomic tmp-then-rename writes, applied inside `store.js` itself so it covers both separate MCP server processes and the hook scripts — not just concurrent calls within one process. Stress-tested with real separate `node` processes hammering the same key concurrently (`test/concurrency.test.js`).

**Real, known gaps, not glossed over**:
- Nothing here has run inside an actual Copilot CLI session — every hook has been tested by piping a hand-built JSON payload into the script directly, not by the real Copilot runtime.
- The transcript format `agentStop` hands the nudge hook is unconfirmed; parsing is a best-effort text scan that degrades to "found nothing" rather than throwing, and the session-duration trigger works independently of it either way.
- JetBrains support for `sessionStart`/`agentStop`/`sessionEnd`'s `additionalContext`/`decision:block` mechanics specifically is unconfirmed (existing docs only confirm this level of detail is missing for `preToolUse`).
- Whether this collides with GitHub's own native Copilot Memory feature (`/memory on|off|show`) for context budget is unconfirmed — this pipeline's own digest is capped and skips itself when empty specifically to reduce that risk, not eliminate it.

## Verification status

### Automated
- Generator produces structurally correct output for all 29 commands, checked against the documented CLI (`mcpServers`)/VS Code (`servers`) formats.
- Magic/Morphllm/Tavily confirmed absent everywhere, not just unused.
- Memory MCP server: all 39 tests pass, including a real cross-process concurrent-write race exercised with separate `node` processes (not just concurrent promises in one process) and required a real file-locking fix, not just the original in-process queue (see `memory-mcp-server/src/store.js`).
- Memory MCP server responds correctly to a real MCP `initialize` handshake and lists all 4 tools correctly via `tools/list` (manually smoke-tested, not just unit-tested in isolation).
- Bundled deploy: the shipped `dist/index.js` bundle is spawned with no `node_modules` anywhere on its path (`test/dist.test.js`) and confirmed to start, list all four tools, and persist a memory that a later bundle process reads back — proving the "deploys with the npm registry blocked" claim. `test/network-isolation.test.js` additionally asserts the bundle contains zero network-capable imports, so tree-shaking really did drop the SDK's unused HTTP/SSE transport code (express/cors/eventsource).
- Memory automation hooks (`sessionStart`/`agentStop`/`sessionEnd`): unit-tested end-to-end by spawning each hook script as a real subprocess with a hand-built JSON payload on stdin and asserting its stdout — auto-load digest content and capping, once-per-session nudge dedup via both `stop_hook_active` and the sentinel file, the `config/nudge` off-switch, the duration trigger working independently of transcript parsing, and the checkpoint fallback firing only when nothing else was saved.
- Jira/Confluence/GitLab scripts: 16 GitLab unit tests plus the pre-existing Jira/Confluence tests all pass (`node --test tools/*/test/*.test.js`), covering URL construction, auth header shape (Basic email:token vs. GitLab's bare `PRIVATE-TOKEN`), missing-credential errors, non-2xx errors not leaking the token/PAT, and digest formatting.

### Real-instance smoke test (Jira/Confluence/GitLab, against public open-source projects)
No credentials for a private Jira, Confluence, or GitLab instance were available, so this ran against public instances instead — real network calls, real data, no secrets involved:

- **GitLab** (`gitlab.com`, project `gitlab-org/gitlab-shell`): ran the `gitlab-fetch.js` CLI unmodified, end to end, anonymously — GitLab treats a present-but-blank `PRIVATE-TOKEN` header as anonymous rather than rejecting it, unlike a genuinely wrong value (confirmed: an invalid token gets `401`, a blank one gets `200`). `project show`, `branch list`, `tag list`, `file show`, `commit list`, `mr list`, `mr show`, `issue list`, `release list`, `pipeline list`, and `job list` all returned correct, well-formatted real data, including the `X-Total` pagination header parsing (`getJsonWithMeta`) matching GitLab's real total counts. A real `404` (nonexistent project) surfaced GitLab's own error message with exit code 1, as designed.
  **Finding, not a bug**: `mr comments`/`issue comments` (discussions), `search` (both scopes), and `wiki list` all return `401`/`403` even anonymously on a fully public project — GitLab's own API requires real authentication for those specific endpoints regardless of project visibility. The script's error handling did exactly what it should: surfaced GitLab's real error cleanly, didn't leak the (blank) token, exited non-zero.
- **Jira** (`issues.apache.org`, a public Jira Data Center instance) and **Confluence** (`cwiki.apache.org`, public wiki): these servers allow fully anonymous `GET`s with *no* `Authorization` header at all, but reject *any* `Authorization` header — even a syntactically-empty one — with `401`. Since `jira-fetch.js`/`confluence-fetch.js` always send one once credentials are configured, the full CLI couldn't be run end-to-end anonymously the way GitLab's could. Instead, real JSON was fetched anonymously and run through the exact shipped `formatIssue`/`formatSearchResults`/`formatComments`/`formatPage`/`formatChildren` functions. All rendered correctly against real data (`HADOOP-1`, an Apache Airflow AIP wiki page, live search results) — including confirming that Jira Data Center's API v2 `description` field is a **plain string, not ADF**, which `adfToText()`'s existing string-passthrough branch already handles without changes.

Net: GitLab's read path is now hands-on verified against a real instance for everything except discussions/search/wiki (which need a real PAT to test at all). Jira/Confluence's formatting logic is hands-on verified against real Data Center data; the full authenticated CLI path against a real **Cloud** instance is still unverified.

### Resolved by research, high confidence but not yet hands-on confirmed
- **JetBrains MCP config**: no separate file needed — it reads the same `.vscode/mcp.json` VS Code does (project-level; a `~/.config/github-copilot/intellij/mcp.json` global fallback also exists but isn't relevant here). The generator no longer produces a speculative JetBrains artifact.
- **Copilot CLI's `${workspaceFolder}` substitution**: confirmed supported in `mcp-config.json`, so the Memory MCP server's registered path should work as already written.

Both still need a hands-on check — documentation research is high-confidence, not proof.

### Not yet verified
- **Nothing has been loaded into a real Copilot CLI, VS Code, or JetBrains session.** All 29 commands, 17 personas, and the Memory MCP server need to be installed into an actual test repo and exercised in all three surfaces.
- **Jira/Confluence/GitLab scripts against a real *Cloud*/authenticated instance are still unverified** — see the real-instance smoke test above for what has been checked (public data, anonymous where possible). What's left: a real Atlassian Cloud PAT and a real GitLab PAT against private/authenticated-only endpoints.
- **Both `.github/hooks/*.json` files now use the real, documented hook schema** (`type: "command"` with `bash`/`powershell`, not the invalid `action`/`message` shape `post-implementation.json` originally shipped with) but **neither has actually been run by a real Copilot hooks runtime yet** — the memory automation hooks are unit-tested by direct subprocess invocation only, not by Copilot CLI itself calling them.
- **Business Panel's real subagent delegation** (orchestrator → 9 experts) needs an actual run in each surface to confirm genuine delegation, not just file structure correctness.
