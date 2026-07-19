# Jira / Confluence Read-Only Script Tools — Design

Companion to `DESIGN.md`, describing an **additive, separate capability**: two read-only
REST fetch scripts for Jira and Confluence, installed independently of the main plugin.
Nothing here modifies the SuperClaude port described in `DESIGN.md` — it's parallel
infrastructure with its own install path.

Status: **design only, nothing built yet.**

## 1. Why not MCP servers

The company already runs its own Jira and Confluence MCP servers. Adding a second,
project-local MCP server for the same data would register a second set of tool schemas
that Copilot loads into context on every turn regardless of whether they're used —
pure token overhead for capability that already exists.

The explicit goal here is the opposite: a **token-frugal path** to the same read
operations, invoked as an ordinary subprocess (via Copilot's shell/Bash tool call) only
when actually needed, with no standing tool-schema footprint. This is a deliberate
divergence from this repo's usual pattern (`memory-mcp-server/` is an MCP server because
memory needs real cross-surface state; these two don't need that — they're stateless
GET requests).

Consequence: the "zero outbound network calls" rule that governs `memory-mcp-server/`
(`DESIGN.md` §5b, §6 Tier B) does **not** apply here. These scripts make outbound HTTPS
calls by design, to the company's own Jira/Confluence instance. This is intentional —
flagging it explicitly so a future `grep`/audit doesn't mistake it for a regression of
that rule, which was scoped to the Memory MCP server specifically.

## 2. Repo layout (source of truth)

```
tools/
├── .env.example          # template, placeholder values only, committed
├── lib/
│   └── rest-client.js    # shared: .env loading, PAT header, fetch wrapper, error shape
├── jira/
│   ├── jira-fetch.js
│   └── test/
│       └── jira-fetch.test.js
└── confluence/
    ├── confluence-fetch.js
    └── test/
        └── confluence-fetch.test.js
```

Sibling to `memory-mcp-server/`, not inside it — keeps the "zero network" server and
the "makes network calls" scripts visibly, structurally separate.

`tools/.env` (real secrets) is **never** committed — add to `.gitignore` alongside the
existing `memory-mcp-server` exclusions.

Zero npm dependencies: Node 20+ has a stable built-in `fetch`, so these scripts need no
`npm install` step at all, unlike `memory-mcp-server` (which depends on the MCP SDK).
This also means nothing to install/update at deploy time beyond copying files.

## 3. Install location (deployed, separate from the plugin)

Deployed to a new sibling directory under `~/.copilot/`, parallel to — but distinct
from — where the plugin itself lives:

```
~/.copilot/
├── skills/                    # plugin (existing)
├── agents/                    # plugin (existing)
├── mcp-servers/
│   └── memory-mcp-server/     # plugin (existing)
├── mcp-config.json            # plugin (existing)
├── copilot-instructions.md    # plugin (existing)
└── tools/                     # NEW — Jira/Confluence, independent of the plugin
    ├── .env                   # shared credentials, created from .env.example on first install, never overwritten after
    ├── jira/
    │   └── jira-fetch.js
    └── confluence/
        └── confluence-fetch.js
```

Nothing under `~/.copilot/tools/` is referenced by `mcp-config.json` or `mcp.json` —
these are not MCP servers and never get registered as one. They're only reachable by
the two generated skills (§5) telling Copilot the exact shell command to run.

## 4. `.env` format (one shared file)

`~/.copilot/tools/.env`, matching the shape of `tools/.env.example` committed in this
repo:

```
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=
JIRA_API_TOKEN=
CONFLUENCE_BASE_URL=https://yourcompany.atlassian.net/wiki
CONFLUENCE_EMAIL=
CONFLUENCE_API_TOKEN=
```

