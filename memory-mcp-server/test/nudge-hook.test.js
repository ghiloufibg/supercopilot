// Sub-phase 3b-4 (DESIGN.md §11d), the highest-risk piece of the pipeline: nudging the model to
// call write_memory itself via agentStop's decision:block mechanism. Exercises every guard the
// design specified -- one-shot per session, the stop_hook_active override, the config/nudge
// off-switch, and the duration trigger working independently of transcript parsing.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let tmpDir;
const SESSION_START_HOOK = path.resolve(import.meta.dirname, '..', 'bin', 'memory-hook.js');
const NUDGE_HOOK = path.resolve(import.meta.dirname, '..', 'bin', 'memory-nudge-hook.js');

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'memory-nudge-test-'));
  process.env.COPILOT_MEMORY_DIR = tmpDir; // must be set before this file's own store.js import
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function runHook(script, payload) {
  const out = execFileSync('node', [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, COPILOT_MEMORY_DIR: tmpDir },
  });
  return JSON.parse(out);
}

function startSession(sessionId, cwd) {
  runHook(SESSION_START_HOOK, { sessionId, cwd });
}

async function writeTranscript(name, lines) {
  const p = path.join(tmpDir, name);
  await writeFile(p, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8');
  return p;
}

test('a side-effecting tool call in the transcript triggers exactly one nudge per session', async () => {
  const sessionId = 'nudge-tool';
  const cwd = path.join(tmpDir, 'repo-tool');
  await mkdir(cwd, { recursive: true });
  startSession(sessionId, cwd);
  const transcriptPath = await writeTranscript('t-tool.jsonl', [{ role: 'assistant' }, { tool_name: 'Edit', path: 'foo.js' }]);

  const first = runHook(NUDGE_HOOK, { sessionId, cwd, transcriptPath });
  assert.equal(first.decision, 'block');
  assert.ok(first.reason && first.reason.length > 0);

  const second = runHook(NUDGE_HOOK, { sessionId, cwd, transcriptPath });
  assert.equal(second.decision, 'allow', 'should not nudge twice in the same session');
});

test('reaching the assistant-turn threshold triggers a nudge even with no tool calls', async () => {
  const sessionId = 'nudge-turns';
  const cwd = path.join(tmpDir, 'repo-turns');
  await mkdir(cwd, { recursive: true });
  startSession(sessionId, cwd);
  const transcriptPath = await writeTranscript('t-turns.jsonl', [{ role: 'assistant' }, { role: 'assistant' }, { role: 'assistant' }]);

  const result = runHook(NUDGE_HOOK, { sessionId, cwd, transcriptPath });
  assert.equal(result.decision, 'block');
});

test('a short session with no tool calls and few turns does not get nudged', async () => {
  const sessionId = 'nudge-quiet';
  const cwd = path.join(tmpDir, 'repo-quiet');
  await mkdir(cwd, { recursive: true });
  startSession(sessionId, cwd);
  const transcriptPath = await writeTranscript('t-quiet.jsonl', [{ role: 'assistant' }]);

  const result = runHook(NUDGE_HOOK, { sessionId, cwd, transcriptPath });
  assert.equal(result.decision, 'allow');
});

test('a long-running session gets nudged even if the transcript is unparseable', async () => {
  const sessionId = 'nudge-duration';
  const cwd = path.join(tmpDir, 'repo-duration');
  await mkdir(cwd, { recursive: true });
  startSession(sessionId, cwd);

  // Backdate this session's own start marker past the 10-minute duration trigger.
  const markerPath = path.join(tmpDir, 'sessions', `${sessionId}.json`);
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  marker.startedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await writeFile(markerPath, JSON.stringify(marker));

  const missingTranscriptPath = path.join(tmpDir, 'does-not-exist.jsonl');
  const result = runHook(NUDGE_HOOK, { sessionId, cwd, transcriptPath: missingTranscriptPath });
  assert.equal(result.decision, 'block', 'duration trigger should work independently of transcript parsing');
});

test('stop_hook_active suppresses the nudge even when heuristics would otherwise fire', async () => {
  const sessionId = 'nudge-already-blocked';
  const cwd = path.join(tmpDir, 'repo-already-blocked');
  await mkdir(cwd, { recursive: true });
  startSession(sessionId, cwd);
  const transcriptPath = await writeTranscript('t-already.jsonl', [{ role: 'assistant' }, { role: 'assistant' }, { role: 'assistant' }]);

  const result = runHook(NUDGE_HOOK, { sessionId, cwd, transcriptPath, stop_hook_active: true });
  assert.equal(result.decision, 'allow');
});

test('a missing session id fails toward not nudging, to avoid an un-dedupable repeat trigger', async () => {
  const cwd = path.join(tmpDir, 'repo-no-session');
  await mkdir(cwd, { recursive: true });
  const transcriptPath = await writeTranscript('t-no-session.jsonl', [{ tool_name: 'Edit' }]);

  const result = runHook(NUDGE_HOOK, { cwd, transcriptPath });
  assert.equal(result.decision, 'allow');
});

test('config/nudge = "off" suppresses the nudge entirely', async () => {
  const { writeMemory } = await import('../src/store.js');
  await writeMemory('config/nudge', 'off');

  const sessionId = 'nudge-disabled';
  const cwd = path.join(tmpDir, 'repo-disabled');
  await mkdir(cwd, { recursive: true });
  startSession(sessionId, cwd);
  const transcriptPath = await writeTranscript('t-disabled.jsonl', [
    { role: 'assistant' },
    { role: 'assistant' },
    { role: 'assistant' },
    { tool_name: 'Edit' },
  ]);

  const result = runHook(NUDGE_HOOK, { sessionId, cwd, transcriptPath });
  assert.equal(result.decision, 'allow');
});
