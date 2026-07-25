// Local-only, sharded JSON file store (DESIGN.md §11e). No network imports anywhere in this file
// -- that's the whole point (DESIGN.md §5b: "must be zero outbound network calls, local file
// store only"). The network-isolation test (test/network-isolation.test.js) statically checks
// this file and its dependency tree never require()/import a network-capable module. Shelling out
// to the local `git` binary (resolveProjectId) is not a network call and isn't flagged by that
// check -- same class of local-subprocess use as scripts/deploy-global.js's own execFileSync.
//
// Storage is GLOBAL BY DESIGN, split into shards (Revision: DESIGN.md §11e, superseding the single
// flat memory.json used through sub-phase 3b-1):
//   global.json                     -- scope: "global" entries, loaded into every session, everywhere
//   projects/<project-id>.json      -- scope: "project" entries, one file per repo
//   archive/global-overflow.jsonl   -- global entries evicted by the LRU cap, appended, not deleted
// Project shards untouched for 90 days are hard-deleted, not archived -- a direct, explicit
// product decision (see pruneExpiredProjectShards below), not a conservative default.
//
// Concurrency: two mechanisms, doing two different jobs.
//   1. `serialized()` -- an in-memory FIFO queue, scoped to THIS process only. Cheap, and closes
//      the original same-process "read jumps ahead of an in-flight write" bug (see its own
//      comment below) that this store has guarded against since before sharding existed.
//   2. `withFileLock()` -- a real advisory file lock (exclusive `wx` create on a `<file>.lock`
//      sibling). This is what actually protects against a SEPARATE process (another MCP server
//      instance, or a hook script) doing a concurrent read-modify-write on the same shard --
//      the in-memory queue alone never covered this. Found during the risnake-comparison design
//      review, not hypothetical: two Copilot sessions open in two different repos already share
//      this store today. Every write also goes through atomic replace (write a temp file, then
//      rename() over the target -- atomic on both POSIX and NTFS) so a reader can never observe a
//      half-written file even without the lock; the lock's actual job is preventing *lost
//      updates* (two writers both reading stale state, one silently overwriting the other's
//      change), which atomic rename alone does not fix.

import { readFile, writeFile, mkdir, rename, rm, stat, open, readdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const STORE_DIR = process.env.COPILOT_MEMORY_DIR || path.join(os.homedir(), '.copilot', 'memory-data');
const LEGACY_STORE_FILE = path.join(STORE_DIR, 'memory.json');
const GLOBAL_FILE = path.join(STORE_DIR, 'global.json');
const PROJECTS_DIR = path.join(STORE_DIR, 'projects');
const ARCHIVE_DIR = path.join(STORE_DIR, 'archive');
const GLOBAL_OVERFLOW_LOG = path.join(ARCHIVE_DIR, 'global-overflow.jsonl');
const SESSIONS_DIR = path.join(STORE_DIR, 'sessions');
const LAST_WRITE_MARKER = path.join(STORE_DIR, '.last-write-at');
const SESSION_MARKER_STALE_MS = 24 * 60 * 60 * 1000;
const NUDGED_DIR = path.join(STORE_DIR, '.nudged');
const NUDGE_STALE_MS = 24 * 60 * 60 * 1000;
const NUDGE_DURATION_TRIGGER_MS = 10 * 60 * 1000;
const NUDGE_MIN_TURNS = 3;

const DEFAULT_PROJECT_PURGE_DAYS = 90;
const DEFAULT_GLOBAL_CAP = 50;
const LOCK_STALE_MS = 5000;
const LOCK_MAX_WAIT_MS = 2000;

function projectFilePath(projectId) {
  return path.join(PROJECTS_DIR, `${projectId}.json`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Locking + atomic writes ----

async function acquireLock(filePath) {
  const lockPath = `${filePath}.lock`;
  // A new project shard's directory (projects/) may not exist yet on its very first write --
  // `open(..., 'wx')` doesn't create parent directories, so without this the first lock attempt
  // on a brand-new shard fails with ENOENT before it ever gets to the EEXIST-retry logic below.
  await mkdir(path.dirname(lockPath), { recursive: true });
  const start = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.close();
      return lockPath;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const s = await stat(lockPath);
        if (Date.now() - s.mtimeMs > LOCK_STALE_MS) {
          await rm(lockPath, { force: true }); // crashed holder -- reclaim and retry immediately
          continue;
        }
      } catch {
        continue; // lock vanished between EEXIST and stat (released concurrently) -- retry
      }
      if (Date.now() - start > LOCK_MAX_WAIT_MS) {
        throw new Error(`memory store: timed out waiting for lock on ${filePath}`);
      }
      await sleep(15 + Math.random() * 35); // jittered retry
    }
  }
}

