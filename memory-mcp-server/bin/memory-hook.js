#!/usr/bin/env node
// sessionStart hook (DESIGN.md §11d, sub-phase 3b-1): auto-loads existing memories as
// additionalContext so /load never has to be typed by hand.
//
// Deliberately narrow for this phase -- reads every stored memory (no scope/project filtering
// yet; that lands with the sharded-storage rework in 3b-2, DESIGN.md §11e) and formats the most
// recently updated ones into a capped digest. Talks to store.js directly, not over MCP -- hook
// processes are plain subprocesses, not MCP clients.
//
// Fails open by design: any error here emits {} (no additionalContext) rather than crashing or
// blocking the session -- a bug in this script must never be able to break a Copilot session.

import { readFileSync } from 'node:fs';
import { listMemoriesWithValues } from '../src/store.js';

const MAX_ENTRIES = 20;
const MAX_TOTAL_CHARS = 8000; // ~2K tokens, rough 4-chars-per-token heuristic (DESIGN.md §11d)
const MAX_VALUE_CHARS = 300;
const HEADER = '## Local Memory (explicit, user-saved)';

function readHookPayload() {
  // Hook input arrives as JSON on stdin. Not currently used (no per-project filtering yet), but
  // read defensively so a malformed/empty payload never throws.
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
  const lines = [HEADER];
  let charBudget = MAX_TOTAL_CHARS - HEADER.length;
  for (const entry of entries.slice(0, MAX_ENTRIES)) {
    const line = `- ${entry.key} (updated ${entry.updatedAt}): ${truncate(entry.value, MAX_VALUE_CHARS)}`;
    if (line.length > charBudget) break;
    lines.push(line);
    charBudget -= line.length;
  }
  return lines.join('\n');
}

async function main() {
  readHookPayload();

  const entries = await listMemoriesWithValues();
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
