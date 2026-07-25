// The actual exit criterion for sub-phase 3b-2 (DESIGN.md §11i): "two processes issuing
// concurrent write_memory calls against the same key in a loop; confirm zero lost updates and
// zero corrupted JSON." Real separate node processes, not concurrent promises within one process
// -- an in-process test would only exercise the FIFO queue, not the cross-process file lock this
// phase actually adds.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

let tmpDir;
const WORKER = path.resolve(import.meta.dirname, 'fixtures', 'write-loop.js');

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'memory-concurrency-test-'));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function runWorker(prefix, iterations) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [WORKER, 'race/key', String(iterations), prefix], {
      env: { ...process.env, COPILOT_MEMORY_DIR: tmpDir },
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${prefix} exited with code ${code}`))));
    child.on('error', reject);
  });
}

test('concurrent writers across separate processes never corrupt the shard file or lose an update', async () => {
  const prefixes = ['p0', 'p1', 'p2', 'p3'];
  await Promise.all(prefixes.map((p) => runWorker(p, 20)));

  const raw = await readFile(path.join(tmpDir, 'global.json'), 'utf8');
  const data = JSON.parse(raw); // throws if the file is corrupted -- the primary assertion here
  const entry = data.entries['race/key'];
  assert.ok(entry, 'key should exist after concurrent writes');
  assert.match(
    entry.value,
    /^p[0-3]-\d+$/,
    `final value should be one of the legitimately written values, not truncated/merged garbage -- got ${JSON.stringify(entry.value)}`
  );

  const files = await readdir(tmpDir);
  assert.ok(!files.some((f) => f.endsWith('.lock')), `lock files should be cleaned up after use, found: ${files.join(', ')}`);
});

test('concurrent writers to different keys across separate processes do not clobber each other', async () => {
  const workers = ['k0', 'k1', 'k2', 'k3'].map((k, i) =>
    new Promise((resolve, reject) => {
      const child = spawn('node', [WORKER, `distinct/${k}`, '10', `val${i}`], {
        env: { ...process.env, COPILOT_MEMORY_DIR: tmpDir },
        stdio: 'inherit',
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${k} exited with code ${code}`))));
      child.on('error', reject);
    })
  );
  await Promise.all(workers);

  const data = JSON.parse(await readFile(path.join(tmpDir, 'global.json'), 'utf8'));
  for (let i = 0; i < 4; i++) {
    const entry = data.entries[`distinct/k${i}`];
    assert.ok(entry, `distinct/k${i} should exist`);
    assert.equal(entry.value, `val${i}-9`, `distinct/k${i} should hold its own worker's final value, not another worker's`);
  }
});
