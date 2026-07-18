// Local-only JSON file store. No network imports anywhere in this file — that's the whole
// point (DESIGN.md §5b: "must be zero outbound network calls, local file store only").
// The network-isolation test (test/network-isolation.test.js) statically checks this file
// and its dependency tree never require()/import a network-capable module.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const STORE_DIR = process.env.COPILOT_MEMORY_DIR || path.join(process.cwd(), '.copilot-memory');
const STORE_FILE = path.join(STORE_DIR, 'memory.json');

async function ensureStore() {
  if (!existsSync(STORE_DIR)) {
    await mkdir(STORE_DIR, { recursive: true });
  }
  if (!existsSync(STORE_FILE)) {
    await writeFile(STORE_FILE, JSON.stringify({}), 'utf8');
  }
}

async function loadAll() {
  await ensureStore();
  const raw = await readFile(STORE_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupt store shouldn't crash the server — start fresh rather than fail every call.
    return {};
  }
}

async function saveAll(data) {
  await ensureStore();
  await writeFile(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ALL four operations — reads included, not just writes — go through one strict FIFO queue.
// Two problems this fixes, both real and both caught by tests:
// (1) concurrent writes/deletes racing on read-modify-write and silently clobbering each other
//     (test/store.test.js's concurrent-write test);
// (2) a read jumping the queue ahead of an already-issued, still-in-flight write and returning
//     stale data — found live during manual smoke-testing (a write_memory call followed
//     immediately by a read_memory call for the same key came back `found: false`, because
//     only writes/deletes were serialized; reads went straight to disk regardless of what was
//     still queued ahead of them). Serializing reads too closes that gap.
let operationQueue = Promise.resolve();
function serialized(fn) {
  const result = operationQueue.then(fn);
  // Swallow rejections in the queue chain itself so one failed operation doesn't wedge every
  // later one — the caller of serialized() still gets the real rejection via `result`.
  operationQueue = result.catch(() => {});
  return result;
}

export async function writeMemory(key, value) {
  return serialized(async () => {
    const data = await loadAll();
    data[key] = { value, updatedAt: new Date().toISOString() };
    await saveAll(data);
    return { key, updatedAt: data[key].updatedAt };
  });
}

export async function readMemory(key) {
  return serialized(async () => {
    const data = await loadAll();
    if (!(key in data)) return { key, found: false, value: null };
    return { key, found: true, value: data[key].value, updatedAt: data[key].updatedAt };
  });
}

export async function listMemories() {
  return serialized(async () => {
    const data = await loadAll();
    return Object.keys(data).map((key) => ({ key, updatedAt: data[key].updatedAt }));
  });
}

export async function deleteMemory(key) {
  return serialized(async () => {
    const data = await loadAll();
    const existed = key in data;
    delete data[key];
    await saveAll(data);
    return { key, deleted: existed };
  });
}
