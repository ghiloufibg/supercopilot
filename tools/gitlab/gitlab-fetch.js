#!/usr/bin/env node
// Read-only GitLab REST v4 fetch. Only GET-shaped resource:action pairs exist below — there is
// no write/delete code path anywhere in this file (TOOLS-DESIGN.md §6c). Not an MCP server:
// this runs as an ordinary subprocess Copilot invokes via the shell tool, so there's no
// standing tool-schema cost on every turn (TOOLS-DESIGN.md §1).
//
// Works against gitlab.com or any self-hosted instance via GITLAB_BASE_URL — same code path
// either way (TOOLS-DESIGN.md §4).
//
// Usage:
//   node gitlab-fetch.js <resource> <action> [args] [--flags] [--format=json]
//
// Resources and actions (all GET, see TOOLS-DESIGN.md §6c for the full endpoint table):
//   project show <id|path>                          project list [--search=]
//   group   show <id|path>                           group   list [--search=]
//   member  list <project> [--group]
//   mr      show <project:iid>                        mr      list <project> [--state=] [--author=]
//   mr      comments <project:iid>                     mr      commits <project:iid>
//   mr      changes <project:iid>
//   issue   show <project:iid>                        issue   list <project> [--state=] [--labels=]
//   issue   comments <project:iid>
//   commit  show <project:sha>                        commit  list <project> [--ref=]
//   branch  list <project>                            branch  show <project:branch>
//   tag     list <project>
//   file    show <project> <path> [--ref=]
//   tree    list <project> [--path=] [--ref=]
//   pipeline show <project:id>                        pipeline list <project> [--ref=] [--status=]
//   job     list <project:pipeline_id>                 job     log <project:job_id>
//   release list <project>
//   milestone list <project>
//   label   list <project>
//   wiki    show <project:slug>                        wiki    list <project>
//   user    show <username|id>
//   search  run <scope> <query> [--project=] [--group=]
//
// Explicitly out of scope, by design: CI/CD variables, snippets, container/package registry
// downloads, and admin/instance-wide endpoints — see TOOLS-DESIGN.md §6c and §8. None of these
// have, or will ever gain, a code path here.

import { pathToFileURL } from 'node:url';
import { getGitlabConfig, getJson, getJsonWithMeta, getText } from '../lib/rest-client.js';

const RESOURCE_ACTIONS = {
  project: ['show', 'list'],
  group: ['show', 'list'],
  member: ['list'],
  mr: ['show', 'list', 'comments', 'commits', 'changes'],
  issue: ['show', 'list', 'comments'],
  commit: ['show', 'list'],
  branch: ['list', 'show'],
  tag: ['list'],
  file: ['show'],
  tree: ['list'],
  pipeline: ['show', 'list'],
  job: ['list', 'log'],
  release: ['list'],
  milestone: ['list'],
  label: ['list'],
  wiki: ['show', 'list'],
  user: ['show'],
  search: ['run'],
};

// Columns shown per result row for `list`-shaped actions, analogous to jira-fetch.js's
// ISSUE_DIGEST_FIELDS/SEARCH_DIGEST_FIELDS constants (TOOLS-DESIGN.md §6c's "Output shaping").
const LIST_DIGEST_FIELDS = {
  project: ['id', 'path_with_namespace', 'default_branch'],
  group: ['id', 'full_path'],
  member: ['id', 'username', 'name', 'access_level'],
  mr: ['iid', 'title', 'state', 'author'],
  issue: ['iid', 'title', 'state', 'author'],
  commit: ['short_id', 'title', 'author_name', 'created_at'],
  branch: ['name', 'default', 'protected'],
  tag: ['name', 'target'],
  pipeline: ['id', 'status', 'ref', 'created_at'],
  job: ['id', 'name', 'status', 'stage'],
  release: ['tag_name', 'name', 'released_at'],
  milestone: ['iid', 'title', 'state', 'due_date'],
  label: ['name', 'color'],
  wiki: ['slug', 'title'],
};

