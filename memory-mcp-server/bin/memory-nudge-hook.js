#!/usr/bin/env node
// agentStop hook (DESIGN.md §11d, sub-phase 3b-4): nudges the model to call write_memory itself
// when a turn looks worth remembering, instead of requiring the user to type /save.
//
// Highest-risk piece of the whole pipeline, shipped last and only with its own off-switch already
// in place (write_memory("config/nudge", "off")) -- DESIGN.md §11i. Two independent defenses
// against ever blocking more than once in a row: (1) this hook checks the payload's own
// stop_hook_active-style flag and always allows if this invocation is itself already a forced
// continuation; (2) store.js's shouldNudge() additionally gates on a one-shot sentinel file, so
// even if that flag is ever absent or named differently, the sentinel alone still prevents a
// repeat nudge within the same session.
//
// Transcript parsing is best-effort and format-agnostic on purpose -- the real transcript schema
// isn't confirmed (DESIGN.md §11h). A loose text scan for tool-name/role markers degrades to "no
// matches found" rather than throwing on an unexpected shape; the session-duration trigger (based
// on our own sessionStart marker, not the transcript) still works even under total
// transcript-parsing failure, so a nudge can still fire on a long session regardless.
//
// Fails open toward "allow" on any error -- an interrupting mechanism must never get stuck
// insisting on a block it can't justify.

import { readFileSync } from 'node:fs';
import { shouldNudge } from '../src/store.js';

const SIDE_EFFECT_TOOL_PATTERN = /"(?:tool_name|toolName|name)"\s*:\s*"(Edit|Write|MultiEdit|Bash)"/;
const ASSISTANT_TURN_PATTERN = /"(?:role|type)"\s*:\s*"assistant"/g;

const NUDGE_REASON =
  'If anything from this session is worth remembering across future sessions -- a decision, a ' +
  'fact, a learning -- call write_memory now. Otherwise just say so and stop.';

function readHookPayload() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function scanTranscript(transcriptPath) {
  if (!transcriptPath) return { hadSideEffectTool: false, turnCount: 0 };
  try {
    const content = readFileSync(transcriptPath, 'utf8');
    return {
      hadSideEffectTool: SIDE_EFFECT_TOOL_PATTERN.test(content),
      turnCount: (content.match(ASSISTANT_TURN_PATTERN) || []).length,
    };
  } catch {
    return { hadSideEffectTool: false, turnCount: 0 };
  }
}

async function main() {
  const payload = readHookPayload();
  const sessionId = payload.sessionId || payload.session_id;
  const alreadyBlocked = Boolean(payload.stop_hook_active || payload.stopHookActive);
  const { hadSideEffectTool, turnCount } = scanTranscript(payload.transcriptPath || payload.transcript_path);

  const nudge = await shouldNudge({ sessionId, hadSideEffectTool, turnCount, alreadyBlocked });

  process.stdout.write(JSON.stringify(nudge ? { decision: 'block', reason: NUDGE_REASON } : { decision: 'allow' }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
});
