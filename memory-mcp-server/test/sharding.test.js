// Sub-phase 3b-2 (DESIGN.md §11e): project-scoped storage isolation and lifecycle maintenance.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmpDir;

let prevMaintenanceInterval;

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'memory-sharding-test-'));
  process.env.COPILOT_MEMORY_DIR = tmpDir;
  // These tests share one store and call loadDigest across several tests, each expecting
  // prune/eviction to run. Disable the once/day maintenance throttle so every loadDigest performs
  // maintenance (the throttle itself is covered in store-lifecycle-fixes.test.js).
  prevMaintenanceInterval = process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS;
  process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS = '0';
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  if (prevMaintenanceInterval === undefined) delete process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS;
  else process.env.COPILOT_MEMORY_MAINTENANCE_MIN_INTERVAL_MS = prevMaintenanceInterval;
});

test('project-scoped writes land in their own shard, not global.json', async () => {
  const { writeMemory, readMemory, resolveProjectId } = await import('../src/store.js');
  const repoDir = path.join(tmpDir, 'repo-a');
  await mkdir(repoDir, { recursive: true }); // not a git repo -- resolveProjectId falls back to folder basename
  const projectId = resolveProjectId(repoDir);

  await writeMemory('proj/key', 'project value', { scope: 'project', project: projectId });
  const result = await readMemory('proj/key', { scope: 'project', project: projectId });
  assert.equal(result.found, true);
  assert.equal(result.value, 'project value');

  const shard = JSON.parse(await readFile(path.join(tmpDir, 'projects', `${projectId}.json`), 'utf8'));
  assert.equal(shard.entries['proj/key'].value, 'project value');

  const globalPath = path.join(tmpDir, 'global.json');
  const global = existsSync(globalPath) ? JSON.parse(await readFile(globalPath, 'utf8')) : { entries: {} };
  assert.equal(global.entries['proj/key'], undefined, 'project-scoped key must not leak into global.json');
});

test('loadDigest merges global and current-project entries; an unrelated repo never sees another repo\'s project entries', async () => {
  const { writeMemory, loadDigest, resolveProjectId } = await import('../src/store.js');
  const repoA = path.join(tmpDir, 'repo-load-a');
  const repoB = path.join(tmpDir, 'repo-load-b');
  await mkdir(repoA, { recursive: true });
  await mkdir(repoB, { recursive: true });

  await writeMemory('digest/global', 'seen everywhere');
  await writeMemory('digest/project-a', 'only in repo A', { scope: 'project', project: resolveProjectId(repoA) });

  const digestForA = await loadDigest({ cwd: repoA });
  assert.ok(digestForA.some((e) => e.key === 'digest/global'));
  assert.ok(digestForA.some((e) => e.key === 'digest/project-a'));

  const digestForB = await loadDigest({ cwd: repoB });
  assert.ok(digestForB.some((e) => e.key === 'digest/global'));
  assert.ok(!digestForB.some((e) => e.key === 'digest/project-a'), "repo B must not see repo A's project-scoped memory");
});

test('a project shard past the configured purge threshold is deleted during loadDigest', async () => {
  const { writeMemory, resolveProjectId } = await import('../src/store.js');
  const repoOld = path.join(tmpDir, 'repo-old');
  await mkdir(repoOld, { recursive: true });
  const projectId = resolveProjectId(repoOld);
  await writeMemory('stale/key', 'old value', { scope: 'project', project: projectId });
  await writeMemory('config/project-purge-days', '1'); // override the 90-day default for this test

  const shardPath = path.join(tmpDir, 'projects', `${projectId}.json`);
  const shard = JSON.parse(await readFile(shardPath, 'utf8'));
  shard._meta.lastTouchedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
  await writeFile(shardPath, JSON.stringify(shard));

  const { loadDigest } = await import('../src/store.js');
  await loadDigest({ cwd: tmpDir }); // pruning sweeps every project shard, not just the current cwd's

  assert.equal(existsSync(shardPath), false, 'project shard past the purge threshold should be deleted');
});

test('global entries beyond the soft cap are evicted LRU and archived, not silently dropped', async () => {
  const { writeMemory, loadDigest } = await import('../src/store.js');
  await writeMemory('config/global-cap', '5');
  for (let i = 0; i < 8; i++) {
    await writeMemory(`cap/key-${i}`, `value-${i}`);
  }
  await loadDigest({ cwd: tmpDir }); // triggers eviction

  const global = JSON.parse(await readFile(path.join(tmpDir, 'global.json'), 'utf8'));
  const capKeysRemaining = Object.keys(global.entries).filter((k) => k.startsWith('cap/key-'));
  assert.ok(capKeysRemaining.length <= 5, `expected at most 5 cap/key-* entries to remain, found ${capKeysRemaining.length}`);

  const overflow = await readFile(path.join(tmpDir, 'archive', 'global-overflow.jsonl'), 'utf8');
  assert.ok(overflow.trim().length > 0, 'evicted entries should be archived, not silently gone');
});