async function releaseLock(lockPath) {
  await rm(lockPath, { force: true }).catch(() => {});
}

async function withFileLock(filePath, fn) {
  const lockPath = await acquireLock(filePath);
  try {
    return await fn();
  } finally {
    await releaseLock(lockPath);
  }
}

async function atomicWriteJSON(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}

async function readJSON(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    // Corrupt file shouldn't crash the server -- start fresh rather than fail every call (same
    // posture the original flat-file store already had).
    return fallback;
  }
}

// ---- Shard readers ----

function emptyProjectShard(projectId) {
  const now = new Date().toISOString();
  return { _meta: { project: projectId, createdAt: now, lastTouchedAt: now }, entries: {} };
}

async function readGlobalShard() {
  return readJSON(GLOBAL_FILE, { entries: {} });
}

async function readProjectShard(projectId) {
  return readJSON(projectFilePath(projectId), emptyProjectShard(projectId));
}

// ---- One-time legacy migration (flat memory.json -> global.json) ----

let migrationChecked = false;
async function ensureMigrated() {
  if (migrationChecked) return;
  if (existsSync(GLOBAL_FILE) || !existsSync(LEGACY_STORE_FILE)) {
    migrationChecked = true;
    return;
  }
  await withFileLock(GLOBAL_FILE, async () => {
    if (existsSync(GLOBAL_FILE)) return; // another process migrated first
    const legacy = await readJSON(LEGACY_STORE_FILE, {});
    const now = new Date().toISOString();
    const entries = {};
    for (const [key, entry] of Object.entries(legacy)) {
      entries[key] = { value: entry.value, updatedAt: entry.updatedAt || now, lastReadAt: null, scope: 'global' };
    }
    await atomicWriteJSON(GLOBAL_FILE, { entries });
    // Renamed, not deleted -- recoverable if migration ever needs inspecting or redoing.
    await rename(LEGACY_STORE_FILE, `${LEGACY_STORE_FILE}.migrated`).catch(() => {});
  });
  migrationChecked = true;
}

// ---- Project id resolution ----

export function resolveProjectId(cwd) {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return slugify(normalizeRemote(remote));
  } catch {
    return slugify(path.basename(path.resolve(cwd)));
  }
}

function normalizeRemote(remote) {
  return remote
    .replace(/^git@([^:]+):/, 'https://$1/') // git@host:owner/repo -> https://host/owner/repo
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '')
    .replace(/^(https?:\/\/)[^@/]*@/, '$1') // strip embedded credentials
    .toLowerCase();
}

function slugify(input) {
  const clean = input.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const hash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
  return `${clean.slice(0, 40) || 'project'}-${hash}`;
}

// ---- Config overrides -- ordinary global-scope entries, DESIGN.md §11d's escape-hatch
// convention (e.g. write_memory("config/project-purge-days", "30")). ----

