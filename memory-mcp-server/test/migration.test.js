// Sub-phase 3b-2 (DESIGN.md §11e): a pre-existing flat memory.json (from before sharding existed)
// must migrate automatically into global.json the first time the store is touched -- no manual
// migration step, no data loss.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'memory-migration-test-'));
  await writeFile(
    path.join(tmpDir, 'memory.json'),
    JSON.stringify({ 'legacy/key': { value: 'legacy value', updatedAt: '2020-01-01T00:00:00.000Z' } })
  );
  process.env.COPILOT_MEMORY_DIR = tmpDir;
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

test('a pre-existing flat memory.json is migrated into global.json on first access', async () => {
  const { readMemory } = await import('../src/store.js');
  const result = await readMemory('legacy/key');
  assert.equal(result.found, true);
  assert.equal(result.value, 'legacy value');

  const global = JSON.parse(await readFile(path.join(tmpDir, 'global.json'), 'utf8'));
  assert.equal(global.entries['legacy/key'].value, 'legacy value');
  assert.equal(global.entries['legacy/key'].scope, 'global');

  // Renamed, not deleted -- recoverable.
  await assert.doesNotReject(stat(path.join(tmpDir, 'memory.json.migrated')));
  await assert.rejects(stat(path.join(tmpDir, 'memory.json')));
});
