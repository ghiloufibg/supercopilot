// End-to-end test for bin/memory-hook.js (DESIGN.md §11d, sub-phase 3b-1) -- runs it as a real
// subprocess, the same way a sessionStart hook would, rather than importing its internals.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let tmpDir;
const HOOK_SCRIPT = path.resolve(import.meta.dirname, '..', 'bin', 'memory-hook.js');

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'memory-hook-test-'));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function runHook() {
  return execFileSync('node', [HOOK_SCRIPT], {
    input: JSON.stringify({ sessionId: 'test-session', timestamp: Date.now(), cwd: tmpDir }),
    encoding: 'utf8',
    env: { ...process.env, COPILOT_MEMORY_DIR: tmpDir },
  });
}

test('emits no additionalContext when the store is empty', () => {
  const out = runHook();
  const parsed = JSON.parse(out);
  assert.equal(parsed.additionalContext, undefined);
});

test('emits a digest of stored memories, most recently updated first', async () => {
  process.env.COPILOT_MEMORY_DIR = tmpDir;
  const { writeMemory } = await import('../src/store.js');
  await writeMemory('hook/a', 'first value');
  await writeMemory('hook/b', 'second value');

  const out = runHook();
  const parsed = JSON.parse(out);
  assert.ok(parsed.additionalContext.includes('hook/a'));
  assert.ok(parsed.additionalContext.includes('hook/b'));
  assert.ok(
    parsed.additionalContext.indexOf('hook/b') < parsed.additionalContext.indexOf('hook/a'),
    'more recently written key should appear first in the digest'
  );
});

test('handles malformed stdin input without crashing', () => {
  const out = execFileSync('node', [HOOK_SCRIPT], {
    input: 'not json',
    encoding: 'utf8',
    env: { ...process.env, COPILOT_MEMORY_DIR: tmpDir },
  });
  assert.doesNotThrow(() => JSON.parse(out));
});