// Keys skipped from the generic `show` digest regardless of resource — noisy across nearly
// every GitLab payload (avatar images, HTML-rendered duplicates of fields already shown as
// text, HATEOAS-style link blocks, and per-caller permission blocks).
function isNoisyKey(key) {
  return key === 'avatar_url' || key === '_links' || key === 'permissions' || key.endsWith('_html');
}

function fieldOrNone(value, fallback = '—') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    return value.length === 0 ? '—' : value.map(formatValue).join(', ');
  }
  if ('username' in value && 'name' in value) return `${value.name} (@${value.username})`;
  if ('name' in value) return String(value.name);
  if ('title' in value) return String(value.title);
  return JSON.stringify(value);
}

// Generic key:value digest for `show` actions — no per-endpoint formatter for every resource
// (TOOLS-DESIGN.md §6c: hand-writing ~25 formatters would make the script itself the bulk of
// this design). `--format=json` remains the escape hatch for any field this trims.
export function formatShow(data) {
  const lines = Object.entries(data)
    .filter(([key]) => !isNoisyKey(key))
    .map(([key, value]) => `${key}: ${formatValue(value)}`);
  return lines.length > 0 ? lines.join('\n') : '—';
}

// MR/issue "comments" are GitLab discussions, each wrapping one or more notes — flattened to
// one line per note (author, timestamp, body), the GitLab analog of jira-fetch.js's
// formatComments. Kept as its own formatter rather than folded into the generic `list`
// digest below because the actual comment text lives one level deeper, inside `notes[]`.
export function formatDiscussions(discussions) {
  const notes = discussions.flatMap((d) => d.notes || []);
  if (notes.length === 0) return 'No comments.';
  return notes
    .map((n) => `[${fieldOrNone(n.created_at)}] ${fieldOrNone(n.author && n.author.name, 'Unknown')}:\n${fieldOrNone(n.body, '—')}`)
    .join('\n---\n');
}

// Generic one-line-per-result digest for `list` actions, columns chosen per resource from
// LIST_DIGEST_FIELDS (falls back to the first four keys of the first result if a resource has
// no explicit column list — every resource above one does, but this keeps the function total).
export function formatList(resource, items, total) {
  if (items.length === 0) return 'Found 0 result(s).';
  const fields = LIST_DIGEST_FIELDS[resource] || Object.keys(items[0]).slice(0, 4);
  const rows = items.map((item) => fields.map((f) => formatValue(item[f])).join('\t'));
  const header = total !== undefined && total !== null && total !== ''
    ? `Found ${total} total (showing ${items.length}):`
    : `Found ${items.length} result(s):`;
  return [header, ...rows].join('\n');
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) flags[arg.slice(2)] = true;
      else flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      positional.push(arg);
    }
  }
  const format = flags.format === undefined ? 'text' : flags.format;
  if (format !== 'text' && format !== 'json') {
    throw new Error(`Unknown --format value "${format}". Expected "text" or "json".`);
  }
  const [resource, action, ...rest] = positional;
  if (!resource || !(resource in RESOURCE_ACTIONS)) {
    throw new Error(`Unknown resource "${resource}". Expected one of: ${Object.keys(RESOURCE_ACTIONS).join(', ')}.`);
  }
  if (!action || !RESOURCE_ACTIONS[resource].includes(action)) {
    throw new Error(`Unknown action "${action}" for resource "${resource}". Expected one of: ${RESOURCE_ACTIONS[resource].join(', ')}.`);
  }
  return { resource, action, rest, flags, format };
}

// Splits a "<project>:<id>" compound token (mr/issue/pipeline/job/branch/wiki show, etc.) —
// project paths use "/" for namespaces, never ":", so splitting on the last colon is
// unambiguous (TOOLS-DESIGN.md §6c).
function splitCompound(token, label) {
  if (!token) throw new Error(`Missing argument. Expected "<project>:<${label}>".`);
  const idx = token.lastIndexOf(':');
  if (idx === -1) throw new Error(`Expected "<project>:<${label}>", got "${token}".`);
  return [token.slice(0, idx), token.slice(idx + 1)];
}

