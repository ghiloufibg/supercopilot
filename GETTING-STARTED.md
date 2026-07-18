# Getting Started

A practical, linear guide — install once, then use it in any project. For the *why* behind any of this, see `DESIGN.md`; for a full verification checklist, see `TESTING.md`. This is just "what do I actually do."

## 1. Install

**Prerequisites**: Node.js 18+, and GitHub Copilot itself (CLI and/or the VS Code/JetBrains extension) already set up.

```
git clone <this repo>
cd supercopilot
npm run deploy:global
```

That one command:
- Copies all 26 commands, 17 personas, Business Panel (9 experts), and 7 behavioral modes to `~/.copilot/` — available in every project on this machine from that point on, not just this repo.
- Installs the Memory MCP server as an independent copy at `~/.copilot/mcp-servers/memory-mcp-server/` (its own `node_modules`, not shared with this repo) and registers it.
- Registers the corporate-safe default MCP servers (`context7`, `sequential-thinking`, `playwright`, `chrome-devtools`, `memory`) for Copilot CLI, and for VS Code if it's installed on this machine.
- Patches VS Code's `settings.json` automatically (backed up first) so VS Code picks up the same global agents CLI does.

**Read the output.** It tells you plainly what worked and what didn't — e.g. if VS Code isn't installed here, it says so and prints exactly what to paste in by hand later, rather than silently doing nothing.

**If `npm install` fails** for the Memory MCP server (no registry access), the rest of the install still completes — commands/personas/instructions all still work, just without cross-session memory (`/save`, `/load`, `/reflect` won't function) until you fix registry access and re-run `npm run deploy:global`.

**JetBrains**: nothing extra to do — it reads the same global files as CLI (per research; not yet hands-on confirmed on a real JetBrains install, see `TESTING.md` if something doesn't show up).

## 2. Quick sanity check

Open any real project (not this repo) in Copilot CLI, VS Code, or JetBrains:

```
/help
```

Should list all 26 commands and the current MCP profile. If it doesn't show up at all, the global files didn't get picked up — see `TESTING.md`.

## 3. Day-to-day usage

**Commands** are invoked as `/name` — same syntax everywhere. A few starting points:
```
/implement "add a rate limiter to the API"      # auto-detects your stack, don't specify a framework
/analyze --focus security                        # quality/security/performance/architecture review
/troubleshoot "tests failing after the merge"     # systematic diagnosis
/business-panel @strategy-doc.md --mode debate    # 9 real experts, genuinely delegated, not narrated
```
Run `/help` any time for the full list with descriptions.

**Personas** mostly activate automatically based on what you're doing. To pick one directly, use the agent picker (VS Code/JetBrains) or `--agent <name>` (CLI), e.g. `security-engineer`, `frontend-architect`, `python-expert`. Full list in `README.md`.

**Cross-session memory** — `/save` before closing a session, `/load` to resume. It's shared globally across every project on this machine (not per-project), so context genuinely carries between different repos, not just within one.

**Behavioral modes** (`brainstorming`, `introspection`, `task-management`, `token-efficiency`, `orchestration`) are agents too — switch to one from the picker when you want that *style* of interaction rather than a domain specialist.

## 4. Updating

Made a change to `sources/commands/*.md`, `.github/agents/*.agent.md`, or anything else in this repo?

```
npm run deploy:global
```

Same command, every time — it re-syncs everything from this repo's current state. Safe to run repeatedly.

## 5. Where everything actually lives

| | Location |
|---|---|
| Skills | `~/.copilot/skills/` |
| Agents | `~/.copilot/agents/` |
| Instructions | `~/.copilot/copilot-instructions.md` |
| Memory server (code + deps) | `~/.copilot/mcp-servers/memory-mcp-server/` |
| Memory data | `~/.copilot/memory-data/memory.json` |
| CLI MCP config | `~/.copilot/mcp-config.json` |
| VS Code MCP config | Your VS Code user-data folder's `mcp.json` |
| JetBrains MCP config | `~/.config/github-copilot/intellij/mcp.json` |

Don't hand-edit any of these — edit this repo and re-run `npm run deploy:global`.

## 6. Uninstalling

Delete the paths listed above under `~/.copilot/` (and `~/.config/github-copilot/intellij/mcp.json` for JetBrains), then remove the `chat.agentFilesLocations` entry from VS Code's `settings.json` by hand. This repo itself can be deleted too — nothing already installed depends on it staying in place (see `DESIGN.md` Revision 11).

## Something not working?

`TESTING.md` has the full per-surface checklist and the specific things that are "confirmed by research, not yet hands-on verified" — start there.
