#!/usr/bin/env node
// sessionStart hook (DESIGN.md §11d): auto-loads existing memories as additionalContext so
// /load never has to be typed by hand.
//
// Project-aware as of sub-phase 3b-2 (DESIGN.md §11e) -- delegates to store.js's loadDigest(),
// which merges global entries with the current repo's project-scoped entries (resolved from this
// hook's own cwd) and folds in opportunistic lifecycle maintenance (stale-project purge, global
// LRU eviction) along the way. This script itself stays a thin formatter; all storage/lifecycle
// logic lives in store.js. Talks to store.js directly, not over MCP -- hook processes are plain
// subprocesses, not MCP clients.
//
// Fails open by design: any error here emits {} (no additionalContext) rather than crashing or
// blocking the session -- a bug in this script must never be able to break a Copilot session.

import { readFileSync } from 'node:fs';
import { loadDigest } from '../src/store.js';

const MAX_ENTRIES = 20;
const MAX_TOTAL_CHARS = 8000; // ~2K tokens, rough 4-chars-per-token heuristic (DESIGN.md §11d)
const MAX_VALUE_CHARS = 300;
const HEADER = '## Local Memory (explicit, user-saved)';

function readHookPayload() {
  // Hook input arrives as JSON on stdin.
  try {
    const raw = readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function formatDigest(entries) {
  // entries is already capped to MAX_ENTRIES by loadDigest() -- this loop is a second, cheaper
  // safety net on total size, not the primary cap.
  const lines = [HEADER];
  let charBudget = MAX_TOTAL_CHARS - HEADER.length;
  for (const entry of entries) {
    const line = `- ${entry.key} (updated ${entry.updatedAt}): ${truncate(entry.value, MAX_VALUE_CHARS)}`;
    if (line.length > charBudget) break;
    lines.push(line);
    charBudget -= line.length;
  }
  return lines.join('\n');
}

async function main() {
  const payload = readHookPayload();
  const entries = await loadDigest({ cwd: payload.cwd || process.cwd(), maxEntries: MAX_ENTRIES });

  if (entries.length === 0) {
    // Deliberate no-op, not an empty additionalContext -- avoids sending boilerplate on every
    // session and reduces the chance of crowding native Copilot Memory's own context budget
    // (DESIGN.md §11h).
    process.stdout.write(JSON.stringify({}));
    return;
  }

  process.stdout.write(JSON.stringify({ additionalContext: formatDigest(entries) }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}));
});
