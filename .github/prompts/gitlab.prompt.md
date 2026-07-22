---
description: Fetch read-only GitLab project, merge request, issue, repository, pipeline, and wiki data via a lightweight local script, not an MCP tool, for token-frugal lookups
---

This prompt mirrors the `gitlab` skill — see `.github/skills/gitlab/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/gitlab` invocation Copilot CLI gets natively from Skills.

# GitLab Read-Only Lookup

## Triggers
- User asks about a merge request, issue, commit, branch, pipeline, or file in a GitLab project
- User asks to search or list merge requests/issues by state, author, or labels
- User asks what's been said in a merge request or issue's discussion thread
- User asks to browse a repository's file tree, read a file, or check CI/pipeline status
- User asks about releases, milestones, labels, wiki pages, project members, or a GitLab user

## Usage
Run the installed script directly via the shell tool — this is a subprocess call, not an
MCP tool call, so it carries no standing tool-schema cost:
```
node {{GITLAB_SCRIPT_PATH}} <resource> <action> [args] [--flags] [--format=json]
```
Project-scoped resources take a `<project>` argument as either a numeric project ID or a
`namespace/project` path. Where two identifiers are needed (an MR/issue/commit/branch/
pipeline/job/wiki-page within a project), pass them as one `project:id` token joined by a
colon (project paths never contain a colon, so this is unambiguous).

```
node {{GITLAB_SCRIPT_PATH}} project show <id|path>
node {{GITLAB_SCRIPT_PATH}} project list [--search=TEXT]
node {{GITLAB_SCRIPT_PATH}} group show <id|path>
node {{GITLAB_SCRIPT_PATH}} group list [--search=TEXT]
node {{GITLAB_SCRIPT_PATH}} member list <project> [--group]
node {{GITLAB_SCRIPT_PATH}} mr show <project:iid>
node {{GITLAB_SCRIPT_PATH}} mr list <project> [--state=opened|closed|merged] [--author=USERNAME]
node {{GITLAB_SCRIPT_PATH}} mr comments <project:iid>
node {{GITLAB_SCRIPT_PATH}} mr commits <project:iid>
node {{GITLAB_SCRIPT_PATH}} mr changes <project:iid>
node {{GITLAB_SCRIPT_PATH}} issue show <project:iid>
node {{GITLAB_SCRIPT_PATH}} issue list <project> [--state=opened|closed] [--labels=a,b]
node {{GITLAB_SCRIPT_PATH}} issue comments <project:iid>
node {{GITLAB_SCRIPT_PATH}} commit show <project:sha>
node {{GITLAB_SCRIPT_PATH}} commit list <project> [--ref=BRANCH]
node {{GITLAB_SCRIPT_PATH}} branch list <project>
node {{GITLAB_SCRIPT_PATH}} branch show <project:branch>
node {{GITLAB_SCRIPT_PATH}} tag list <project>
node {{GITLAB_SCRIPT_PATH}} file show <project> <path> [--ref=BRANCH]
node {{GITLAB_SCRIPT_PATH}} tree list <project> [--path=DIR] [--ref=BRANCH]
node {{GITLAB_SCRIPT_PATH}} pipeline show <project:id>
node {{GITLAB_SCRIPT_PATH}} pipeline list <project> [--ref=BRANCH] [--status=success|failed|running]
node {{GITLAB_SCRIPT_PATH}} job list <project:pipeline_id>
node {{GITLAB_SCRIPT_PATH}} job log <project:job_id>
node {{GITLAB_SCRIPT_PATH}} release list <project>
node {{GITLAB_SCRIPT_PATH}} milestone list <project>
node {{GITLAB_SCRIPT_PATH}} label list <project>
node {{GITLAB_SCRIPT_PATH}} wiki show <project:slug>
node {{GITLAB_SCRIPT_PATH}} wiki list <project>
node {{GITLAB_SCRIPT_PATH}} user show <username|id>
node {{GITLAB_SCRIPT_PATH}} search run <scope> <query> [--project=ID] [--group=ID]
```
Default output is a compact plain-text digest — one `key: value` line per field for a
single-item lookup (`show`), one line per result for a list, comments flattened to
`[timestamp] author:` + body. `file show` and `job log` print raw text as-is (source code,
CI trace output) since there's no structured payload to trim. Pass `--format=json` only
when the full raw GitLab payload is actually required; it costs more tokens to read back.

## Behavioral Flow
1. Identify the resource and action from the request (e.g. "show MR 42 in foo/bar" →
   `mr show foo/bar:42`; "what changed in that file on main" → `file show ... --ref=main`)
2. Run the script via the shell tool with the appropriate resource/action/args
3. Read the plain-text digest from stdout and answer directly from it
4. If the script errors (missing credentials, 404, network failure), surface its error
   message as-is — it's already redacted of any credential and safe to show verbatim

## Requirements
- Only usable if this machine installed the `gitlab` tool (`--all` or `--tool=gitlab` at
  plugin deploy time). Before running anything, check whether the command above still
  contains the literal text `{{GITLAB_SCRIPT_PATH}}` — if so, it was never substituted
  with a real path, meaning the tool isn't installed here. Say that directly rather than
  running the literal placeholder or guessing at GitLab data.
- Credentials come from `~/.copilot/tools/.env` (`GITLAB_BASE_URL`, `GITLAB_API_TOKEN`),
  set up once by the user — this skill never reads, writes, or asks for those values
  directly. `GITLAB_BASE_URL` works for gitlab.com or any self-hosted instance; the token
  is a personal access token with `read_api` scope, sent as GitLab's own `PRIVATE-TOKEN`
  header (not Basic auth like the Jira/Confluence tools use).

## Boundaries

**Will:**
- Fetch and summarize projects, groups, members, merge requests, issues, commits,
  branches, tags, files, repository trees, pipelines, jobs, releases, milestones, labels,
  wiki pages, users, and search results — all read-only
- Default to the compact text digest to keep responses cheap; use `--format=json` only
  when the user explicitly needs the full raw payload

**Will Not:**
- Create, update, merge, comment on, approve, retry, cancel, or delete anything in
  GitLab — the underlying script has no write-capable code path at all, by construction
- Fetch CI/CD variables, snippets, container/package registry contents, or any
  admin/instance-wide endpoint — excluded even though they're technically `GET` requests,
  because their response bodies can contain secrets or are out of scope for a read-lookup
  tool (see `TOOLS-DESIGN.md` §6c/§8)
- Fall back to a separately configured GitLab MCP server, or guess at GitLab data, if this
  script isn't installed or a call to it fails
