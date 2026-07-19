#!/usr/bin/env node
// Read-only Jira Cloud REST fetch. Only GET-shaped subcommands exist below — there is no
// write/delete code path anywhere in this file (TOOLS-DESIGN.md §6). Not an MCP server: this
// runs as an ordinary subprocess Copilot invokes via the shell tool, so there's no standing
// tool-schema cost on every turn (TOOLS-DESIGN.md §1).
//
// Usage:
//   node jira-fetch.js issue <KEY> [--format=json]
//   node jira-fetch.js search <JQL> [--format=json]
//   node jira-fetch.js comments <KEY> [--format=json]

import { pathToFileURL } from 'node:url';
import { getServiceConfig, authHeader, getJson, adfToText } from '../lib/rest-client.js';

const SUBCOMMANDS = ['issue', 'search', 'comments'];

// Default digest field lists per TOOLS-DESIGN.md §6 — requested server-side via `fields` so the
// text-format default is cheap on the wire too, not just cheap for Copilot to read back.
// --format=json skips this restriction and fetches the full payload instead (see runJira).
const ISSUE_DIGEST_FIELDS = 'summary,status,assignee,priority,updated,description';
const SEARCH_DIGEST_FIELDS = 'summary,status,assignee,updated';

function parseArgs(argv) {
  const formatArg = argv.find((a) => a.startsWith('--format='));
  const format = formatArg ? formatArg.slice('--format='.length) : 'text';
  if (format !== 'text' && format !== 'json') {
    throw new Error(`Unknown --format value "${format}". Expected "text" or "json".`);
  }
  const positional = argv.filter((a) => !a.startsWith('--format='));
  const [subcommand, target] = positional;
  if (!SUBCOMMANDS.includes(subcommand)) {
    throw new Error(`Unknown subcommand "${subcommand}". Expected one of: ${SUBCOMMANDS.join(', ')}.`);
  }
  if (!target) {
    throw new Error(`Missing argument for "${subcommand}" (issue key or JQL).`);
  }
  return { subcommand, target, format };
}

function fieldOrNone(value, fallback = '—') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

export function formatIssue(data) {
  const f = data.fields || {};
  const lines = [
    `Key: ${data.key}`,
    `Summary: ${fieldOrNone(f.summary)}`,
    `Status: ${fieldOrNone(f.status && f.status.name)}`,
    `Assignee: ${fieldOrNone(f.assignee && f.assignee.displayName, 'Unassigned')}`,
    `Priority: ${fieldOrNone(f.priority && f.priority.name)}`,
    `Updated: ${fieldOrNone(f.updated)}`,
    'Description:',
    adfToText(f.description).trim() || '—',
  ];
  return lines.join('\n');
}

export function formatSearchResults(data) {
  const issues = data.issues || [];
  if (issues.length === 0) return 'Found 0 issues.';
  const rows = issues.map((issue) => {
    const f = issue.fields || {};
    const status = fieldOrNone(f.status && f.status.name);
    const assignee = fieldOrNone(f.assignee && f.assignee.displayName, 'Unassigned');
    return `${issue.key}\t${status}\t${assignee}\t${fieldOrNone(f.summary)}`;
  });
  return [`Found ${data.total ?? issues.length} issue(s) (showing ${issues.length}):`, ...rows].join('\n');
}

export function formatComments(data) {
  const comments = data.comments || [];
  if (comments.length === 0) return 'No comments.';
  return comments
    .map((c) => {
      const author = fieldOrNone(c.author && c.author.displayName, 'Unknown');
      const body = adfToText(c.body).trim() || fieldOrNone(typeof c.body === 'string' ? c.body : undefined);
      return `[${fieldOrNone(c.created)}] ${author}:\n${body}`;
    })
    .join('\n---\n');
}

export async function runJira(argv, { fetchImpl = fetch } = {}) {
  const { subcommand, target, format } = parseArgs(argv);
  const config = getServiceConfig('JIRA');
  const headers = { Authorization: authHeader(config.email, config.token), Accept: 'application/json' };

  if (subcommand === 'issue') {
    const fieldsParam = format === 'text' ? `?fields=${ISSUE_DIGEST_FIELDS}` : '';
    const url = `${config.baseUrl}/rest/api/2/issue/${encodeURIComponent(target)}${fieldsParam}`;
    const data = await getJson(url, headers, fetchImpl);
    return format === 'json' ? JSON.stringify(data, null, 2) : formatIssue(data);
  }

  if (subcommand === 'search') {
    const fieldsParam = format === 'text' ? `&fields=${SEARCH_DIGEST_FIELDS}` : '';
    const url = `${config.baseUrl}/rest/api/2/search?jql=${encodeURIComponent(target)}${fieldsParam}`;
    const data = await getJson(url, headers, fetchImpl);
    return format === 'json' ? JSON.stringify(data, null, 2) : formatSearchResults(data);
  }

  // comments
  const url = `${config.baseUrl}/rest/api/2/issue/${encodeURIComponent(target)}/comment`;
  const data = await getJson(url, headers, fetchImpl);
  return format === 'json' ? JSON.stringify(data, null, 2) : formatComments(data);
}

async function main() {
  try {
    const output = await runJira(process.argv.slice(2));
    console.log(output);
  } catch (err) {
    console.error(`jira-fetch: ${err.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