**Resolved**: confirmed Atlassian **Cloud**, not Data Center/Server — auth is email +
API token, not a bearer PAT. `rest-client.js` sends
`Authorization: Basic base64(EMAIL:API_TOKEN)` per
[Atlassian's documented Cloud REST auth](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/).
Email/token are almost always identical for Jira and Confluence Cloud (same Atlassian
account, API tokens are account-level, not product-level) — kept as four separate
variables anyway rather than one shared pair, since the `.env` is a flat file either way
and it costs nothing to allow them to diverge if the company ever splits accounts.

Install-time behavior: if `~/.copilot/tools/.env` already exists, it is **never**
overwritten by a re-install — only created from `.env.example` if missing. Re-running
`deploy:global --all` must not clobber a PAT the user has already filled in.

## 5. Copilot-facing integration (no MCP registration)

Reuses the existing command → skill/prompt generator unchanged — `scripts/generate.js`
already turns every file in `sources/commands/*.md` into a matched `SKILL.md` +
`.prompt.md` pair with no per-command logic, so adding two new command sources needs
zero generator changes:

```
sources/commands/jira.md         (name: jira)
sources/commands/confluence.md   (name: confluence)
```

Each command's body tells Copilot, in plain instructions (not a tool schema): when the
user asks about a Jira issue/search/comments (or Confluence page/search/children), run
the corresponding script via the shell tool and parse its stdout. Example body content:

```
Run: node {{JIRA_SCRIPT_PATH}} issue PROJ-123
Run: node {{JIRA_SCRIPT_PATH}} search "project = PROJ AND status = Open"
Run: node {{JIRA_SCRIPT_PATH}} comments PROJ-123
Output is plain text, one line per field — read it directly, no JSON parsing needed.
```

`{{JIRA_SCRIPT_PATH}}` is a placeholder, not literal shell `~` expansion — this repo
already has a working pattern for exactly this problem: `deploy-global.js`'s
`deployMcpConfigs()` resolves `${workspaceFolder}` to an absolute path and overrides the
memory server's `args` with the real installed location before writing config. The same
substitution idiom extends naturally here: after `deploySkills()` copies
`jira/SKILL.md` and `jira.prompt.md` to `~/.copilot/`, a new deploy step text-replaces
`{{JIRA_SCRIPT_PATH}}` with the absolute path of the just-installed
`~/.copilot/tools/jira/jira-fetch.js` (same for Confluence). No shell-expansion
portability risk across bash/zsh/PowerShell because the path is already absolute and
literal by the time Copilot reads the skill.

## 6. Script behavior (read-only by construction)

Read-only isn't a runtime permission check — it's structural: only GET-shaped
subcommands are ever written, mirroring how `memory-mcp-server` enforces "zero network"
by what code exists rather than a toggle (`DESIGN.md` §6 Tier B). There is no code path
in either script capable of a write/delete call.

**`jira-fetch.js`**
| Subcommand | Endpoint |
|---|---|
| `issue <KEY>` | `GET /rest/api/2/issue/{key}` |
| `search <JQL>` | `GET /rest/api/2/search?jql=...` |
| `comments <KEY>` | `GET /rest/api/2/issue/{key}/comment` |

**`confluence-fetch.js`**
| Subcommand | Endpoint |
|---|---|
| `page <PAGE_ID>` | `GET /rest/api/content/{id}?expand=body.storage` |
| `search <CQL>` | `GET /rest/api/content/search?cql=...` |
| `children <PAGE_ID>` | `GET /rest/api/content/{id}/child/page` |

**Output shaping is where the actual token savings come from**, not just skipping MCP
registration — raw Jira/Confluence API responses are deeply nested and verbose
(custom fields, avatar URLs, `_expandable` links, watchers, worklogs, etc.). Default
output is a trimmed plain-text digest; `--format=json` is the escape hatch for callers
that need the full raw payload. Proposed default field sets, one line per field
(list output gets one line per *result* instead):

| Subcommand | Digest fields |
|---|---|
| `jira issue` | key, summary, status, assignee, priority, updated, description |
| `jira search` | one line per issue: key, summary, status, assignee, updated — plus total count |
| `jira comments` | one line per comment: author, created, body |
| `confluence page` | id, title, spaceKey, updated (by/when), body |
| `confluence search` | one line per result: id, title, spaceKey, type, lastModified |
| `confluence children` | one line per child: id, title |

**Implementation note, not a design blocker**: Jira Cloud's `description` field (API v3)
is Atlassian Document Format (ADF) JSON, not a plain string — needs flattening to text.
Confluence's `body.storage` is XHTML-based storage format — needs tag-stripping. Both
are self-contained parsing concerns inside `rest-client.js`, isolated from everything
else in this design.

## 7. Deploy flags — extending `deploy-global.js`

Current script (`scripts/deploy-global.js`) always runs the same fixed sequence with no
flags. New behavior, additive and non-breaking:

- `npm run deploy:global` (no flags) → **unchanged**: core plugin only, tools not
  installed. Preserves current default exactly.
- `npm run deploy:global -- --all` → core plugin **+** both tool scripts installed,
  skills patched with resolved paths, `.env` created from template if absent.
- `npm run deploy:global -- --tool=jira` / `--tool=jira,confluence` → core plugin +
  only the named tool(s).

Parse `process.argv` for `--all` / `--tool=...` into a `requestedTools` set; validate
every name in `--tool=` against the known set (`jira`, `confluence`) **before** any
deploy step runs — an unrecognized name (typo, e.g. `--tool=jria`) is a hard failure:
print the bad name(s) and exit non-zero, deploying nothing at all for that run rather
than silently skipping the typo and partially succeeding.

Once validated, for each requested tool: copy `tools/<name>/` (script + shared `lib/`)
to `~/.copilot/tools/<name>/`, ensure `~/.copilot/tools/.env` exists (create from
`.env.example` only if missing, never overwrite), then patch that tool's
already-deployed skill/prompt files with the resolved absolute script path (§5).

Re-running without `--tool`/`--all` must not remove a previously-installed tool —
installation here is purely additive; there is no `--remove` flag in this design
(uninstall, if ever needed, is a separate ask).

## 8. Security notes

- PAT lives only in `~/.copilot/tools/.env`, outside this repo entirely; never logged,
  never echoed back on error (redact before any error message that might include
  request headers).
- `tools/.env.example` (committed) must only ever contain empty/placeholder values —
  same hygiene as any other checked-in template.
- Add `tools/.env` to `.gitignore` for local script development/testing before deploy.
- Outbound network calls here are a deliberate, scoped exception to the "zero outbound
  network" rule — that rule was specific to `memory-mcp-server` (§1 above), not a
  repo-wide constraint.

## 9. Testing

Same shape as `memory-mcp-server/test/`: `node --test tools/jira/test/*.test.js` and
`tools/confluence/test/*.test.js`, covering URL construction, auth header formatting,
missing-PAT failure behavior, and digest trimming against a handful of fixture JSON
responses (no live Jira/Confluence instance in CI — nothing to hit). Manual smoke test
against the real company instance documented in `TESTING.md` once built, same as this
repo already does for the parts of the plugin that can't be unit-tested.

## 10. Open decisions

All three resolved:

1. **Auth scheme** — Atlassian Cloud, Basic email+API-token, not Bearer-PAT (§4).
2. **Digest fields** — default field sets proposed per subcommand (§6); adjust once
   real usage shows a field is missing or noisy, rather than pre-optimizing further now.
3. **Unknown `--tool=` values** — hard-fail before any deploy step runs (§7).

Nothing left blocking implementation start.
