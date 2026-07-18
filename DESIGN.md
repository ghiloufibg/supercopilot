# SuperClaude-for-Copilot — Design & Development Plan

Working title only — see [§9 Open Decisions](#9-open-decisions) for the naming conflict with an unrelated existing "SuperCopilot" project.

Status: design analysis, no code written yet. Research current as of 2026-07-18.

**Revision 3** — the three previously-open Phase-0 unknowns are now resolved:

1. **Skill invocation UX is explicit `/name` on all three surfaces** (decided). Native on Copilot CLI; on VS Code and JetBrains, guarantee it via the prompt-file mirror layer rather than relying on skills' auto-detection alone (see §6).
2. **JetBrains's MCP config is repo-committable**, same as VS Code's and CLI's (decided) — exact filename/key to be confirmed during Phase 1 implementation, but the "generate three artifacts from one source" architecture in §6 holds without a documentation-only fallback.
3. **VS Code confirmed to support subagent delegation via `tools: [agent]`** (research finding). VS Code has a dedicated doc, "Subagents in Visual Studio Code" (VS Code 1.109+): an agent's `tools` list can include `agent` to invoke other agents, an `agents: [...]` frontmatter field restricts which ones it may delegate to, and `user-invocable`/`disable-model-invocation` control whether an agent is manually pickable versus reachable only as a subagent. This matches what was already confirmed for Copilot CLI and JetBrains — all three surfaces now confirmed.

Net effect: the Tier A architecture (§6) needs no more caveats or fallbacks for these three points. The only remaining genuine unknown is the exact JetBrains MCP file/key naming, which is a Phase 1 implementation detail, not a design risk.

---

## 1. Executive Summary

SuperClaude is a prompt-engineering and orchestration layer built for a runtime (Claude Code) with first-class subagent spawning, MCP tool calls, and session memory. GitHub Copilot's 2026 customization surface — instructions, path-scoped instructions, skills, custom agents (which double as subagents), hooks, and MCP — now confirmed to cover the same ground **identically across Copilot CLI, VS Code, and JetBrains** for every mechanism except prompt files (still VS Code/Visual Studio/JetBrains only, not CLI) and true cross-session memory (native nowhere).

**Verdict**: fully declarative for ~85% of SuperClaude's content, cross-platform, with the sole custom-code component being a portable **Memory MCP server** to replace Serena — and even that is deliverable identically on all three surfaces because MCP itself is supported everywhere.

**Revision 4** — given this plugin targets corporate GitHub Copilot instances, §5b/§5c investigate what each proposed MCP server actually sends off-network and revise the tool set accordingly: **Morphllm and Magic are dropped entirely**, replaced with local/native equivalents at no meaningful capability cost, and **Tavily is excluded from the default profile** (a real, acknowledged capability loss — no local substitute for live web search exists). The default corporate MCP profile is now just Context7, Sequential-thinking, Playwright + chrome-devtools, and the custom Memory MCP server. This is reflected throughout §2, §4, §6, and §7 below, not only in §5b/§5c.

**Revision 7** — simplified §5b/§6: no `preToolUse` hook enforces the Magic/Morphllm/Tavily drop. They're **dropped**, not blocked — nothing in the ported plugin calls them, so a deny-hook would only guard against a mistake made while porting from source material that historically hardcoded them, not something in active use. Caught by code review during the port instead of a permanent extra file.

**Revision 8** — scope decisions plus two research resolutions. This is a **personal-use-only project**: no license, no publishing, no distribution tooling (§9.2/§9.3 closed as N/A). Two of the three items flagged as "genuinely unverified" in the last readiness pass turned out resolvable by documentation research rather than requiring hands-on IDE testing: (1) **JetBrains reads the same `.vscode/mcp.json` VS Code does** — no separate JetBrains artifact needed at all, simplifying Tier A from three MCP config artifacts to two; (2) **Copilot CLI's `${workspaceFolder}` substitution is confirmed supported** in `mcp-config.json`, so the Memory MCP server's registered path should work as already written. Both are high-confidence-from-documentation, not yet hands-on-confirmed — `TESTING.md` still asks for that confirmation, since research isn't a substitute for actually running it.

**Revision 10** — global deployment, not per-repo. Since this is used across many of the user's own projects rather than one, per-repo `.github/`/`.vscode/`/`.copilot/` copies were the wrong model. Research confirmed genuine global/personal locations exist: `~/.copilot/skills/` and `~/.copilot/agents/` (confirmed for CLI, and VS Code can be pointed at the same folder via its `chat.agentFilesLocations` setting — no duplication needed), `~/.copilot/copilot-instructions.md` (CLI), and per-surface global MCP configs (`~/.copilot/mcp-config.json` for CLI, VS Code's user-profile `mcp.json`, JetBrains's `~/.config/github-copilot/intellij/mcp.json`, the last two written per documentation, not yet hands-on confirmed). This repo remains the version-controlled **source of truth** — `scripts/deploy-global.js` (via `npm run deploy:global`) copies/generates from here out to those global locations; nothing in `~/.copilot` or the IDE user-data folders should be hand-edited directly. Prompt files are dropped from this deployment entirely — no global equivalent exists for them, and they were only ever a per-repo workaround. **`chat.agentFilesLocations` is patched into VS Code's `settings.json` automatically** (`scripts/patch-vscode-settings.js`) rather than left as a manual step — `settings.json` is JSONC (comments/trailing commas allowed per VS Code's own docs), so a naive parse-mutate-restringify would silently destroy comments; instead the key is inserted via surgical text splicing, backed up first, skipped with instructions if the key already exists, and sanity-checked as valid JSON before the write happens at all. Tested against 6 realistic scenarios (no file, plain JSON, comments + trailing commas, key already present, empty object, pre-existing trailing comma). See §10 for the full breakdown.

**Revision 11** — closes a real gap Revision 10 left open: the Memory MCP server's *registration* was global, but its actual code still lived inside this dev repo, referenced by absolute path — renaming, moving, or deleting `supercopilot` would have broken every project's `memory` server. Fixed by making `deploy-global.js` a genuine **installer**: it copies `memory-mcp-server/{package.json,src/}` (never `test/`, never `node_modules/`) to `~/.copilot/mcp-servers/memory-mcp-server/`, runs `npm install` *there*, and points every generated MCP config at that installed copy instead of the dev repo. Also decided explicitly (previously an open question in TESTING.md): **memory storage is shared globally, not per-project** — `store.js`'s default changed from `process.cwd()`-relative to a fixed `~/.copilot/memory-data/` path. Proven live: wrote a key from one directory, read it back from a completely unrelated directory, got the same value. One real bug found and fixed during this work: `execFileSync('npm', ...)` silently failed on Windows because `npm` is `npm.cmd` there and `execFileSync` doesn't resolve through a shell by default — fixed with `shell: true`, confirmed by running the install both ways and comparing.

---

## 2. SuperClaude Feature Inventory

Unchanged — RULES/PRINCIPLES/FLAGS, 7 behavioral modes, 7 MCP integration docs, RESEARCH_CONFIG, 26 `/sc:*` commands, 17 specialist personas, 1 stack-scoped rule pack, business panel content (9 experts × 3 interaction modes). See Rev 1 for the full breakdown; only the Copilot-side mapping changed across revisions, not the inventory itself.

**Revision 5 (readiness-review fixes)**: the command count is 26, not 25 — every command actually named across §5e/§5f was counted directly rather than trusting the original inventory's stated total, and it comes to 26 (analyze, brainstorm, build, business-panel, cleanup, design, document, estimate, explain, git, help, implement, improve, index, load, pm, reflect, research, save, select-tool, spawn, spec-panel, task, test, troubleshoot, workflow). The persona count of 17 (corrected below) is now consistent everywhere it's cited — §3, §4, and §6 previously still said 18 after this section's own correction; fixed. §5b's chrome-devtools default-profile status, the Memory MCP server's tool-surface gap against `/reflect` and `/save`'s actual dependencies, and two additional audit findings (`socratic-mentor.md`, `pm-agent.md`) are resolved in §5d/§5e/§6 below — see the readiness review that prompted this revision for the full list.

Of the 7 original MCP integration docs, 2 (Morphllm, Magic) are dropped and replaced with local/native equivalents, and 1 (Tavily) is opt-in rather than default, per the security review in §5b/§5c. Context7, Sequential, Playwright, and Serena (→ the custom Memory MCP server) remain as designed.

**Correction (§5d)**: the persona count is 17, not 18. `claude-code-guide` has no corresponding local persona source file — it's a built-in Claude Code product-support agent describing Claude Code itself, not a SuperClaude-authored persona, and it should not be ported at all.

---

## 3. Per-Surface Support Matrix

| Mechanism | Copilot CLI | VS Code | JetBrains | Notes |
|---|---|---|---|---|
| Repo-wide instructions (`.github/copilot-instructions.md`, `AGENTS.md`) | ✅ | ✅ | ✅ | Universal — always safe. |
| Path-scoped instructions (`.github/instructions/*.instructions.md`) | ✅ | ✅ | ✅ | Verify `applyTo` glob is honored identically before relying on precise scoping. |
| **Skills** (`.github/skills/*/SKILL.md`) | ✅ explicit `/skill-name` | ✅ (agent mode) | ✅ (agent mode) | Confirmed cross-surface. Substance/logic layer for all 26 `/sc:*` commands. |
| Explicit `/name` invocation | ✅ native | Guaranteed via prompt-file mirror (see §6) | Guaranteed via prompt-file mirror (see §6) | **Design requirement, not just nice-to-have** — decided. Skills alone give CLI free explicit invocation; VS Code/JetBrains need the mirror layer to match. |
| **Custom agents** (`.github/agents/*.agent.md`) | ✅ (also = subagents) | ✅ | ✅ (GA March 2026) | Same file format across CLI, VS Code, JetBrains, Eclipse, Xcode. Tool names/frontmatter properties can still differ subtly — test per surface. Primary mechanism for 17 personas + 7 behavioral modes. |
| **Subagent delegation** (`tools: [agent, ...]`, `agents: [...]` allow-list) | ✅ confirmed | ✅ **confirmed** (VS Code 1.109+, "Subagents in Visual Studio Code") | ✅ confirmed (GA March 2026) | Resolved in Rev 3 — no longer a caveat. `user-invocable: false` / `disable-model-invocation` let an agent be delegate-only (hidden from the manual picker), which is exactly what the Business Panel's 9 expert files want. |
| Intent-based auto-selection of agents (`infer: true`, default on) | ✅ | Plausible, same underlying delegation mechanism | Plausible | Best cross-platform approximation of FLAGS.md's auto-activation. Still a model judgment call, not a deterministic threshold — validate empirically, don't guarantee. |
| Hooks (`.github/hooks/*.json`) | ✅ full event set + input rewrite | ✅ full event set + input rewrite | ✅ (preview) but `preToolUse` **can only deny, not rewrite** | Design hooks to the JetBrains subset (block/allow/log) unless degraded JetBrains behavior is acceptable. |
| MCP servers | ✅ `.copilot/mcp-config.json` (repo-committable), key `mcpServers`, `${workspaceFolder}` substitution confirmed supported (Revision 8) | ✅ `.vscode/mcp.json` (repo-committable), key `servers`, stdio transport | ✅ reads the **same `.vscode/mcp.json`** VS Code does (Revision 8, resolved from documentation research) | Two artifacts, not three — JetBrains needed no separate file after all. Not yet hands-on confirmed, see `TESTING.md`. |
| **Prompt files** (`.github/prompts/*.prompt.md`) | ❌ not supported | ✅ (preview) | ✅ (preview) | Not the source of truth (CLI can't read them) but now load-bearing for the explicit-`/name` requirement on VS Code/JetBrains — see §6. |
| Cross-session memory | ❌ none native | ❌ none native | ❌ none native | Requires the custom Memory MCP server (§6, Tier B). |
| Live context-window usage / resource-zone telemetry | ❌ no public API | ❌ no public API | ❌ no public API | No cross-platform equivalent; best-effort only. |

---

## 4. Compatibility Matrix

Tiers: **A** = direct, declarative, cross-platform (CLI+VS Code+JetBrains) port. **B** = cross-platform but with acknowledged fidelity loss. **C** = requires custom code, but still deliverable cross-platform via MCP. **D** = not feasible on any surface today.

| SuperClaude feature | Copilot mechanism | Tier | Notes |
|---|---|---|---|
| `RULES.md`, `PRINCIPLES.md` | `.github/copilot-instructions.md` | **A** | Condense per Copilot's own guidance against long unfocused instruction files. |
| `RULES_Angular21_ChromeExt.md` | `.github/instructions/angular21-chromeext.instructions.md`, `applyTo` glob | **A** | |
| 26× `/sc:*` slash commands | 26× `.github/skills/<name>/SKILL.md` **+ matching `.github/prompts/<name>.prompt.md` mirror** | **A** | Skills carry the logic on all three surfaces; the prompt-file mirror is what guarantees explicit `/name` invocation on VS Code and JetBrains to match CLI's native behavior. Both generated from one authored source, not maintained twice by hand. |
| 17 specialist personas | `.github/agents/*.agent.md` | **A** | Per-persona tool allow-lists and model pinning; test tool names per surface. |
| 7 behavioral modes | `.github/agents/*.agent.md`, `description` + default `infer: true` | **A/B** | Manual mode-switching guaranteed everywhere; automatic triggering is a bonus, validate rather than assume. |
| MCP docs (Context7, Sequential, Playwright) | Three parallel, all repo-committable MCP config files, in the **default corporate profile** | **A** | One source of truth, three generated artifacts — no IDE-settings-only fallback needed now. Tavily deliberately excluded from this default set — see next rows and §5b/§5c. |
| Morphllm (bulk pattern edits) | **Dropped** (§5c) — native Copilot multi-file edit/apply-patch tools + local codemod tooling (ESLint `--fix`, jscodeshift/ts-morph, ast-grep/comby) via a `bulk-refactor` skill | **B** | The three example use cases in MCP_Morphllm.md (ESLint enforcement, `console.log`→logger replacement, class-components→hooks) are exactly what local codemod tooling already does, zero data leaves the network. |
| Magic (UI component generation) | **Dropped** (§5c) — native Copilot UI generation + a `ui-components` skill/instructions file pointing at the org's own internal design system | **B** | Arguably a better fit for corporate use than the original public 21st.dev pattern marketplace, not just a safer one. |
| Tavily / MCP_Tavily.md (live web search, `/sc:research`, DeepResearch mode) | **Excluded from the default profile** (§5c) — no local substitute exists; ship the `deep-research` skill's static policy content only, gate its live-search capability behind separate opt-in MCP registration | **B** | The one real, acknowledged capability loss in this design — see next row and §5c. Nothing else in the plugin depends on it. |
| Business Panel (9 experts, discussion/debate/socratic) | Orchestrator `.agent.md` (`tools: [agent, ...]`, `agents: [...]` allow-list) delegating to 9 `user-invocable: false` expert `.agent.md` files | **A** | Fully resolved as of Rev 3 — subagent delegation confirmed on all three surfaces. The 9 expert files stay out of the manual agent picker (delegate-only) via `user-invocable: false`. Doesn't depend on any dropped tool. |
| `RESEARCH_CONFIG.md` | `.github/skills/deep-research/SKILL.md` | **A** (policy content) / **B** (live search gated behind opt-in Tavily, or an org-approved equivalent) | Static policy content (hop patterns, credibility tiers) ports cleanly regardless; the skill is only as useful as whatever web-search MCP server is actually registered, which is not Tavily by default. |
| Serena: `write_memory`/`read_memory`/`list_memories` | Custom **Memory MCP server** (stdio), registered in all three (now all repo-committable) MCP configs | **C**, cross-platform by construction | The one required piece of real code, and it's portable by design. |
| Serena: symbol rename/find-references | Native Copilot workspace-symbol tools | **B** | Don't rebuild — but coverage is language-dependent, not uniform: Copilot CLI's find-references/rename/workspace-symbol operations rely on a language server (LSP) being available, and maturity varies (e.g. C++ LSP support only reached public preview April 2026). Degrades gracefully to text search where no LSP exists, but fidelity isn't the same across every language — see §5c. |
| `FLAGS.md` deterministic auto-activation | Agent `description` + `infer: true` | **B** | Best available approximation; no surface has genuinely deterministic thresholds. |
| Orchestration mode's resource-zone thresholds | No cross-platform telemetry API | **D** | State as unsupported, don't fake it. |
| `pm-agent` (post-implementation documentation) | `.github/hooks/*.json` (`postToolUse`/`agentStop`) → skill/agent that writes notes | **B** | Works at block/allow/log level everywhere; avoid relying on JetBrains input-rewrite (unsupported there). |
| `--think`/`--think-hard`/`--ultrathink` | `model:` field in agent/skill frontmatter | **B** | Same intent (more compute for harder problems), different mechanism. |
| GitHub.com / mobile parity | Instructions only | **D** (partial) | Not a target surface per current requirements; noted for completeness. |

Rough tally: **~85%** direct cross-platform declarative port. **~10–12%** with acknowledged fidelity loss. Only cross-session memory requires real code — and it's cross-platform by construction.

---

## 5. Fundamental Gaps (still real, plan around them)

1. **No cross-platform context-window telemetry** — resource-zone logic stays unreproducible on any surface.
2. **No native cross-session memory anywhere** — solved by the Memory MCP server, not by any host feature.
3. **No deterministic auto-activation** — `infer: true` intent-matching approximates FLAGS.md but is a model judgment call, not a guaranteed trigger.
4. **Skills/agents/hooks are still comparatively new** (JetBrains's are explicitly "preview" for hooks, GA-as-of-March-2026 for agents) — re-verify behavior before each release; preview features churn.
5. **JetBrains's `preToolUse` hook can only deny, not rewrite input** — keep hook logic to block/allow/log to stay within the lowest common denominator.
6. **~~Exact JetBrains MCP config filename/key~~ Resolved (Revision 8)** — JetBrains reads the same `.vscode/mcp.json` VS Code does (project-level), per documentation research; not yet hands-on confirmed, see `TESTING.md`.

---

## 5a. Resolution Status of the Three ❌ Rows in §3/§4

The ❌/Tier-D markers in the matrices above conflate "not supported by that specific host" with "unresolved gap in this design" — they're not the same thing. Disambiguated:

| Item | Status | How |
|---|---|---|
| Prompt files (`.github/prompts/*.prompt.md`) | **Resolved** — scoping, not a gap | ❌ only means Copilot CLI doesn't read this directory. The design still ships a `.prompt.md` mirror per skill (§6), consumed only by VS Code/JetBrains to guarantee explicit `/name` invocation there; CLI gets the same explicit invocation natively from Skills and simply never reads these files. |
| Cross-session memory | **Resolved** — via the one piece of real code in the project | The Memory MCP server (§6, Tier B) implements it directly and is registered identically across all three surfaces' MCP configs, since MCP itself is supported everywhere even though native memory isn't. |
| Live context-window / resource-zone telemetry | **Not resolved — accepted limitation** | No surface exposes this via a public API. The optional `context_budget_estimate` MCP tool mentioned in §6 is a deliberately lower-fidelity heuristic stand-in, explicitly not presented as equivalent. This is the one item in the whole design with no real fix, only a labeled approximation. |

---

## 5b. Third-Party Data Exposure Review (Corporate Deployment)

Triggered by a real constraint: this plugin is meant to run inside corporate GitHub Copilot instances, so every MCP server it wires up needs to be classified by what it actually sends off-network, not just by what it's useful for.

| MCP server | Vendor | What leaves the network | Risk | Corporate default |
|---|---|---|---|---|
| Context7 | Upstash (external SaaS) | Library name + doc query only. Vendor documentation states code/prompts are not sent and sensitive data is stripped before transmission; usage metadata (which libraries, how often) is collected if an API key is used. | Low | Opt-in via org MCP allowlist. Enterprise self-hosted option exists if even query metadata is a concern. |
| Tavily | External SaaS | Full search query text (can include pasted code/error messages if the query is composed from them), plus a session/human ID (hashed server-side). | Medium | Opt-in, allowlisted. Same risk class as any external web-search tool — govern by policy on what's allowed in a query, not by banning the tool outright. |
| 21st.dev Magic | External SaaS | Natural-language component description "with appropriate context" + auth token, over HTTPS. | Medium-High | **Dropped (§5c)** — replaced by native Copilot UI generation + a local skill pointing at the org's own internal design system, rather than an external public pattern marketplace. |
| Morphllm / Fast Apply | External SaaS (Morph) | **Confirmed directly from the vendor's own docs: the full original file content plus the edit instruction, sent verbatim in an HTTP request** to Morph's hosted inference API, which merges and returns the result. | **High** | **Exclude from the corporate default profile entirely.** Rely on Copilot's own native multi-file edit tools instead (already noted in §4 as sufficient for most cases). If a team genuinely needs it, that's a per-repository security/legal sign-off, not a default. |
| Sequential-thinking | None (local reasoning scaffold) | Nothing, in the typical implementation | Low | On by default — verify the specific server binary has no telemetry/network code before shipping. |
| Playwright | Local browser automation | Nothing beyond whatever site is navigated to (same exposure as a developer opening that URL manually) | Low, context-dependent | On by default, scoped to internal apps; flag if a workflow points it at external SaaS test targets. |
| Custom Memory MCP server (Tier B, this project's own build) | N/A — we write it | Must be zero outbound network calls, local file store only (`.copilot-memory/`) | Under our control | **Hard requirement, not an assumption** — code-review this specifically before trusting it with project state, since it's the one component here that isn't a third-party vendor's black box. |
| GitHub's official MCP server (if added for issue/PR context) | GitHub (same vendor as Copilot itself) | Repo/issue/PR data, to GitHub's own backend | Low-Medium | Same vendor already processing your code via Copilot — confirm coverage under your org's existing Copilot data-processing agreement rather than assuming it's automatically included. |
| chrome-devtools (surfaced by pm.md, §5e — not in the original 7-server inventory) | None (local Chrome DevTools Protocol automation, same class as Playwright) | Nothing beyond whatever page is being inspected locally — console messages, network requests, performance traces stay on-machine | Low, same reasoning as Playwright | On by default alongside Playwright, same internal-scoped caveat: irrelevant/no-op outside a browser-debugging context, not a data-exposure concern. |

### Recommendations (superseded in part by §5c's concrete findings)

1. **Corporate default profile: Sequential-thinking, Playwright + chrome-devtools (both internal-scoped), the custom Memory MCP server, and Context7.** (Revision 5: chrome-devtools is included here explicitly — it was previously missing from this list despite its own risk-table row already saying "on by default," which contradicted this recommendation and two other locations. It's classified identically to Playwright — local, low-risk, a no-op outside a browser-debugging context — so it belongs wherever Playwright does, not as a separate case.) Morphllm and Magic are **dropped outright** (§5c found local/native substitutes that don't compromise capability), and Tavily is **off by default with no bundled substitute** (§5c found none exists — live web search inherently requires an external query).
2. **Enforce this with GitHub's own org/enterprise MCP allowlist**, not developer self-discipline: Copilot Business/Enterprise → AI controls → MCP → "Restrict MCP access to registry servers" (Allow all vs. Registry only; enterprise policy overrides org policy; enforced across VS Code, JetBrains, and CLI — currently public preview). Register Context7, Playwright, chrome-devtools, and the Memory MCP server, and set "Registry only" — Morphllm and Magic never need registering at all since they're not part of the plugin anymore, and Tavily stays unregistered unless a specific team gets separate sign-off.
3. **Least-privilege per agent** — even for the servers that remain (Context7), don't grant every persona/agent file's `tools:` list access by default; only the specific skill/agent that legitimately needs it should list it.
4. **Dropped (Revision 7): no hook enforcing the Magic/Morphllm/Tavily drop.** Magic, Morphllm, and Tavily are simply **not referenced anywhere** in this plugin's ported skills/agents/MCP config once §5f's fixes are applied — there's nothing to call, so a deny-hook would only ever be a no-op safety net against the original source material's habit of hardcoding them (found 4 times in the audit, §5e). That's real but minor risk, worth catching in code review during the port rather than a permanent extra file. Marked here as dropped, not blocked — the distinction matters: dropped means absent from this plugin; a block would imply something is still trying to call them.
5. **Audit the Memory MCP server's source before rollout** — it's the one piece of this project that isn't someone else's already-reviewed vendor code, so it gets the highest scrutiny, not the least.
6. **Be honest about what's a technical control versus a convention (Revision 6)**: everything above is enforced by architecture — an excluded tool simply isn't registered, the registry allowlist is an admin-side policy, the Memory MCP server's network isolation is (now) tested. Playwright/chrome-devtools's "internal apps only" scoping is the one exception — it's a documented convention, not something the design technically prevents a developer from pointing at an external site. If that gap matters for your threat model, it needs a network-level egress policy on the machines running these tools, which is outside this plugin's own scope to enforce.

---

## 5c. Investigation: Replacing or Dropping the Medium/High-Risk Tools

Requested directly: can Morphllm, Magic, and Tavily be replaced with local/handwritten equivalents or dropped outright, without compromising the plugin, given that safety is explicitly weighted above efficiency here? Findings per tool:

### Morphllm (High risk) — **drop, replace with local tooling**

MCP_Morphllm.md's own stated use cases are: enforcing style-guide rules across a project, bulk text replacement (e.g. `console.log` → logger calls), and framework-pattern migrations (class components → hooks). None of these actually require an external hosted model — but the original examples are all JS/TS-flavored, and the first draft of this replacement copied that bias uncritically. Corrected below.

- **Style-guide enforcement** → **do not hardcode a linter.** Detect the target repo's language(s) and dispatch to whatever formatter/linter is already configured there: ESLint/Prettier for JS/TS, ruff/black for Python, gofmt/golangci-lint for Go, rustfmt/clippy for Rust, `dotnet format` for C#, Checkstyle/OpenRewrite for Java. Hardcoding ESLint would silently fail on every non-JS/TS repo in a corporate estate.
- **Bulk text replacement / ad hoc edits** → Copilot's own native multi-file edit tools — genuinely language-agnostic, since it's the model generating and applying text edits with no language-specific parser involved.
- **Framework-pattern migrations / structural bulk transforms** → **ast-grep** as the primary backend, not jscodeshift/ts-morph. jscodeshift and ts-morph are JS/TS-only (built on JS/TS-specific ASTs) and would silently not work outside that ecosystem. ast-grep is genuinely polyglot — built on tree-sitter, with real per-language parsing across JS/TS, Python, Go, Rust, Java, C/C++, C#, Kotlin, and more. Comby is an option for lightweight cross-language pattern matching but has a confirmed real limitation: it doesn't parse, it pattern-matches, so it explicitly struggles with indentation-sensitive languages like Python — not safe as a default in a mixed-language corporate estate.

Recommendation: **do not ship Morphllm at all.** Replace it with a `.github/skills/bulk-refactor/SKILL.md` that (a) detects the repo's language(s) before choosing a tool, (b) uses ast-grep as the default structural-pattern engine rather than a JS/TS-only codemod tool, (c) dispatches style/lint fixes to whatever formatter the repo already has configured rather than assuming ESLint, and (d) falls back to Copilot's native edit tool for anything else. This is now a genuinely language-agnostic substitute for the documented use cases, at the cost of losing Morph's semantic "fuzzy match partial snippets" convenience — a real but minor efficiency loss, not a functional gap.

### 21st.dev Magic (Medium-High risk) — **drop, replace with native generation + the org's own design system**

Magic's value proposition is access to 21st.dev's curated public component-pattern library so generated UI looks more polished than generic model output. Two observations change the calculus for a corporate deployment:

1. Copilot's own agent mode is already capable of generating React/Vue/Angular components directly — the capability isn't gated behind Magic, only the "professionally pre-designed" polish is.
2. A real company almost always has **its own internal design system** (a component library, a Storybook, internal Figma-to-code conventions) that generated UI should match — not a public marketplace of generic patterns. Pointing Copilot at 21st.dev's patterns is arguably the wrong output target for corporate use even ignoring the data-exposure question.

Recommendation: **do not ship Magic at all.** Replace it with a `.github/skills/ui-components/SKILL.md` (or a repo-specific `.github/instructions/design-system.instructions.md`) that documents the org's actual internal component library and conventions, so Copilot generates UI matching the company's real design system, fully locally. This is not just a safe substitute — it's plausibly a better one for this audience.

### Tavily (Medium risk) — **no local substitute exists; drop from default, don't bundle a replacement**

Unlike the other two, this one is a genuine capability trade-off, not a free substitution. "Search the live web" is, by definition, a request that must leave the local network to reach some external index — there is no handwritten or local tool that replicates it. Two honest options:

1. **Drop the capability entirely from the default profile.** `/sc:research` and DeepResearch mode become unavailable out of the box. Nothing else in the plugin depends on live web search — rules, personas, the 25 other commands, Business Panel, and the Memory MCP server are all unaffected — so this is a clean, contained capability loss, not a partial compromise elsewhere.
2. **If a team genuinely needs it**, they should route through whatever web-search integration their own security team has already vetted for the org (which may already exist under a different vendor relationship) rather than the plugin bundling a new, unreviewed one by default.

Recommendation: **ship without Tavily by default; document the research commands as "requires separately-approved web-search infrastructure" rather than pretending a safe substitute exists.** This is the one place where "safety over efficiency" has a real, visible cost — say so plainly instead of glossing over it.

### Language Bias Audit of the Remaining (Non-Dropped) MCP Servers

The Morphllm fix raised the right follow-up question: does the same JS/TS-centric bias hide anywhere else? Checked every remaining server:

- **Context7** — every source found leads with JS/web examples (Next.js, React, MongoDB, Supabase), and none explicitly confirms it indexes non-JS ecosystems (PyPI, Maven, Cargo, NuGet) with equal depth. It's built by crawling library documentation generally, not scoped to npm specifically, so it's *likely* fine — but "likely" isn't "confirmed." Recommend a one-time spot-check with a Python, Go, or Java library before treating it as a safe default for non-JS teams; if coverage turns out thin outside JS, keep it enabled but set expectations accordingly rather than assume parity.
- **Sequential-thinking** — confirmed no bias. A pure reasoning-structuring scaffold with no code or language dependency at all.
- **Playwright** — not a language bias but a real domain-scope bias worth naming explicitly: it's inherently a browser/web-UI automation tool. For a backend-only Go service, a C++ embedded project, or a native mobile app, Playwright is simply irrelevant — testing should fall back to the language's native framework (JUnit, pytest, `go test`, xUnit), the same pattern as the bulk-refactor fix. No skill or persona in this plugin (`/sc:test`, quality-engineer) should imply Playwright is the universal testing answer; it's the answer only when the target actually has a browser-rendered UI.
- **Serena's replacement** (native Copilot workspace-symbol tools, §4) — a real, newly-confirmed nuance: Copilot CLI's find-references/rename/workspace-symbol operations depend on a language server (LSP) being available, and coverage is uneven — mature for long-established languages, but e.g. C++ LSP support only reached public preview in April 2026. §4 originally read as "already covered, don't rebuild" without this caveat; it degrades gracefully to text search rather than failing outright, but fidelity isn't uniform across languages.
- **Magic (21st.dev)** — re-confirms the original drop decision. Every source found describes it as generating **React** components specifically; nothing confirms Vue/Svelte/Angular support, let alone non-JS UI frameworks (Flutter, SwiftUI, Jetpack Compose, WPF/MAUI). Its replacement — the `ui-components` skill — needs to actually describe *that org's real* framework rather than quietly defaulting to assuming React itself; this should be stated explicitly in the skill's own instructions, not left implicit.

### Net effect on the corporate default profile

Default-on: Sequential-thinking, Playwright + chrome-devtools (both internal-scoped), Custom Memory MCP server, Context7 (already Low risk, unaffected by this investigation).
Dropped and replaced with local/native equivalents: Morphllm, Magic — no meaningful capability loss.
Dropped with a real, documented capability loss: Tavily (and by extension, live-web-search-dependent commands) — acceptable given the explicit instruction to weight safety over efficiency, but not free, and not something to understate.

---

## 5d. Persona Language/Framework Bias Audit

Checked against the actual local source files (`~/.claude/agents/*.md`) that are the real port source, not assumed from role names.

| Persona | Verdict | Evidence / fix |
|---|---|---|
| **frontend-architect** | **Biased — confirmed** | Its Focus Areas explicitly list "Modern Frameworks: React, Vue, Angular." Same category of bias as Magic (§5c), baked into the persona text itself, with no native-mobile (Swift/Kotlin) or desktop UI paradigm mentioned. Fix: when porting to `frontend-architect.agent.md`, generalize that line to defer to the project's actual UI stack — pull specifics from the `ui-components` skill/design-system instructions (§5c) rather than hardcoding React/Vue/Angular in the persona itself. |
| backend-architect, system-architect, refactoring-expert, quality-engineer | Clean | Verified directly — genuinely language/framework-agnostic. quality-engineer explicitly calls for "framework selection" rather than hardcoding a test tool, which already avoids the Playwright-universality trap flagged in §5c. |
| performance-engineer | Mostly clean | Only "Core Web Vitals" ties one of its two focus areas (Frontend Performance) to the web specifically; "Backend Performance" is already generic. Optional polish, not a real gap: could broaden the example to "platform-appropriate performance metrics (Core Web Vitals for web, p99 latency for services, frame time for native apps)." |
| devops-architect | Clean (tool names, not language bias) | Named tools (Kubernetes, Docker, Terraform, Prometheus, Grafana, ELK) are already the de facto cross-industry standard for this domain, not a JS/TS-style bias. Optional: soften to "...or your org's equivalent" for orgs on Pulumi/Ansible/cloud-native-specific tooling. |
| **security-engineer** | Clean content, but a real porting bug | The persona text itself contains: *"This agent persona is activated when Claude Code users type `@agent-security` patterns..."* — a Claude Code-specific invocation convention that is factually wrong once ported to a Copilot `.agent.md` file (no `@agent-security` chat syntax exists there). Must be rewritten, not copied verbatim, during the port. |
| python-expert | Correctly, intentionally scoped — not a bug, but an asymmetry worth deciding on | SuperClaude's original persona set has exactly one language-specific "expert" (Python), none for Java/Go/C#/Rust/etc. For a real multi-language corporate deployment: either accept the asymmetry (generic backend-architect/system-architect cover other languages at the architecture level, just without the same depth), drop the Python-specific depth for a uniform persona set, or add equivalent experts for the org's other primary languages. A decision to make explicitly, not silently resolve. |
| **claude-code-guide** | **Not a real port candidate** | No corresponding local persona file exists (unlike the other 17). It's a built-in Claude Code product-support agent describing Claude Code itself — porting it would produce a Copilot agent that teaches users incorrect things about a different product. Drop from the persona list entirely; §2's count corrected to 17. |
| **socratic-mentor** | **Verified (Revision 5) — real cross-reference bug, not a language bias** | Its own source references commands that don't exist anywhere in the 26-command set (`/sc:socratic-clean-code`, `/sc:socratic-patterns`) and personas that don't exist in the real 17-file set (`analyzer`, `mentor`, `scribe`, `qa`) — the identical cross-reference-mismatch pattern §5e documents for commands, just not previously logged for this persona. Fix: same canonical-mapping treatment as §5f — replace with real persona names (`root-cause-analyst`, `learning-guide`, `technical-writer`, `quality-engineer`), and drop the two nonexistent-command references entirely rather than port them. |
| **pm-agent** | **Verified (Revision 5) — this is the actual source of the Japanese-trigger bias, not `pm.md`** | §5e's cross-cutting finding #3 originally attributed the hardcoded Japanese trigger phrases ("どこまで進んでた", "作りたい," the PDCA templates) to the `pm.md` *command*. Checking the persona source directly: `pm-agent.md` carries the identical phrases at its origin, and `pm.md` simply inherited them by describing the same behavior. Fix belongs on `pm-agent.agent.md` primarily — translate to English trigger phrases there, and `pm.md` inherits the fix by referencing the corrected persona rather than needing a separate translation pass. |
| technical-writer, requirements-analyst, root-cause-analyst, learning-guide, deep-research-agent, business-panel-experts | Not individually verified line-by-line here | Structurally low-risk — none touch code generation or language-specific tooling directly (writing, requirements-gathering, investigation methodology, teaching, research, business strategy). Spot-check during Phase 1 rather than assume. |

---

## 5e. Skill/Command Language Bias Audit

Checked against the actual local command source files (`~/.claude/commands/sc/*.md`) — all 26 read directly, not sampled (the original inventory undercounted these by one; see Revision 5 in §2).

| Command | Verdict | Evidence / fix |
|---|---|---|
| **implement.md** | **Severely biased — the worst instance found in this whole audit** | Its own `Usage` syntax hardcodes `--framework react|vue|express` as a closed enum — not prose, the actual flag definition. `MCP Integration` names "Context7 MCP: Framework patterns... for React, Vue, Angular, Express" — no other ecosystem mentioned anywhere. Magic MCP (already dropped, §5c) is wired in by default. Every example is JS-ecosystem (React component, Vue widget). Fix: replace the fixed enum with stack auto-detection from repo manifest files (`package.json`→Node, `requirements.txt`/`pyproject.toml`→Python, `pom.xml`/`build.gradle`→Java, `*.csproj`→.NET, `go.mod`→Go, `Cargo.toml`→Rust), and generalize the Context7 wiring language to "framework-appropriate patterns for the detected stack" rather than a fixed language list. |
| **build.md**, **test.md** | **Confirmed bug, not just a risk** | Frontmatter hardcodes `mcp-servers: [playwright]` as a blanket dependency for *every* build and *every* test run — even though most builds and most test types (unit/integration for non-web languages) have nothing to do with a browser. This is the §5c "Playwright isn't universal" concern, now found as an actual bug in the command definitions themselves rather than a hypothetical. Fix: make Playwright wiring conditional on the target actually being browser-testable (e.g. only for `--type e2e` in test.md, which the body text already scopes correctly — only the frontmatter declaration is the problem), not a standing per-command dependency. |
| cleanup.md, improve.md | Clean | Generic wiring (`context7`, `sequential`, architect/quality/security/performance personas), no framework enum, no hardcoded language assumptions. |
| document.md | Mostly clean | Explicitly generalizes to "language-specific documentation patterns and conventions" and pairs "JSDoc/docstring" together in the same breath (acknowledging both JS and Python conventions) — better language-awareness than expected. Only the one worked example (`.js` file, JSDoc) is JS-flavored, which is cosmetic, not structural. |
| **brainstorm.md, task.md, workflow.md** (and pm.md, see below) | **Confirmed bug — the same root cause as build.md/test.md, but worse** | All three hardcode `mcp-servers: [sequential, context7, magic, playwright, morphllm, serena]` in frontmatter — wiring in **both dropped tools (Magic, Morphllm) by default**, not just Playwright. This isn't random: all three share `category: orchestration`, and that category appears to have been designed to defensively list every possible tool rather than scope to what's actually needed — directly opposite to the least-privilege principle in §5b. Fix: strip `magic` and `morphllm` from all four orchestration-category files; make `tavily`/`playwright` conditional on the actual task, never a blanket default. |
| **select-tool.md** | **Structurally broken by the Morphllm drop, not just biased** | This command's entire purpose is choosing between exactly two tools: "Serena (semantic operations) vs Morphllm (pattern operations)," with a whole decision matrix, complexity thresholds, and worked examples built around that binary choice. With Morphllm dropped (§5c), half of this command's reason for existing is gone. Needs a real rewrite — not a find-and-replace — routing instead between the Memory MCP server/native symbol tools and the new `bulk-refactor` skill, with new thresholds and examples. |
| research.md | Working as designed, no fix needed | Correctly and exclusively depends on Tavily ("Primary search and extraction engine") — this is precisely the command §5c already planned to gate behind opt-in registration; confirms the plan rather than adding a new finding. |
| help.md | Needs a content fix (not a bias) | Documents `--magic` and `--morph`/`--morphllm` as available MCP flags in its reference table. Since those tools are dropped, this would actively mislead users post-port. Fix: remove those flag rows, or annotate them "not available in the corporate profile," when porting. |
| analyze.md, cleanup.md, design.md, git.md, improve.md, save.md, spawn.md, spec-panel.md, troubleshoot.md, load.md, reflect.md | Clean | Generic, appropriately scoped wiring; no framework hardcoding, no blanket-dependency pattern. explain.md and index.md are likewise clean on the bias front (their persona-name issues are covered below, not a language bias). |

**Cross-cutting findings, beyond individual commands:**

1. **The source material isn't internally consistent about persona names, and it's worse than first spotted.** build.md references `devops-engineer` (real file: `devops-architect`); test.md references `qa-specialist` (real file: `quality-engineer`); estimate.md, brainstorm.md, task.md, and workflow.md all reference `project-manager` (no matching file exists at all — the closest real thing is `pm-agent`, which is a different persona with a different role); index.md and business-panel.md reference `scribe` (no matching file exists); explain.md references `educator` (no matching file — closest are `learning-guide`/`socratic-mentor`). Worse: **`brainstorm.md`, `task.md`, and `workflow.md` all carry the exact same verbatim persona list** — `[architect, analyzer, frontend, backend, security, devops, project-manager]` — where `analyzer` and `project-manager` don't exist as files at all, and the other five are abbreviated forms that don't match the real filenames (`system-architect`, `frontend-architect`, `backend-architect`, `security-engineer`, `devops-architect`). This is clearly copy-pasted boilerplate that was never reconciled with the actual 17-persona roster, not five independent typos. Before porting, build one canonical name-mapping table so every skill's persona reference actually points to a real `.agent.md` filename.
2. **The Claude Code-specific invocation artifact found in security-engineer.md (§5d) is systemic, not isolated** — implement.md and brainstorm.md both contain the same boilerplate (e.g. *"This behavioral instruction activates when Claude Code users type `/sc:implement` patterns"*). Since it shows up across personas and commands from unrelated categories, treat this as a pattern to scrub programmatically across all 17 personas and 26 commands during the port, not something to fix ad hoc wherever it happens to be spotted.
3. **pm.md deserves its own callout — it's the largest and most consequential file in the whole set.** Its frontmatter wires `mcp-servers: [sequential, context7, magic, playwright, morphllm, serena, tavily, chrome-devtools]` — every tool discussed in this audit, including all three dropped ones, Tavily, and an 8th server (`chrome-devtools`) that was never in the original 7-server inventory (§2) at all. `chrome-devtools` is now classified in §5b (Low risk, on by default alongside Playwright — Revision 5 made this consistent across the document) so that part is resolved. Since pm.md describes itself as "the DEFAULT operating foundation that runs automatically at every session start," this remains the single highest-priority file to fix for the MCP wiring alone — left as-is, it would silently reintroduce every dropped tool as part of the plugin's default, always-on behavior. It also has a distinct bias worth naming separately: its auto-activation trigger phrases and document templates are written in **Japanese** (e.g. "どこまで進んでた", "作りたい", the entire PDCA template set) — a natural-language bias, not a programming-language one, but the same category of problem: those triggers simply never fire for a non-Japanese-speaking user base. **Revision 5 traced this to its actual origin**: the phrases live in `pm-agent.md` (the persona), not `pm.md` (the command that just describes the persona's behavior) — see §5d. Fix the persona source; the command inherits the fix.

---

## 5f. Consolidated Fix Specifications (design-level — nothing built yet)

Turns §5d/§5e's findings into concrete, validate-before-building specs. **No implementation exists for any of this** — these are targets for Phase 1, written down now so the design can be reviewed as a whole before any file gets created.

### Canonical persona name mapping
Every broken reference found in §5e, resolved to a real persona file (or explicitly dropped if nothing corresponds):

| Broken reference | Resolves to | Found in |
|---|---|---|
| `devops-engineer` | `devops-architect` | build.md |
| `qa-specialist` | `quality-engineer` | test.md |
| `project-manager` | `pm-agent` (or omit if the task doesn't need cross-session PM-style continuity) | estimate.md, brainstorm.md, task.md, workflow.md |
| `scribe` | `technical-writer` | index.md, business-panel.md |
| `educator` | `learning-guide` (or `socratic-mentor` specifically for discovery-style teaching) | explain.md |
| `analyzer` | `root-cause-analyst` (investigation/bug contexts) or `requirements-analyst` (discovery contexts) | brainstorm.md, task.md, workflow.md |
| generic `architect`/`frontend`/`backend`/`security`/`devops` | `system-architect`/`frontend-architect`/`backend-architect`/`security-engineer`/`devops-architect` | brainstorm.md, task.md, workflow.md |
| `analyzer`, `mentor`, `scribe`, `qa` (found in §5d, not §5e) | `root-cause-analyst`, `learning-guide`, `technical-writer`, `quality-engineer` respectively | socratic-mentor.md (persona, referencing other personas) |

`socratic-mentor.md` additionally references two commands that don't exist in the 26-command set (`/sc:socratic-clean-code`, `/sc:socratic-patterns`) — drop these references entirely rather than map them to anything, since no equivalent command is planned.

### brainstorm.md / task.md / workflow.md — corrected spec
- **MCP wiring**: drop `magic` and `morphllm` entirely, no exceptions. Keep `sequential` + `context7` as the baseline. `playwright` only when the task is actually browser/UI-related, not a blanket default. The Memory MCP server only when the task genuinely needs cross-session persistence.
- **Personas**: replace the shared boilerplate list with a selection drawn from the canonical mapping above, chosen per actual task content rather than copy-pasted verbatim across all three files.

### pm-agent.md (persona) / pm.md (command) — corrected spec
- **Fix the persona, not the command**: the Japanese trigger phrases and the MCP wiring both originate in `pm-agent.md`; `pm.md` just describes that persona's behavior for the command surface. Fixing `pm-agent.agent.md` and having `pm.md` reference it is sufficient — don't do the translation/wiring pass twice.
- **MCP wiring**: `sequential` + `context7` + the Memory MCP server as baseline. `playwright`/`chrome-devtools` only for browser-UI tasks (both are in the default profile per §5b Revision 5, but that doesn't mean every task should invoke them — still conditional on the task). `tavily` only if a team has separately opted into research. Never `magic`/`morphllm` — full stop.
- **Trigger phrases**: replace the Japanese-only set with English equivalents ("where did we leave off," "what's the status," "I want to build...," "how should we...") and note that teams should add their own working-language equivalents rather than assume this covers every user base.
- **Reflection tool calls**: per §6 Tier B's decision, `pm-agent.md`'s references to Serena's `think_about_*` tools should become plain inline reasoning steps ("check whether the stated success criteria are met") rather than calls to tools the Memory MCP server doesn't implement.

### select-tool.md — corrected decision-matrix spec
| Operation type | Routes to |
|---|---|
| Symbol rename, find-references, cross-file dependency tracking | Native Copilot workspace-symbol tools |
| Cross-session project state, checkpoints | Memory MCP server |
| Structural bulk pattern transforms | `bulk-refactor` skill (ast-grep-based) |
| Style/lint enforcement | `bulk-refactor` skill, dispatching to the repo's own configured formatter |
| Ad hoc, one-off edits | Copilot's native multi-file edit tool |

This replaces the original's binary Serena-vs-Morphllm matrix — a genuine rewrite, not a find-and-replace, per §5e.

### help.md — corrected content spec
Remove the `--magic` and `--morph`/`--morphllm` flag rows entirely (not just annotate — they refer to tools that no longer exist in this plugin). Add a line stating the actual default corporate MCP profile (Context7, Sequential-thinking, Playwright + chrome-devtools, the Memory MCP server) and that Morphllm/Magic are dropped, Tavily is opt-in-only.

### reflect.md / save.md — corrected spec
Both currently call Serena-specific tools (`think_about_task_adherence`, `think_about_collected_information`, `think_about_whether_you_are_done`, `summarize_changes`) that the Memory MCP server does not implement and, per §6 Tier B's decision, never will — adding them would turn a small auditable state-storage service into something that reasons about task state. Fix: rewrite both skills so that reflection is plain inline reasoning within the skill's own instructions (e.g. "check whether the stated goal is met," "summarize what changed this session"), reading/writing only the four real memory primitives (`write_memory`/`read_memory`/`list_memories`/`delete_memory`). Functionally equivalent for the user; keeps Tier B's tool surface minimal.

### New skills already specified, not yet built
`bulk-refactor` and `ui-components` (§5c) — their required behavior (language auto-detection before tool choice; explicit framework naming, never assuming React) is fully specified in §5c and should be treated as the acceptance criteria when they're eventually built.

---

## 6. Proposed Architecture

### Tier A — "Core" (config-only, no code, works identically on CLI + VS Code + JetBrains)

```
.github/
  copilot-instructions.md          # condensed RULES.md + PRINCIPLES.md
  instructions/
    <stack>.instructions.md        # ported project-specific rule packs, applyTo-scoped
  skills/
    analyze/SKILL.md               # 1 folder per /sc:* command (26 total) — logic layer, all 3 surfaces
    implement/SKILL.md
    design/SKILL.md
    deep-research/SKILL.md         # RESEARCH_CONFIG.md policy content; live search gated behind opt-in MCP (§5c)
    bulk-refactor/SKILL.md         # Morphllm replacement — language-agnostic: detects repo language, uses ast-grep for structural transforms, dispatches to the repo's own configured formatter/linter for style fixes (not hardcoded to ESLint)
    ui-components/SKILL.md         # Magic replacement — must name the org's ACTUAL UI framework explicitly (React/Vue/Angular/Flutter/SwiftUI/etc.), not assume React by default (§5c)
    ...
  prompts/
    analyze.prompt.md              # 1:1 mirror per skill — guarantees explicit /name on VS Code + JetBrains
    implement.prompt.md
    ...                            # generated from the same authored source as skills/, not hand-duplicated
  agents/
    security-engineer.agent.md     # 1 file per specialist persona (17 total)
    backend-architect.agent.md
    brainstorming.agent.md         # behavioral modes as agents (7 total)
    introspection.agent.md
    business-panel-orchestrator.agent.md   # tools: [agent, ...], agents: [<9 expert names>]
    experts/
      christensen.agent.md         # user-invocable: false — delegate-only, hidden from manual picker
      porter.agent.md
      ...                          # 9 total
  hooks/
    post-implementation.json       # pm-agent-style capture; block/allow/log only (JetBrains-safe subset)
    # No hook enforcing the Magic/Morphllm/Tavily drop (Revision 7) — dropped for simplicity.
    # Nothing in this plugin's ported skills/agents calls them once §5f's fixes are applied,
    # so a deny-hook would just be a no-op safety net for a mistake caught during porting,
    # not something currently in use. Rely on code review during the port instead.
.copilot/
  mcp-config.json                  # CLI's format (key: mcpServers) — default profile: context7, sequential-thinking, playwright, chrome-devtools, memory
.vscode/
  mcp.json                         # VS Code's format (key: servers) — same default profile, repo-committed
                                    # also read directly by JetBrains (Revision 8) — no separate file needed
docs/
  optional-mcp-profile.md          # Tavily (and any Morphllm/Magic equivalent) documented as separately-governed opt-in, not shipped by default
```

A single generator script (Tier A tooling, not a runtime dependency) owns the mapping from one authored command definition to its `SKILL.md` + `.prompt.md` pair, and from one MCP server list to its three config artifacts — avoiding hand-maintained duplication across surfaces.

### Tier B — "Memory MCP Server" (real code, cross-platform by construction)

A small Node (or Python) process, MCP stdio transport, registered in both MCP config artifacts (`.copilot/mcp-config.json` for CLI; `.vscode/mcp.json` for both VS Code and JetBrains, per Revision 8):

- Implements `write_memory`, `read_memory`, `list_memories`, `delete_memory`, backed by a per-workspace JSON or SQLite store (e.g. `.copilot-memory/` at repo root, gitignored).
- Direct Serena replacement; the only "real engineering" piece in the whole project.
- Optionally exposes a `context_budget_estimate` tool as a clearly-labeled-experimental stand-in for resource-zone thresholds — not presented as equivalent to Claude Code's actual context accounting.

**Decided (Revision 5)**: this server's tool surface stays exactly these four memory-CRUD operations — it does **not** grow `think_about_task_adherence`, `think_about_collected_information`, `think_about_whether_you_are_done`, or `summarize_changes`, even though the audited `reflect.md`/`save.md` source called those Serena-specific reflection tools directly. Adding them would turn a small, auditable state-storage service into something that has to reason about task state, which is scope creep for a component whose whole value is being minimal and easy to fully review (§5b). Instead, `/reflect` and `/save` are specified (§5f) to perform that reflection as **plain LLM reasoning within the skill's own instructions** — "check whether the stated goal is met," "summarize what changed this session" — reading from and writing to the four memory primitives, rather than calling a dedicated tool for it. Functionally equivalent for the user; keeps Tier B's surface small enough to audit in one sitting.

No VS-Code-only extension in the core plan — everything above works identically on CLI, VS Code, and JetBrains.

---

## 7. Phased Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 — Setup | Pick final name (§9); init repo; build the skill→(SKILL.md + prompt.md) and MCP-list→(three configs) generator tooling; pin down exact JetBrains MCP filename/key | Generator produces valid artifacts for a trivial test skill and test MCP server, confirmed loadable in all three surfaces |
| 1 — MVP | Port `RULES.md`/`PRINCIPLES.md` → `copilot-instructions.md`; port 8 highest-value `/sc:*` commands (skill + prompt-file pair each — exact list per §9.4, still an open decision, not fixed here); port 6 personas → agents; wire the **default corporate-safe MCP profile only** — context7 + sequential-thinking + playwright + chrome-devtools + the Memory MCP server (§5b/§5c) — no Tavily/Morphllm/Magic | Same repo installed and exercised in Copilot CLI, VS Code, and JetBrains — commands invoke via explicit `/name` in all three, personas/MCP servers behave consistently, and the shipped config never touches an unreviewed third-party server |
| 2 — Full parity | Remaining 18 commands (26 total − 8 in Phase 1); remaining 11 personas (17 total − 6 in Phase 1); all 7 behavioral modes; Business Panel orchestrator + 9 expert subagents (`user-invocable: false`); hooks for pm-agent capture; the `bulk-refactor` and `ui-components` skills (§5c) that replace Morphllm/Magic; `deep-research` skill shipped with policy content only, live search left unregistered by default | Feature-for-feature coverage of every Tier A/B row in §4, verified on all three surfaces, including a live Business Panel run exercising real subagent delegation, and confirmation that no default-installed skill silently depends on an excluded MCP server |
| 3 — Memory MCP server | Implement + ship; register in all three MCP configs | Cross-session memory demonstrably persists after closing/reopening in CLI, VS Code, and JetBrains independently |
| 4 — Polish (Revision 8: no publishing — personal-use-only project) | Docs stay accurate as things change; no `awesome-copilot` submission, no public distribution prep | README/TESTING.md reflect actual current state |

---

## 8. Validation Strategy

- Tier A: no unit tests possible (it's markdown) — validate by installing into a real repo and exercising every skill/prompt/agent/hook in all three surfaces side by side. Priority smoke tests: (a) explicit `/name` invocation works identically in CLI/VS Code/JetBrains, (b) the Business Panel orchestrator genuinely delegates to expert subagents rather than one model narrating all nine in-line, (c) hooks behave correctly within the JetBrains block/allow/log subset.
- Tier B (Memory MCP server): standard unit tests (read/write/list/delete, concurrent-write safety) plus a per-surface integration test — kill and restart Copilot CLI, VS Code, and JetBrains independently, confirm memory survives identically in each.
- **Tier B network isolation (Revision 6 — closes a gap found in the corporate-safety review)**: §5b states "zero outbound network calls" as a hard requirement for the Memory MCP server but, until now, only committed to a manual code review, with no actual test gating it. Add: (a) a static check that the server's dependency tree contains no HTTP client library, (b) an integration test that runs the server with outbound network access blocked (e.g. a firewalled test environment or a mock DNS that fails all lookups) and confirms all four operations still succeed. This is what turns "code-reviewed once" into "verified on every change," which matters most for exactly this component since it's the one thing here that isn't already-audited vendor code.

---

## 9. Open Decisions

1. **Naming**: still just the provisional `copilot-superclaude` (package.json/README). Lower stakes now (Revision 8: personal-use-only, not published), so left as-is rather than forced.
2. **Distribution model for Tier A**: **N/A (Revision 8)** — no template repo, scaffolder, or awesome-copilot listing; this is a personal-use project, not distributed.
3. **License**: **N/A (Revision 8)** — personal-use-only, no LICENSE file needed or added.
4. **Exact JetBrains MCP config filename/key** — **resolved (Revision 8)**. Per documentation research: the JetBrains Copilot plugin reads project-level MCP config from the same `.vscode/mcp.json` path/format VS Code uses (a global fallback also exists at `~/.config/github-copilot/intellij/mcp.json` for non-project config, not relevant here). High confidence from documentation; not yet hands-on confirmed in a real JetBrains IDE — see `TESTING.md`. The generator no longer produces a separate speculative JetBrains artifact.
5. **Copilot CLI `${workspaceFolder}` support** — **resolved (Revision 8)**. Confirmed via documentation that Copilot CLI's `mcp-config.json` supports `${workspaceFolder}` path substitution; the Memory MCP server's registered path should work as already written. Not yet hands-on confirmed — see `TESTING.md`.
6. **Scope of personas/commands for MVP** — resolved by §10 below into a concrete list, chosen so Phase 1 exercises both known persona fixes (frontend-architect, security-engineer) rather than only the clean ones. Still worth confirming against real usage patterns before locking it in permanently.

---

## 10. Detailed Implementation Plan (Phase 0 & Phase 1)

Expands §7's roadmap into an ordered, checkable task list for the two phases that start immediately. Phases 2–4 stay at §7's level of detail — planning them further now, before Phase 0/1 exist, would be guessing ahead of real feedback.

### Phase 0 — Setup & Generator Tooling

1. **Decide the name** (§9.1) — blocks repo creation. Pick from the suggested alternatives or a new one; confirm it's not already taken on GitHub/npm before committing.
2. **Init the repo** — empty except a README stating the two-tier architecture (§6) and the corporate-safety posture (§5b) up front, so anyone landing on the repo understands the scope before reading further.
3. **Author the two source formats the generator will consume** — not the generated output itself, the input format one level up:
   - One structured source file per command (e.g. `sources/commands/<name>.md`: frontmatter with `name`/`description`, plus body) that the generator turns into both `.github/skills/<name>/SKILL.md` and `.github/prompts/<name>.prompt.md`. Single-authored, two outputs — the whole point of §6's "not maintained twice by hand."
   - One structured source file for the MCP server list (e.g. `sources/mcp-servers.yaml`: server name, command, args, env) that the generator turns into `.copilot/mcp-config.json` (`mcpServers` key), `.vscode/mcp.json` (`servers` key), and the JetBrains equivalent.
4. **Write the generator script** (Node or Python, whichever the eventual contributors are more comfortable maintaining — no strong reason to prefer one here). Two subcommands: `generate:skills` and `generate:mcp-configs`.
5. **Resolve the JetBrains MCP filename/key** (§5, §9.3) — the one remaining real unknown. Concretely: install GitHub Copilot in a real JetBrains IDE, register a trivial test MCP server through Settings → Tools → GitHub Copilot → MCP, and inspect what file it actually writes and where. This is a 30-minute hands-on check, not a research task — do it before writing the generator's JetBrains output logic, not after.
6. **Prove the generator end-to-end** with one trivial test skill (e.g. "echo") and one test MCP server (e.g. a no-op stdio server that just responds to a ping). Load the generated artifacts in Copilot CLI, VS Code, and JetBrains and confirm all three see the skill and the server.

**Phase 0 exit criteria** (unchanged from §7): generator produces valid artifacts for the trivial test case, confirmed loadable in all three surfaces.

### Phase 1 — MVP

**Resolving open decision §9.4 concretely**: 8 commands, 6 personas, chosen so the set exercises both persona fixes found in the audit (frontend-architect's framework bias, security-engineer's Claude Code invocation-note bug) rather than only the already-clean ones — a Phase 1 that only ports clean files wouldn't actually prove the fixes work.

**Commands (8)**: `analyze`, `implement`, `design`, `test`, `troubleshoot`, `git`, `cleanup`, `improve`. None of these depend on the Memory MCP server (Tier B, not built until Phase 3), so Phase 1 doesn't need to stub it out. `implement` specifically validates the stack-auto-detection fix (§5f) — the single most important fix in the whole audit — so it must be in the MVP, not deferred.

**Personas (6)**: `system-architect`, `backend-architect`, `frontend-architect`, `security-engineer`, `quality-engineer`, `refactoring-expert`. Covers every MVP command's needs and both audit-fixed personas.

Ordered tasks:
1. Write `.github/copilot-instructions.md` from the condensed RULES.md/PRINCIPLES.md content already drafted in earlier revisions of this design.
2. Author the 8 commands as source files (per Phase 0's format), applying §5f's fixes as they're written — not as a later pass. In particular: `implement`'s stack-detection table, not a `--framework` enum; `test`'s Playwright-only-for-`--type e2e` scoping.
3. Run the generator to produce the 8 skill+prompt pairs.
4. Author the 6 persona agent files, applying §5d's fixes as written: `frontend-architect` deferring to the project's actual stack, `security-engineer` with the Claude Code-specific note removed.
5. Author `sources/mcp-servers.yaml` for exactly the default corporate profile: Context7, Sequential-thinking, Playwright, chrome-devtools. (Memory MCP server isn't in this list yet — Phase 3.)
6. Run the generator to produce the three MCP config artifacts.
7. Install the resulting `.github/` + `.vscode/` + `.copilot/` into a real test repo (pick one with an actual non-trivial stack — not a toy — so `implement`'s auto-detection has something real to detect).
8. Smoke-test in Copilot CLI: invoke all 8 commands via explicit `/name`, confirm each activates its expected persona(s).
9. Repeat step 8 in VS Code, then in JetBrains — this is the point of the exercise: confirming consistent behavior across all three, not just one.
10. Confirm via each surface's MCP inspection UI (or the generated config files directly) that Magic, Morphllm, and Tavily are absent — not just unused, actually not registered anywhere.

**Phase 1 exit criteria** (unchanged from §7): same repo installed and exercised in all three surfaces, commands invoke via explicit `/name` in all three, personas/MCP servers behave consistently, shipped config never touches an unreviewed third-party server.
