// Regression tests for the code-review lifecycle/eviction fixes:
//   #1 config/* entries are never counted by the cap nor LRU-evicted (settings can't silently revert)
//   #2 read_memory records lastReadAt, so "least-recently-read" eviction is actually accurate
//   #3 pruneExpiredProjectShards re-checks under the shard lock, so it can't delete a concurrent write
//   #4 lifecycle maintenance (prune + evict) is throttled to once per interval, off the hot path
//
// COPILOT_MEMORY_DIR is read once at store.js import time, so it's set in before() and one tmpDir
// is shared; beforeEach() wipes it back to a clean slate between tests.

import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmpDir;
let store;
let prevMaintInterval;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readGlobal = async () => JSON.parse(await readFile(path.join(tmpDir, 'global.json'), 'utf8'));

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'memory-lifecycle-fixes-'));
  process.env.COPILOT_MEMORY_DIR = tmpDir;
  prevMaintInterval = process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS;
  store = await import('../src/store.js');
});

beforeEach(async () => {
  // Clean slate: remove shards, archive, and the lifecycle markers.
  for (const p of ['global.json', 'projects', 'archive', '.last-maintenance-at', '.last-write-at']) {
    await rm(path.join(tmpDir, p), { recursive: true, force: true });
  }
  // Default: no throttle, so maintenance runs on every loadDigest. Throttle test overrides this.
  process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS = '0';
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  if (prevMaintInterval === undefined) delete process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS;
  else process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS = prevMaintInterval;
});

// ---- Fix #1 ----
test('config/* entries are never evicted or counted toward the global cap', async () => {
  await store.writeMemory('config/global-cap', '3');
  await store.writeMemory('config/nudge', 'off');
  for (let i = 0; i < 10; i++) await store.writeMemory(`m/${i}`, `v${i}`);

  await store.loadDigest({ cwd: tmpDir }); // triggers eviction down to the cap

  const g = await readGlobal();
  assert.equal(g.entries['config/nudge']?.value, 'off', 'config/nudge must survive eviction');
  assert.equal(g.entries['config/global-cap']?.value, '3', 'config/global-cap must survive eviction');
  const memKeys = Object.keys(g.entries).filter((k) => k.startsWith('m/'));
  assert.equal(memKeys.length, 3, `only the 3 (cap) real memories should remain, found ${memKeys.length}`);
});

// ---- Fix #2 ----
test('read_memory records lastReadAt', async () => {
  await store.writeMemory('k', 'v');
  let g = await readGlobal();
  assert.equal(g.entries['k'].lastReadAt, null, 'lastReadAt starts null');

  await store.readMemory('k');
  g = await readGlobal();
  assert.notEqual(g.entries['k'].lastReadAt, null, 'read_memory should stamp lastReadAt');
});

test('a frequently-read but not-recently-updated entry survives LRU eviction', async () => {
  await store.writeMemory('config/global-cap', '2');
  await store.writeMemory('old', 'v'); // oldest updatedAt
  await sleep(10);
  await store.writeMemory('mid', 'v');
  await sleep(10);
  await store.writeMemory('new', 'v');
  await sleep(10);
  await store.readMemory('old'); // reading 'old' should protect it despite its old updatedAt

  await store.loadDigest({ cwd: tmpDir }); // cap 2 of {old, mid, new} -> evict the least-recently-read

  const g = await readGlobal();
  assert.ok(g.entries['old'], "the read-protected 'old' entry must survive eviction");
  assert.ok(!g.entries['mid'], "'mid' (never read, oldest read-time) should be the one evicted");
});

// ---- Fix #3 ----
test('prune cannot delete a shard that a concurrent write just refreshed', async () => {
  await store.writeMemory('config/project-purge-days', '1');
  const repoDir = path.join(tmpDir, 'repo-race');
  await mkdir(repoDir, { recursive: true });
  const projectId = store.resolveProjectId(repoDir);
  const shardPath = path.join(tmpDir, 'projects', `${projectId}.json`);

  for (let iter = 0; iter < 12; iter++) {
    await store.writeMemory('k', 'v', { scope: 'project', project: projectId });
    // Backdate the shard so prune considers it expired.
    const shard = JSON.parse(await readFile(shardPath, 'utf8'));
    shard._meta.lastTouchedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await writeFile(shardPath, JSON.stringify(shard));

    // Race a prune (via loadDigest) against a fresh write to the same shard.
    await Promise.all([
      store.loadDigest({ cwd: tmpDir }),
      store.writeMemory('k2', 'v2', { scope: 'project', project: projectId }),
    ]);

    // The write must never be lost: either prune skipped (fresh under lock) or it deleted first and
    // the write recreated the shard. Either way k2 is present.
    assert.ok(existsSync(shardPath), `iter ${iter}: shard should exist after the write`);
    const after = JSON.parse(await readFile(shardPath, 'utf8'));
    assert.equal(after.entries['k2']?.value, 'v2', `iter ${iter}: the concurrent write must not be lost`);

    await rm(shardPath, { force: true }); // reset for next iteration
  }
});

// ---- Fix #4 ----
test('maintenance is throttled: a second loadDigest within the interval skips pruning', async () => {
  process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS = String(60 * 60 * 1000); // 1h throttle
  await store.writeMemory('config/project-purge-days', '1');

  await store.loadDigest({ cwd: tmpDir }); // first run: performs maintenance, writes the marker

  // Create an expired shard AFTER maintenance already ran this interval.
  const repoDir = path.join(tmpDir, 'repo-throttle');
  await mkdir(repoDir, { recursive: true });
  const projectId = store.resolveProjectId(repoDir);
  const shardPath = path.join(tmpDir, 'projects', `${projectId}.json`);
  await store.writeMemory('k', 'v', { scope: 'project', project: projectId });
  const shard = JSON.parse(await readFile(shardPath, 'utf8'));
  shard._meta.lastTouchedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  await writeFile(shardPath, JSON.stringify(shard));

  await store.loadDigest({ cwd: tmpDir }); // within the interval -> throttled, no prune
  assert.ok(existsSync(shardPath), 'a throttled loadDigest must not prune');

  process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS = '0'; // un-throttle
  await store.loadDigest({ cwd: tmpDir });
  assert.equal(existsSync(shardPath), false, 'once un-throttled, the expired shard is pruned');
});
