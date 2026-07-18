# Manual Test Checklist — Full Plugin

Corresponds to `DESIGN.md` §7/§8/§10. Do this in a real test repo, not this design repo itself. Pick a real, non-trivial repo — `implement`'s auto-detection needs real manifest files to detect.

## 1. Install

Copy these into the test repo's root:
```
.github/copilot-instructions.md
.github/agents/            (22 files + 9 in agents/experts/)
.github/skills/             (29 folders)
.github/prompts/             (26 files)
.github/hooks/post-implementation.json
.vscode/mcp.json
.copilot/mcp-config.json
memory-mcp-server/           (the whole directory — the server needs to actually run from somewhere)
```
Then `cd memory-mcp-server && npm install` in the test repo (or point the MCP config's path at wherever you keep it).

No separate JetBrains file to worry about — per research (DESIGN.md §9.4, Revision 8), JetBrains reads the same `.vscode/mcp.json` you just copied. That's a documentation-based conclusion, not yet hands-on confirmed — §4 below is where you check it actually holds.

## 2. VS Code

- [ ] Open the test repo in VS Code with GitHub Copilot Chat installed.
- [ ] Type `/` in the chat input — confirm all 26 commands appear as invocable.
- [ ] Invoke `/implement "a small feature"` — confirm it detects the repo's actual stack rather than defaulting to React/JS.
- [ ] Open the agent picker — confirm all 16 standalone personas + the `business-panel-orchestrator` appear. Confirm the 9 experts under `experts/` do **not** appear in the manual picker (they're `user-invocable: false` — delegate-only).
- [ ] Invoke `/business-panel` on some sample content — confirm the orchestrator genuinely delegates to expert subagents (check for real separate agent invocations, not one response narrating all 9 voices).
- [ ] Check the MCP server list — confirm exactly `context7`, `sequential-thinking`, `playwright`, `chrome-devtools`, `memory` are registered. Confirm the `memory` server actually starts (no crash) — if it fails to launch, check whether `${workspaceFolder}` resolved correctly in `.vscode/mcp.json`.
- [ ] Invoke `/save` then `/load` in a fresh session — confirm context actually persists (this is the real point of Tier B).
- [ ] Invoke `/test --type e2e` on something with no browser UI — confirm it doesn't blindly try to launch Playwright against nothing.
- [ ] Confirm Magic, Morphllm, Tavily are **not** registered anywhere.

## 3. Copilot CLI

- [ ] Same command/persona checks as VS Code, via explicit `/name` invocation (native on CLI, no prompt-file mirror needed).
- [ ] Confirm `.copilot/mcp-config.json`'s `memory` server entry actually launches — research says `${workspaceFolder}` substitution is supported here, but confirm it resolves correctly in practice. If it doesn't start, replace the path with an absolute one and note that in `sources/mcp-servers.json` for regeneration.

## 4. JetBrains

Same functional checklist as VS Code/CLI. The one thing specifically worth double-checking here:

- [ ] Confirm the MCP servers from `.vscode/mcp.json` actually show up and load in JetBrains without any separate config file — this is the research conclusion from DESIGN.md §9.4 that hasn't been hands-on confirmed yet. If they *don't* load, check Settings → Tools → GitHub Copilot → MCP for a "Configure" option pointing at a different file (e.g. the global `~/.config/github-copilot/intellij/mcp.json`), and report back what you find.
- [ ] Register the `post-implementation.json` hook if JetBrains' hook UI requires separate registration — confirm the `agentStop` event actually fires (JetBrains hooks were "preview" as of this design's research; behavior may differ from what's written).

## 5. What to report back

Per surface: pass/fail per checkbox, plus specifically:
- Did `/implement` correctly detect the stack?
- Did Business Panel actually delegate to subagents, or narrate all 9 in one response?
- Did the `memory` server launch in CLI (the `${workspaceFolder}` question)?
- Did JetBrains pick up `.vscode/mcp.json` directly, or did it need something else?
