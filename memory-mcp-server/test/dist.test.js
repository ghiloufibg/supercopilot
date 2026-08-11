// Verifies the shipped bundle (dist/index.js) is actually self-contained and works with NO
// node_modules present -- the whole point of bundling for restricted/air-gapped deploys. Rather
// than running dist/index.js in place (where ./store.js would resolve to a nonexistent
// dist/store.js), this stages it exactly the way scripts/deploy-global.js does: the bundle as
// src/index.js and the real src/store.js beside it, in a throwaway directory that has no
// node_modules anywhere up its parent chain. If the bundle secretly still needed a bare
// dependency from node_modules, the spawn below would fail with a module-not-found error.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'dist', 'index.js');
const STORE = path.join(REPO, 'src', 'store.js');

let stageDir; // the "deployed" server: src/index.js (bundle) + src/store.js, no node_modules
let memDir; // separate on-disk store, so runs don't collide

before(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'memory-dist-test-'));
  stageDir = path.join(base, 'server');
  memDir = path.join(base, 'mem');
  await mkdir(path.join(stageDir, 'src'), { recursive: true });
  await mkdir(memDir, { recursive: true });
  await copyFile(BUNDLE, path.join(stageDir, 'src', 'index.js'));
  await copyFile(STORE, path.join(stageDir, 'src', 'store.js'));
  // type:module so Node treats the staged .js as ESM, mirroring the deps-free package.json
  // scripts/deploy-global.js writes.
  await writeFile(path.join(stageDir, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
});

after(async () => {
  if (stageDir) await rm(path.dirname(stageDir), { recursive: true, force: true });
});

// Drives the staged server over stdio with a batch of newline-delimited JSON-RPC messages and
// returns the parsed responses. Nothing here references the repo's node_modules -- cwd and the
// script path both sit under the throwaway stage dir.
function driveServer(messages) {
  const serverPath = path.join(stageDir, 'src', 'index.js');
  const res = spawnSync('node', [serverPath], {
    input: messages.map((m) => JSON.stringify(m)).join('\n') + '\n',
    encoding: 'utf8',
    cwd: stageDir,
    env: { ...process.env, COPILOT_MEMORY_DIR: memDir },
  });
  assert.equal(res.status, 0, `server exited non-zero: ${res.stderr}`);
  assert.equal(res.stderr.trim(), '', `server wrote to stderr: ${res.stderr}`);
  const responses = [];
  for (const line of res.stdout.trim().split('\n')) {
    if (line) responses.push(JSON.parse(line));
  }
  return responses;
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dist-test', version: '1' } },
};
const INITIALIZED = { jsonrpc: '2.0', method: 'notifications/initialized' };

test('the committed bundle exists', () => {
  assert.ok(existsSync(BUNDLE), 'dist/index.js is missing — run "npm run build" to regenerate it.');
});

test('the bundle starts with no node_modules and reports its alpha version', () => {
  const responses = driveServer([INIT]);
  const init = responses.find((r) => r.id === 1);
  assert.equal(init.result.serverInfo.name, 'copilot-superclaude-memory');
  assert.equal(init.result.serverInfo.version, '0.1.0-alpha.1');
});

test('the bundle exposes exactly the four memory tools', () => {
  const responses = driveServer([INIT, INITIALIZED, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }]);
  const list = responses.find((r) => r.id === 2);
  const names = list.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['delete_memory', 'list_memories', 'read_memory', 'write_memory']);
});

test('the bundle persists a memory that a later bundle process can read back', () => {
  driveServer([
    INIT,
    INITIALIZED,
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'write_memory', arguments: { key: 'dist/roundtrip', value: 'offline-ok' } } },
  ]);
  const responses = driveServer([
    INIT,
    INITIALIZED,
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_memory', arguments: { key: 'dist/roundtrip' } } },
  ]);
  const read = responses.find((r) => r.id === 2);
  const payload = JSON.parse(read.result.content[0].text);
  assert.equal(payload.found, true);
  assert.equal(payload.value, 'offline-ok');
});