function readConfigInt(entries, key, fallback) {
  const raw = entries[key]?.value;
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ---- Serialization (in-process ordering only -- see file header for what this does and doesn't
// protect against) ----

let operationQueue = Promise.resolve();
function serialized(fn) {
  const result = operationQueue.then(fn);
  // Swallow rejections in the queue chain itself so one failed operation doesn't wedge every
  // later one -- the caller of serialized() still gets the real rejection via `result`.
  operationQueue = result.catch(() => {});
  return result;
}

// ---- Public API ----
// scope/project are additive and optional (DESIGN.md §11e) -- omitted, every call defaults to
// "global" exactly as before sharding existed, so no existing caller needs to change.

function resolveScope(opts) {
  const scope = opts.scope === 'project' ? 'project' : 'global';
  const project = scope === 'project' ? opts.project || resolveProjectId(process.cwd()) : undefined;
  const filePath = scope === 'project' ? projectFilePath(project) : GLOBAL_FILE;
  return { scope, project, filePath };
}

export async function writeMemory(key, value, opts = {}) {
  await ensureMigrated();
  const { scope, project, filePath } = resolveScope(opts);

  return serialized(() =>
    withFileLock(filePath, async () => {
      const data = scope === 'project' ? await readProjectShard(project) : await readGlobalShard();
      const now = new Date().toISOString();
      const previous = data.entries[key];
      data.entries[key] = {
        value,
        updatedAt: now,
        lastReadAt: previous ? previous.lastReadAt : null,
        scope,
        ...(scope === 'project' ? { project } : {}),
      };
      if (scope === 'project') data._meta.lastTouchedAt = now;
      await atomicWriteJSON(filePath, data);
      // Best-effort activity marker for shouldWriteCheckpoint() (DESIGN.md §11d, sub-phase
      // 3b-3) -- sessionEnd has no transcript to inspect, so "did anything get saved this
      // session" is inferred from this timestamp instead. Not lock-protected: a slightly stale
      // read under heavy concurrency only affects a heuristic, not data integrity.
      await mkdir(STORE_DIR, { recursive: true });
      await writeFile(LAST_WRITE_MARKER, now, 'utf8').catch(() => {});
      return { key, updatedAt: now };
    })
  );
}

export async function readMemory(key, opts = {}) {
  await ensureMigrated();
  const { scope, project, filePath } = resolveScope(opts);

  return serialized(() =>
    withFileLock(filePath, async () => {
      const data = scope === 'project' ? await readProjectShard(project) : await readGlobalShard();
      const entry = data.entries[key];
      if (!entry) return { key, found: false, value: null };
      return { key, found: true, value: entry.value, updatedAt: entry.updatedAt };
    })
  );
}

export async function listMemories(opts = {}) {
  await ensureMigrated();
  if (opts.scope === 'project') {
    const project = opts.project || resolveProjectId(process.cwd());
    const data = await readProjectShard(project);
    return Object.keys(data.entries).map((key) => ({ key, updatedAt: data.entries[key].updatedAt }));
  }
  if (opts.scope === 'global') {
    const data = await readGlobalShard();
    return Object.keys(data.entries).map((key) => ({ key, updatedAt: data.entries[key].updatedAt }));
  }
  // No scope given -- aggregate everything, matching the original (pre-sharding) no-arg contract.
  const global = await readGlobalShard();
  const result = Object.keys(global.entries).map((key) => ({ key, updatedAt: global.entries[key].updatedAt }));
  if (existsSync(PROJECTS_DIR)) {
    for (const file of await readdir(PROJECTS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const data = await readJSON(path.join(PROJECTS_DIR, file), { entries: {} });
      result.push(...Object.keys(data.entries).map((key) => ({ key, updatedAt: data.entries[key].updatedAt })));
    }
  }
  return result;
}

export async function deleteMemory(key, opts = {}) {
  await ensureMigrated();
  const { scope, project, filePath } = resolveScope(opts);

  return serialized(() =>
    withFileLock(filePath, async () => {
      const data = scope === 'project' ? await readProjectShard(project) : await readGlobalShard();
      const existed = key in data.entries;
      delete data.entries[key];
      await atomicWriteJSON(filePath, data);
      return { key, deleted: existed };
    })
  );
}

// Internal helper, not an MCP tool (DESIGN.md §11d: the hook CLI calls store.js functions
// directly, no MCP round-trip). Values included, unlike listMemories(). Same scope rules.
export async function listMemoriesWithValues(opts = {}) {
  await ensureMigrated();
  const collect = (data) =>
    Object.entries(data.entries).map(([key, e]) => ({ key, value: e.value, updatedAt: e.updatedAt }));

  let out;
  if (opts.scope === 'project') {
    out = collect(await readProjectShard(opts.project || resolveProjectId(process.cwd())));
  } else if (opts.scope === 'global') {
    out = collect(await readGlobalShard());
  } else {
    out = collect(await readGlobalShard());
    if (existsSync(PROJECTS_DIR)) {
      for (const file of await readdir(PROJECTS_DIR)) {
        if (file.endsWith('.json')) out.push(...collect(await readJSON(path.join(PROJECTS_DIR, file), { entries: {} })));
      }
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

// ---- Lifecycle maintenance (DESIGN.md §11e) -- runs opportunistically inside loadDigest(), no
// separate cron/schedule infrastructure needed. Two independent jobs. ----

async function pruneExpiredProjectShards(purgeDays) {
  if (!existsSync(PROJECTS_DIR)) return;
  const cutoff = Date.now() - purgeDays * 24 * 60 * 60 * 1000;
  for (const file of await readdir(PROJECTS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(PROJECTS_DIR, file);
    const data = await readJSON(filePath, null);
    const lastTouched = data?._meta?.lastTouchedAt ? Date.parse(data._meta.lastTouchedAt) : null;
    if (lastTouched !== null && lastTouched < cutoff) {
      // Decided, not a conservative default: hard delete, no archive (DESIGN.md §11e).
      await rm(filePath, { force: true });
    }
  }
}

async function evictGlobalOverflow(cap) {
  return withFileLock(GLOBAL_FILE, async () => {
    const data = await readGlobalShard();
    const keys = Object.keys(data.entries);
    if (keys.length <= cap) return;

    const ranked = keys
      .map((key) => ({ key, ...data.entries[key] }))
      .sort((a, b) => {
        const aRead = a.lastReadAt || a.updatedAt;
        const bRead = b.lastReadAt || b.updatedAt;
        return aRead < bRead ? -1 : aRead > bRead ? 1 : 0; // least-recently-read first
      });
    const evicted = ranked.slice(0, keys.length - cap);

    await mkdir(ARCHIVE_DIR, { recursive: true });
    const lines = evicted.map((e) =>
      JSON.stringify({ key: e.key, value: e.value, updatedAt: e.updatedAt, lastReadAt: e.lastReadAt, archivedAt: new Date().toISOString() })
    );
    if (lines.length > 0) await appendFile(GLOBAL_OVERFLOW_LOG, lines.join('\n') + '\n', 'utf8');

    for (const e of evicted) delete data.entries[e.key];
    await atomicWriteJSON(GLOBAL_FILE, data);
  });
}

// Builds the sessionStart digest: global entries + the current project's entries, most recently
// updated first, with opportunistic pruning/eviction folded in (DESIGN.md §11e/§11d). Marks
// lastReadAt only for entries actually surfaced here, not on ordinary read_memory calls, to avoid
// write-amplifying a read-heavy path.
export async function loadDigest({ cwd, maxEntries = 20 } = {}) {
  await ensureMigrated();

  const globalData = await readGlobalShard();
  const purgeDays = readConfigInt(globalData.entries, 'config/project-purge-days', DEFAULT_PROJECT_PURGE_DAYS);
  const globalCap = readConfigInt(globalData.entries, 'config/global-cap', DEFAULT_GLOBAL_CAP);

  await pruneExpiredProjectShards(purgeDays);
  await evictGlobalOverflow(globalCap);

  const projectId = cwd ? resolveProjectId(cwd) : null;
  const freshGlobal = await readGlobalShard();
  const projectData = projectId ? await readProjectShard(projectId) : { entries: {} };

  const combined = [
    ...Object.entries(freshGlobal.entries).map(([key, e]) => ({ key, ...e, scope: 'global' })),
    ...Object.entries(projectData.entries).map(([key, e]) => ({ key, ...e, scope: 'project', project: projectId })),
  ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

  const surfaced = combined.slice(0, maxEntries);

  if (surfaced.some((e) => e.scope === 'global')) {
    await withFileLock(GLOBAL_FILE, async () => {
      const data = await readGlobalShard();
      const now = new Date().toISOString();
      for (const e of surfaced) {
        if (e.scope === 'global' && data.entries[e.key]) data.entries[e.key].lastReadAt = now;
      }
      await atomicWriteJSON(GLOBAL_FILE, data);
    });
  }
  if (projectId && surfaced.some((e) => e.scope === 'project')) {
    await withFileLock(projectFilePath(projectId), async () => {
      const data = await readProjectShard(projectId);
      const now = new Date().toISOString();
      for (const e of surfaced) {
        if (e.scope === 'project' && data.entries[e.key]) data.entries[e.key].lastReadAt = now;
      }
      data._meta.lastTouchedAt = now;
      await atomicWriteJSON(projectFilePath(projectId), data);
    });
  }

  return surfaced;
}

// ---- sessionEnd checkpoint fallback (DESIGN.md §11d, sub-phase 3b-3) ----
//
// sessionEnd is notification-only and, per GitHub's documented payload for that event, doesn't
// receive a transcript path the way agentStop does -- so unlike the original §11d draft, this
// fallback cannot include a verbatim transcript tail; it records what sessionEnd actually gives
// us (session id, cwd, termination reason). Whether *anything* was saved this session is inferred
// from two small markers rather than transcript inspection: a per-session "started" marker
// (written by recordSessionStart, called from bin/memory-hook.js at sessionStart) and a global
// "last write" timestamp (touched by every successful writeMemory() call above). Not perfectly
// precise under heavily overlapping concurrent sessions -- a write from a *different* concurrent
// session can suppress this one's checkpoint -- but a reasonable approximation given what
// sessionEnd exposes, and it fails toward checkpointing (redundant, harmless) rather than
// silently skipping one when uncertain.

function sanitizeSessionId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || 'unknown';
}

function sessionMarkerPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sanitizeSessionId(sessionId)}.json`);
}

export async function recordSessionStart({ sessionId, cwd }) {
  if (!sessionId) return;
  await mkdir(SESSIONS_DIR, { recursive: true });
  const marker = { sessionId, cwd: cwd || null, startedAt: new Date().toISOString() };
  await writeFile(sessionMarkerPath(sessionId), JSON.stringify(marker), 'utf8');
}

async function pruneStaleSessionMarkers() {
  if (!existsSync(SESSIONS_DIR)) return;
  const cutoff = Date.now() - SESSION_MARKER_STALE_MS;
  for (const file of await readdir(SESSIONS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const p = path.join(SESSIONS_DIR, file);
    const data = await readJSON(p, null);
    const startedAt = data?.startedAt ? Date.parse(data.startedAt) : null;
    // A marker with no parseable startedAt, or older than the cutoff, is abandoned -- e.g. a
    // session that crashed before sessionEnd ever fired to consume it.
    if (startedAt === null || startedAt < cutoff) await rm(p, { force: true });
  }
}

// Consumes (deletes) the session's start marker as a side effect -- one-shot, matching the
// nudge sentinel's own "checked once, then gone" pattern (DESIGN.md §11d).
export async function shouldWriteCheckpoint(sessionId) {
  await pruneStaleSessionMarkers();

  if (!sessionId) return true; // no way to correlate -- checkpoint to be safe, not to lose data

  const markerPath = sessionMarkerPath(sessionId);
  let startedAt = null;
  if (existsSync(markerPath)) {
    const marker = await readJSON(markerPath, null);
    startedAt = marker?.startedAt || null;
    await rm(markerPath, { force: true });
  }
  if (!startedAt) return true; // sessionStart never recorded (or was already pruned) -- checkpoint

  const lastWriteAt = existsSync(LAST_WRITE_MARKER) ? (await readFile(LAST_WRITE_MARKER, 'utf8')).trim() : null;
  if (!lastWriteAt) return true; // nothing has ever been written -- definitely checkpoint

  return lastWriteAt < startedAt; // a write at/after this session's start suppresses the fallback
}

export async function writeCheckpoint({ sessionId, cwd, reason }) {
  const timestamp = new Date().toISOString();
  const note =
    'Auto-generated fallback checkpoint -- no write_memory call was made during this session. ' +
    'Lower fidelity than a model-authored memory (DESIGN.md §11d).';
  const value = JSON.stringify({ sessionId: sessionId || null, cwd: cwd || null, reason: reason || null, note });

  if (cwd) {
    const project = resolveProjectId(cwd);
    return writeMemory(`checkpoint/${project}/${timestamp}`, value, { scope: 'project', project });
  }
  return writeMemory(`checkpoint/unknown/${timestamp}`, value, { scope: 'global' });
}

// ---- agentStop nudge (DESIGN.md §11d, sub-phase 3b-4) ----
//
// Highest-risk piece of the pipeline (§11i) -- shipped last, and never without its own
// off-switch (write_memory("config/nudge", "off")) already in place. Deliberately fails toward
// *not* nudging whenever a decision can't be made safely: no session id means no way to dedupe a
// repeat nudge, so it fails closed here -- the opposite direction from writeCheckpoint() above,
// which fails toward an extra (harmless) checkpoint when uncertain. The asymmetry is intentional:
// a missed checkpoint can lose data, but a missed nudge just means the model wasn't reminded --
// low cost -- while an undedupable *repeated* nudge risks tripping the CLI's 8-consecutive-block
// runaway guard or simply annoying the user every turn.

async function pruneStaleNudgeSentinels() {
  if (!existsSync(NUDGED_DIR)) return;
  const cutoff = Date.now() - NUDGE_STALE_MS;
  for (const file of await readdir(NUDGED_DIR)) {
    const p = path.join(NUDGED_DIR, file);
    const s = await stat(p).catch(() => null);
    if (!s || s.mtimeMs < cutoff) await rm(p, { force: true });
  }
}

// Takes transcript-derived signals as plain booleans/numbers rather than reading the transcript
// itself -- transcript parsing is genuinely format-uncertain (DESIGN.md §11h) and stays the hook
// script's concern (bin/memory-nudge-hook.js), not storage's.
export async function shouldNudge({ sessionId, hadSideEffectTool, turnCount, alreadyBlocked }) {
  if (alreadyBlocked) return false; // never block twice in a row, regardless of anything else

  const globalData = await readGlobalShard();
  if (globalData.entries['config/nudge']?.value === 'off') return false; // explicit escape hatch

  if (!sessionId) return false; // can't dedupe -- fail toward silence, not a repeat-block risk

  await pruneStaleNudgeSentinels();
  await mkdir(NUDGED_DIR, { recursive: true });
  const sentinelPath = path.join(NUDGED_DIR, `${sanitizeSessionId(sessionId)}.json`);
  if (existsSync(sentinelPath)) return false; // already nudged this session

  let durationTrigger = false;
  const marker = await readJSON(sessionMarkerPath(sessionId), null);
  if (marker?.startedAt) {
    durationTrigger = Date.now() - Date.parse(marker.startedAt) > NUDGE_DURATION_TRIGGER_MS;
  }

  const shouldFire = Boolean(hadSideEffectTool) || (turnCount || 0) >= NUDGE_MIN_TURNS || durationTrigger;
  if (!shouldFire) return false;

  // Sentinel creation is the last step of deciding to fire -- exclusive create makes this
  // idempotent even under a stray double-invocation of this same hook.
  try {
    const handle = await open(sentinelPath, 'wx');
    await handle.close();
  } catch (err) {
    if (err.code === 'EEXIST') return false; // lost a race with another invocation -- already nudged
    throw err;
  }
  return true;
}
