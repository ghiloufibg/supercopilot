// Shared by jira-fetch.js and confluence-fetch.js: env loading, Atlassian Cloud Basic auth
// (email + API token, per TOOLS-DESIGN.md §4 — not a bearer PAT, that's Data Center/Server
// only), a thin GET wrapper, and ADF/storage-format text flattening for the default digest
// output. No dependencies — Node 20+'s built-in fetch is enough, so there's nothing to
// `npm install` for these scripts (TOOLS-DESIGN.md §2).

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function resolveEnvPath() {
  const toolsDir = process.env.COPILOT_TOOLS_DIR || path.join(os.homedir(), '.copilot', 'tools');
  return path.join(toolsDir, '.env');
}

export function parseEnvFile(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

// Loads ~/.copilot/tools/.env into process.env, without overriding variables already set
// (lets real env vars — or a test's own process.env setup — win over the file). Re-reads the
// file every call rather than caching: these scripts are one-shot CLI processes, so there's
// no lifetime over which a cache would pay for itself, and re-reading avoids any staleness.
export function loadEnvFileIfPresent() {
  const envPath = resolveEnvPath();
  if (!existsSync(envPath)) return;
  const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Reads {PREFIX}_BASE_URL / {PREFIX}_EMAIL / {PREFIX}_API_TOKEN (e.g. prefix "JIRA" or
// "CONFLUENCE") per TOOLS-DESIGN.md §4's shared .env format.
export function getServiceConfig(prefix) {
  loadEnvFileIfPresent();
  const baseUrl = process.env[`${prefix}_BASE_URL`];
  const email = process.env[`${prefix}_EMAIL`];
  const token = process.env[`${prefix}_API_TOKEN`];
  const missing = [];
  if (!baseUrl) missing.push(`${prefix}_BASE_URL`);
  if (!email) missing.push(`${prefix}_EMAIL`);
  if (!token) missing.push(`${prefix}_API_TOKEN`);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. Set them in ${resolveEnvPath()}.`
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), email, token };
}

export function authHeader(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

// GitLab's PAT scheme (TOOLS-DESIGN.md §4) — a bare token sent as the PRIVATE-TOKEN header,
// unrelated to Atlassian's Basic-auth email+token pair above. No encoding, just the raw value.
export function getGitlabConfig() {
  loadEnvFileIfPresent();
  const baseUrl = process.env.GITLAB_BASE_URL;
  const token = process.env.GITLAB_API_TOKEN;
  const missing = [];
  if (!baseUrl) missing.push('GITLAB_BASE_URL');
  if (!token) missing.push('GITLAB_API_TOKEN');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. Set them in ${resolveEnvPath()}.`
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

// GET-only by construction — there is no POST/PUT/DELETE path anywhere in this module or its
// callers (TOOLS-DESIGN.md §6: read-only is structural, not a runtime permission check).
export async function getJson(url, headers, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers });
  } catch (err) {
    // Never include `headers` (carries the auth token) in any thrown message.
    throw new Error(`Request to ${url} failed: ${err.message}`);
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `${url} responded ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 300)}` : ''}`
    );
  }
  return response.json();
}

// GitLab list endpoints paginate via response headers (X-Total, X-Total-Pages, ...), not the
// JSON body Jira's `total` field lives in (TOOLS-DESIGN.md §6c) — a separate function so
// getJson() above, and the Jira/Confluence callers relying on its exact shape, stay untouched.
export async function getJsonWithMeta(url, headers, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers });
  } catch (err) {
    throw new Error(`Request to ${url} failed: ${err.message}`);
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `${url} responded ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 300)}` : ''}`
    );
  }
  const data = await response.json();
  return { data, headers: response.headers };
}

// A handful of GitLab endpoints (raw file content, job trace logs) return plain text, not
// JSON — no digest formatting needed since the body is already exactly what the caller wants.
export async function getText(url, headers, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers });
  } catch (err) {
    throw new Error(`Request to ${url} failed: ${err.message}`);
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `${url} responded ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 300)}` : ''}`
    );
  }
  return response.text();
}

// Flattens a Jira Atlassian Document Format node tree (issue/comment `description`/`body` on
// Cloud, both API v2 and v3) into plain text. Passing a plain string through unchanged covers
// the Data Center/Server case defensively, even though this design targets Cloud.
export function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join('');
  const children = Array.isArray(node.content) ? node.content.map(adfToText).join('') : '';
  switch (node.type) {
    case 'text':
      return node.text || '';
    case 'hardBreak':
      return '\n';
    case 'paragraph':
    case 'heading':
      return `${children}\n`;
    case 'listItem':
      return `- ${children}`;
    default:
      return children;
  }
}

// Strips Confluence's XHTML-based storage format down to plain text for the default digest.
export function storageToText(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
