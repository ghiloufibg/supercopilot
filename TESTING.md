# Manual Test Checklist — Full Plugin (Global Deployment)

Corresponds to `DESIGN.md` §7/§8/§10 (Revision 10: global, not per-repo). Everything here is deployed once, globally, and then exercised inside whatever real project repo you happen to be working in — you no longer copy plugin files into each test repo individually.

## 1. Install

```
cd supercopilot
npm run deploy:global
```

This writes:
- `~/.copilot/skills/` (29 skills)
- `~/.copilot/agents/` (31 agent files, flattened)
- `~/.copilot/copilot-instructions.md`
- `~/.copilot/mcp-config.json` (5 servers, `memory`'s path already absolute)
- `~/.config/github-copilot/intellij/mcp.json` (written per documentation — this is one of the two things to verify below)
- VS Code's user-profile `mcp.json`, **only if** VS Code's user-data folder is found on the machine. If it prints "NOT WRITTEN," open VS Code, run "MCP: Add Server" → Global from the Command Palette, and paste in the JSON the script printed.

Then, by hand (the script can't edit VS Code's settings.json for you): open VS Code's Command Palette → "Preferences: Open User Settings (JSON)" and add the `chat.agentFilesLocations` line the script printed at the end of its output — this is what makes VS Code read the same `~/.copilot/agents` folder CLI uses.

Pick a real, non-trivial project repo to test *inside* — something with an actual stack, since `implement`'s auto-detection needs real manifest files to detect. You are **not** copying any plugin files into it; the whole point of this deployment is that it works from any repo without doing that.

## 2. VS Code

- [ ] Open your test project in VS Code with GitHub Copilot Chat installed, having added the `chat.agentFilesLocations` setting above.
- [ ] Type `/` in the chat input — confirm all 26 commands appear as invocable (sourced from `~/.copilot/skills`, not anything in the project repo).
- [ ] Invoke `/implement "a small feature"` — confirm it detects the repo's actual stack rather than defaulting to React/JS.
- [ ] Open the agent picker — confirm all 16 standalone personas + the `business-panel-orchestrator` appear. Confirm the 9 experts do **not** appear in the manual picker (`user-invocable: false` — delegate-only).
- [ ] Invoke `/business-panel` on some sample content — confirm the orchestrator genuinely delegates to expert subagents (real separate agent invocations, not one response narrating all 9 voices).
- [ ] Check the MCP server list — confirm exactly `context7`, `sequential-thinking`, `playwright`, `chrome-devtools`, `memory` are registered globally, visible regardless of which repo is open. Confirm the `memory` server actually starts.
- [ ] Invoke `/save` in one project, close VS Code, reopen a **different** project, invoke `/load` — since the Memory MCP server's store path defaults to `.copilot-memory/` relative to cwd, check whether memory is scoped per-project or shared globally, and whether that matches what you'd expect. (This is a real design question the global deployment surfaces that per-repo testing wouldn't have: should project memory be per-project or global? Report back what you observe.)
- [ ] Confirm Magic, Morphllm, Tavily are **not** registered anywhere.

## 3. Copilot CLI

- [ ] Same command/persona checks as VS Code, via explicit `/name` invocation, run from inside your test project's directory.
- [ ] Confirm `~/.copilot/mcp-config.json`'s `memory` server entry launches correctly using its absolute path.

## 4. JetBrains

Same functional checklist as VS Code/CLI, plus the two things specifically unconfirmed here:

- [ ] Confirm `~/.copilot/agents` and `~/.copilot/skills` are actually picked up (Revision 10's claim that JetBrains shares CLI's global locations via its shared harness — plausible, not yet proven).
- [ ] Confirm `~/.config/github-copilot/intellij/mcp.json` is the file JetBrains actually reads for global MCP servers — if the 5 servers don't show up, check Settings → Tools → GitHub Copilot → MCP for what file it's actually pointing at, and report back.
- [ ] Register the `post-implementation.json` hook if JetBrains' hook UI requires separate registration — confirm the `agentStop` event actually fires (JetBrains hooks were "preview" as of this design's research).

## 5. What to report back

Per surface: pass/fail per checkbox, plus specifically:
- Did `/implement` correctly detect the stack?
- Did Business Panel actually delegate to subagents, or narrate all 9 in one response?
- Is the Memory MCP server's storage per-project or shared globally, and is that the behavior you actually want?
- Did JetBrains pick up the global `~/.copilot/` locations, or does it need something IDE-specific?
- Did VS Code's user-data folder get found automatically, or did you have to configure the MCP config by hand?
