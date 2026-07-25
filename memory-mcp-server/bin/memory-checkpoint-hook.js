#!/usr/bin/env node
// sessionEnd hook (DESIGN.md §11d, sub-phase 3b-3): deterministic fallback so a session that
// never called write_memory still leaves a trace behind.
//
// sessionEnd cannot inject additionalContext or block (notification-only, DESIGN.md §11c) and,
// per GitHub's documented payload for this event, does not receive a transcript path the way
// agentStop does -- so unlike the original §11d draft, this checkpoint cannot include a verbatim
// transcript tail. It records what IS available: session id, cwd/project, and termination
// reason. Whether write_memory was called this session is inferred by store.js's
// shouldWriteCheckpoint() from two small markers, not transcript inspection -- see its own
// comment in src/store.js for why and its known imprecision under overlapping sessions.
//
// Fails open: any error here is swallowed silently. sessionEnd is notification-only anyway, so
// there is nothing to report back even on success -- Copilot doesn't read this script's stdout.

import { readFileSync } from 'node:fs';
import { shouldWriteCheckpoint, writeCheckpoint } from '../src/store.js';

function readHookPayload() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function main() {
  const payload = readHookPayload();
  const sessionId = payload.sessionId || payload.session_id;
  const cwd = payload.cwd;
  const reason = payload.reason || payload.terminationReason || payload.termination_reason;

  if (await shouldWriteCheckpoint(sessionId)) {
    await writeCheckpoint({ sessionId, cwd, reason });
  }
}

main().catch(() => {});
