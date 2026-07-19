#!/usr/bin/env node
// Read-only Confluence Cloud REST fetch. Only GET-shaped subcommands exist below — there is no
// write/delete code path anywhere in this file (TOOLS-DESIGN.md §6). Not an MCP server: this
// runs as an ordinary subprocess Copilot invokes via the shell tool, so there's no standing
// tool-schema cost on every turn (TOOLS-DESIGN.md §1).
//
// Usage:
//   node confluence-fetch.js page <PAGE_ID> [--format=json]
//   node confluence-fetch.js search <CQL> [--format=json]
//   node confluence-fetch.js children <PAGE_ID> [--format=json]

import { pathToFileURL } from 'node:url';
import { getServiceConfig, authHeader, getJson, storageToText } from '../lib/rest-client.js';

const SUBCOMMANDS = ['page', 'search', 'children'];

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
    throw new Error(`Missing argument for "${subcommand}" (page ID or CQL).`);
  }
  return { subcommand, target, format };
}

function fieldOrNone(value, fallback = '—') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

export function formatPage(data) {
  const version = data.version || {};
  const updatedBy = fieldOrNone(version.by && version.by.displayName, 'Unknown');
  const body = data.body && data.body.storage ? data.body.storage.value : '';
  const lines = [
    `ID: ${data.id}`,
    `Title: ${fieldOrNone(data.title)}`,
    `Space: ${fieldOrNone(data.space && data.space.key)}`,
    `Updated: ${fieldOrNone(version.when)} by ${updatedBy}${version.number ? ` (v${version.number})` : ''}`,
    'Body:',
    storageToText(body) || '—',
  ];
  return lines.join('\n');
}

export function formatSearchResults(data) {
  const results = data.results || [];
  if (results.length === 0) return 'Found 0 results.';
  const rows = results.map((r) => {
    const spaceKey = fieldOrNone(r.space && r.space.key);
    return `${r.id}\t${fieldOrNone(r.type)}\t${spaceKey}\t${fieldOrNone(r.title)}`;
  });
  return [`Found ${data.size ?? results.length} result(s):`, ...rows].join('\n');
}

export function formatChildren(data) {
  const results = data.results || [];
  if (results.length === 0) return 'No child pages.';
  return [`${results.length} child page(s):`, ...results.map((r) => `${r.id}\t${fieldOrNone(r.title)}`)].join('\n');
}

export async function runConfluence(argv, { fetchImpl = fetch } = {}) {
  const { subcommand, target, format } = parseArgs(argv);
  const config = getServiceConfig('CONFLUENCE');
  const headers = { Authorization: authHeader(config.email, config.token), Accept: 'application/json' };

  if (subcommand === 'page') {
    const url = `${config.baseUrl}/rest/api/content/${encodeURIComponent(target)}?expand=body.storage,space,version`;
    const data = await getJson(url, headers, fetchImpl);
    return format === 'json' ? JSON.stringify(data, null, 2) : formatPage(data);
  }

  if (subcommand === 'search') {
    const url = `${config.baseUrl}/rest/api/content/search?cql=${encodeURIComponent(target)}&expand=space`;
    const data = await getJson(url, headers, fetchImpl);
    return format === 'json' ? JSON.stringify(data, null, 2) : formatSearchResults(data);
  }

  // children
  const url = `${config.baseUrl}/rest/api/content/${encodeURIComponent(target)}/child/page`;
  const data = await getJson(url, headers, fetchImpl);
  return format === 'json' ? JSON.stringify(data, null, 2) : formatChildren(data);
}

async function main() {
  try {
    const output = await runConfluence(process.argv.slice(2));
    console.log(output);
  } catch (err) {
    console.error(`confluence-fetch: ${err.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
