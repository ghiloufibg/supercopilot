import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'memory-mcp-test-'));
  process.env.COPILOT_MEMORY_DIR = tmpDir;
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

test('write then read returns the stored value', async () => {
  const { writeMemory, readMemory } = await import('../src/store.js');
  await writeMemory('session/context', 'hello world');
  const result = await readMemory('session/context');
  assert.equal(result.found, true);
  assert.equal(result.value, 'hello world');
});

test('read of a never-written key reports not found, not an error', async () => {
  const { readMemory } = await import('../src/store.js');
  const result = await readMemory('never/written');
  assert.equal(result.found, false);
  assert.equal(result.value, null);
});

test('list_memories includes every written key', async () => {
  const { writeMemory, listMemories } = await import('../src/store.js');
  await writeMemory('list/a', '1');
  await writeMemory('list/b', '2');
  const keys = (await listMemories()).map((m) => m.key);
  assert.ok(keys.includes('list/a'));
  assert.ok(keys.includes('list/b'));
});

test('delete_memory removes the key and reports whether it existed', async () => {
  const { writeMemory, deleteMemory, readMemory } = await import('../src/store.js');
  await writeMemory('to-delete', 'x');
  const first = await deleteMemory('to-delete');
  assert.equal(first.deleted, true);
  const second = await deleteMemory('to-delete');
  assert.equal(second.deleted, false);
  const afterDelete = await readMemory('to-delete');
  assert.equal(afterDelete.found, false);
});

test('a read issued right after a write for the same key sees the write, even if not awaited between them', async () => {
  // Regression test for a real bug found during manual smoke-testing: readMemory used to skip
  // the operation queue entirely, so a read issued immediately after an unawaited write could
  // reach disk before the write finished and report found: false for a key that was, from the
  // caller's perspective, already written.
  const { writeMemory, readMemory } = await import('../src/store.js');
  const writePromise = writeMemory('race/key', 'written first');
  const readPromise = readMemory('race/key');
  await writePromise;
  const readResult = await readPromise;
  assert.equal(readResult.found, true);
  assert.equal(readResult.value, 'written first');
});

test('concurrent writes to different keys do not clobber each other', async () => {
  const { writeMemory, readMemory } = await import('../src/store.js');
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => writeMemory(`concurrent/${i}`, `value-${i}`))
  );
  for (let i = 0; i < 20; i++) {
    const result = await readMemory(`concurrent/${i}`);
    assert.equal(result.value, `value-${i}`, `key concurrent/${i} was clobbered by a concurrent write`);
  }
});