function projectId(idOrPath) {
  if (!idOrPath) throw new Error('Missing <project> argument (numeric ID or namespace/project path).');
  return encodeURIComponent(idOrPath);
}

function query(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function runGitlab(argv, { fetchImpl = fetch } = {}) {
  const { resource, action, rest, flags, format } = parseArgs(argv);
  const config = getGitlabConfig();
  const headers = { 'PRIVATE-TOKEN': config.token, Accept: 'application/json' };
  const api = config.baseUrl + '/api/v4';

  const asJson = (data) => JSON.stringify(data, null, 2);

  async function show(url) {
    const data = await getJson(url, headers, fetchImpl);
    return format === 'json' ? asJson(data) : formatShow(data);
  }

  async function list(url, listResource) {
    if (format === 'json') {
      const { data } = await getJsonWithMeta(url, headers, fetchImpl);
      return asJson(data);
    }
    const { data, headers: respHeaders } = await getJsonWithMeta(url, headers, fetchImpl);
    const total = respHeaders.get ? respHeaders.get('x-total') : undefined;
    return formatList(listResource, data, total);
  }

  async function comments(url) {
    const data = await getJson(url, headers, fetchImpl);
    return format === 'json' ? asJson(data) : formatDiscussions(data);
  }

  if (resource === 'project') {
    if (action === 'show') return show(`${api}/projects/${projectId(rest[0])}`);
    const q = query({ search: flags.search, membership: true, simple: format === 'text' ? true : undefined });
    return list(`${api}/projects${q}`, 'project');
  }

  if (resource === 'group') {
    if (action === 'show') return show(`${api}/groups/${projectId(rest[0])}`);
    return list(`${api}/groups${query({ search: flags.search })}`, 'group');
  }

  if (resource === 'member') {
    const kind = flags.group ? 'groups' : 'projects';
    return list(`${api}/${kind}/${projectId(rest[0])}/members`, 'member');
  }

  if (resource === 'mr') {
    if (action === 'show') {
      const [project, iid] = splitCompound(rest[0], 'iid');
      return show(`${api}/projects/${projectId(project)}/merge_requests/${encodeURIComponent(iid)}`);
    }
    if (action === 'list') {
      const q = query({ state: flags.state, author_username: flags.author });
      return list(`${api}/projects/${projectId(rest[0])}/merge_requests${q}`, 'mr');
    }
    const [project, iid] = splitCompound(rest[0], 'iid');
    const base = `${api}/projects/${projectId(project)}/merge_requests/${encodeURIComponent(iid)}`;
    if (action === 'comments') return comments(`${base}/discussions`);
    if (action === 'commits') return list(`${base}/commits`, 'commit');
    return show(`${base}/changes`); // MR "changes" is a single object with a diff array field, not a paginated list
  }

  if (resource === 'issue') {
    if (action === 'show') {
      const [project, iid] = splitCompound(rest[0], 'iid');
      return show(`${api}/projects/${projectId(project)}/issues/${encodeURIComponent(iid)}`);
    }
    if (action === 'list') {
      const q = query({ state: flags.state, labels: flags.labels });
      return list(`${api}/projects/${projectId(rest[0])}/issues${q}`, 'issue');
    }
    const [project, iid] = splitCompound(rest[0], 'iid');
    return comments(`${api}/projects/${projectId(project)}/issues/${encodeURIComponent(iid)}/discussions`);
  }

  if (resource === 'commit') {
    if (action === 'show') {
      const [project, sha] = splitCompound(rest[0], 'sha');
      return show(`${api}/projects/${projectId(project)}/repository/commits/${encodeURIComponent(sha)}`);
    }
    const q = query({ ref_name: flags.ref });
    return list(`${api}/projects/${projectId(rest[0])}/repository/commits${q}`, 'commit');
  }

  if (resource === 'branch') {
    if (action === 'list') return list(`${api}/projects/${projectId(rest[0])}/repository/branches`, 'branch');
    const [project, branch] = splitCompound(rest[0], 'branch');
    return show(`${api}/projects/${projectId(project)}/repository/branches/${encodeURIComponent(branch)}`);
  }

  if (resource === 'tag') {
    return list(`${api}/projects/${projectId(rest[0])}/repository/tags`, 'tag');
  }

  if (resource === 'file') {
    const [project, filePath] = rest;
    if (!filePath) throw new Error('Missing <path> argument for "file show".');
    const url = `${api}/projects/${projectId(project)}/repository/files/${encodeURIComponent(filePath)}/raw${query({ ref: flags.ref })}`;
    return getText(url, headers, fetchImpl);
  }

  if (resource === 'tree') {
    const q = query({ path: flags.path, ref: flags.ref });
    return list(`${api}/projects/${projectId(rest[0])}/repository/tree${q}`, 'tree');
  }

  if (resource === 'pipeline') {
    if (action === 'show') {
      const [project, id] = splitCompound(rest[0], 'id');
      return show(`${api}/projects/${projectId(project)}/pipelines/${encodeURIComponent(id)}`);
    }
    const q = query({ ref: flags.ref, status: flags.status });
    return list(`${api}/projects/${projectId(rest[0])}/pipelines${q}`, 'pipeline');
  }

  if (resource === 'job') {
    if (action === 'list') {
      const [project, pipelineId] = splitCompound(rest[0], 'pipeline_id');
      return list(`${api}/projects/${projectId(project)}/pipelines/${encodeURIComponent(pipelineId)}/jobs`, 'job');
    }
    const [project, jobId] = splitCompound(rest[0], 'job_id');
    return getText(`${api}/projects/${projectId(project)}/jobs/${encodeURIComponent(jobId)}/trace`, headers, fetchImpl);
  }

  if (resource === 'release') {
    return list(`${api}/projects/${projectId(rest[0])}/releases`, 'release');
  }

  if (resource === 'milestone') {
    return list(`${api}/projects/${projectId(rest[0])}/milestones`, 'milestone');
  }

  if (resource === 'label') {
    return list(`${api}/projects/${projectId(rest[0])}/labels`, 'label');
  }

  if (resource === 'wiki') {
    if (action === 'list') return list(`${api}/projects/${projectId(rest[0])}/wikis`, 'wiki');
    const [project, slug] = splitCompound(rest[0], 'slug');
    return show(`${api}/projects/${projectId(project)}/wikis/${encodeURIComponent(slug)}`);
  }

  if (resource === 'user') {
    const target = rest[0];
    if (!target) throw new Error('Missing <username|id> argument for "user show".');
    if (/^\d+$/.test(target)) return show(`${api}/users/${target}`);
    const data = await getJson(`${api}/users${query({ username: target })}`, headers, fetchImpl);
    if (format === 'json') return asJson(data);
    if (data.length === 0) return `No user found for username "${target}".`;
    return formatShow(data[0]);
  }

  // search run <scope> <query> [--project=] [--group=]
  const [scope, searchTerm] = rest;
  if (!scope || !searchTerm) throw new Error('Missing arguments. Expected "search run <scope> <query>".');
  const q = query({ scope, search: searchTerm });
  const scopedUrl = flags.project
    ? `${api}/projects/${projectId(flags.project)}/search${q}`
    : flags.group
      ? `${api}/groups/${projectId(flags.group)}/search${q}`
      : `${api}/search${q}`;
  return list(scopedUrl, scope);
}

async function main() {
  try {
    const output = await runGitlab(process.argv.slice(2));
    console.log(output);
  } catch (err) {
    console.error(`gitlab-fetch: ${err.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
