// Sub-phase 3b-3 (DESIGN.md §11d, exit criterion): "a session with zero write_memory calls
// still produces exactly one checkpoint/... entry after it ends" -- and, the flip side, a
// session that DID save something explicitly should not get a redundant fallback checkpoint.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let tmpDir;
const SESSION_START_HOOK = path.resolve(import.meta.dirname, '..', 'bin', 'memory-hook.js');
const SESSION_END_HOOK = path.resolve(import.meta.dirname, '..', 'bin', 'memory-checkpoint-hook.js');

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'memory-checkpoint-test-'));
  process.env.COPILOT_MEMORY_DIR = tmpDir; // must be set before this file's own store.js import
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function runHook(script, payload) {
  return execFileSync('node', [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, COPILOT_MEMORY_DIR: tmpDir },
  });
}

async function checkpointKeysIn(repoDir) {
  const { resolveProjectId } = await import('../src/store.js');
  const projectId = resolveProjectId(repoDir);
  const shardPath = path.join(tmpDir, 'projects', `${projectId}.json`);
  if (!existsSync(shardPath)) return [];
  const shard = JSON.parse(await readFile(shardPath, 'utf8'));
  return Object.keys(shard.entries).filter((k) => k.startsWith('checkpoint/'));
}

test('a session that never calls write_memory gets exactly one fallback checkpoint', async () => {
  const repoDir = path.join(tmpDir, 'repo-checkpoint-a');
  await mkdir(repoDir, { recursive: true });
  const sessionId = 'session-no-writes';

  runHook(SESSION_START_HOOK, { sessionId, cwd: repoDir });
  runHook(SESSION_END_HOOK, { sessionId, cwd: repoDir, reason: 'user_exit' });

  const keys = await checkpointKeysIn(repoDir);
  assert.equal(keys.length, 1, `expected exactly one checkpoint entry, found ${keys.length}`);
});

test('a session that does call write_memory does not get a redundant fallback checkpoint', async () => {
  const repoDir = path.join(tmpDir, 'repo-checkpoint-b');
  await mkdir(repoDir, { recursive: true });
  const sessionId = 'session-with-writes';

  runHook(SESSION_START_HOOK, { sessionId, cwd: repoDir });

  const { writeMemory } = await import('../src/store.js');
  await writeMemory('real/decision', 'a genuine model-authored memory');

  runHook(SESSION_END_HOOK, { sessionId, cwd: repoDir, reason: 'user_exit' });

  const keys = await checkpointKeysIn(repoDir);
  assert.equal(keys.length, 0, `expected no fallback checkpoint when write_memory was already called, found ${keys.length}`);
});

test('the session start marker is consumed (deleted) after sessionEnd runs', async () => {
  const repoDir = path.join(tmpDir, 'repo-checkpoint-c');
  await mkdir(repoDir, { recursive: true });
  const sessionId = 'session-marker-cleanup';

  runHook(SESSION_START_HOOK, { sessionId, cwd: repoDir });
  assert.ok(existsSync(path.join(tmpDir, 'sessions', `${sessionId}.json`)), 'marker should exist right after sessionStart');

  runHook(SESSION_END_HOOK, { sessionId, cwd: repoDir });
  assert.equal(
    existsSync(path.join(tmpDir, 'sessions', `${sessionId}.json`)),
    false,
    'session marker should be consumed/deleted after sessionEnd runs'
  );
});

test('sessionEnd with no known session id still checkpoints rather than silently losing data', async () => {
  const repoDir = path.join(tmpDir, 'repo-checkpoint-d');
  await mkdir(repoDir, { recursive: true });

  runHook(SESSION_END_HOOK, { cwd: repoDir, reason: 'user_exit' }); // no sessionStart ever ran

  const keys = await checkpointKeysIn(repoDir);
  assert.equal(keys.length, 1, 'an unrecognized session should still fail toward checkpointing, not toward silently skipping');
});
