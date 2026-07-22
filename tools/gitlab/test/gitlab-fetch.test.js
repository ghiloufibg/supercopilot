import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runGitlab, formatShow, formatList, formatDiscussions } from '../gitlab-fetch.js';

const ENV_KEYS = ['GITLAB_BASE_URL', 'GITLAB_API_TOKEN'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.GITLAB_BASE_URL = 'https://gitlab.example.com';
  process.env.GITLAB_API_TOKEN = 'secret-token';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

// Each queued response is { json } or { text }, optionally { headers: { 'x-total': '42' } } or
// { ok: false, status, statusText, text }. Mirrors jira-fetch.test.js's fakeFetch shape, extended
// with a headers.get() lookup for GitLab's header-based pagination (TOOLS-DESIGN.md §6c).
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const resp = responses.shift();
    return {
      ok: resp.ok !== false,
      status: resp.status || 200,
      statusText: resp.statusText || 'OK',
      json: async () => resp.json,
      text: async () => (resp.text !== undefined ? resp.text : JSON.stringify(resp.json)),
      headers: { get: (name) => (resp.headers ? resp.headers[name.toLowerCase()] : undefined) },
    };
  };
  impl.calls = calls;
  return impl;
}

test('formatShow renders scalar fields and skips noisy keys', () => {
  const digest = formatShow({
    id: 42,
    name: 'Fix the thing',
    avatar_url: 'https://example.com/a.png',
    description_html: '<p>x</p>',
    _links: { self: 'x' },
    permissions: { project_access: null },
    author: { name: 'Jane Doe', username: 'jdoe' },
  });
  assert.match(digest, /id: 42/);
  assert.match(digest, /author: Jane Doe \(@jdoe\)/);
  assert.doesNotMatch(digest, /avatar_url/);
  assert.doesNotMatch(digest, /description_html/);
  assert.doesNotMatch(digest, /_links/);
  assert.doesNotMatch(digest, /permissions/);
});

test('formatList reports zero results distinctly and uses a total header when given one', () => {
  assert.equal(formatList('project', [], undefined), 'Found 0 result(s).');
  const digest = formatList('project', [{ id: 1, path_with_namespace: 'ns/proj', default_branch: 'main' }], '17');
  assert.match(digest, /Found 17 total \(showing 1\)/);
  assert.match(digest, /1\tns\/proj\tmain/);
});

test('formatList falls back to a plain count when no total header is present', () => {
  const digest = formatList('project', [{ id: 1, path_with_namespace: 'ns/proj', default_branch: 'main' }], undefined);
  assert.match(digest, /Found 1 result\(s\)/);
});

test('formatDiscussions flattens notes across discussions and reports none distinctly', () => {
  assert.equal(formatDiscussions([]), 'No comments.');
  const digest = formatDiscussions([
    { id: 'd1', notes: [{ author: { name: 'Jane' }, created_at: '2024-01-01T00:00:00Z', body: 'Looks good.' }] },
  ]);
  assert.match(digest, /Jane:/);
  assert.match(digest, /Looks good\./);
});

test('runGitlab sends the token as a bare PRIVATE-TOKEN header, not Basic auth', async () => {
  const fetchImpl = fakeFetch([{ json: { id: 1, name: 'proj' } }]);
  await runGitlab(['project', 'show', '1'], { fetchImpl });
  const { init } = fetchImpl.calls[0];
  assert.equal(init.headers['PRIVATE-TOKEN'], 'secret-token');
  assert.equal(init.headers.Authorization, undefined);
});

test('runGitlab "project show" URL-encodes a namespace/project path against /api/v4', async () => {
  const fetchImpl = fakeFetch([{ json: { id: 1 } }]);
  await runGitlab(['project', 'show', 'my-group/my-project'], { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /\/api\/v4\/projects\/my-group%2Fmy-project$/);
});

test('runGitlab "mr show" splits the project:iid compound token', async () => {
  const fetchImpl = fakeFetch([{ json: { iid: 5, title: 'T' } }]);
  await runGitlab(['mr', 'show', 'my-group/my-project:5'], { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /\/projects\/my-group%2Fmy-project\/merge_requests\/5$/);
});

test('runGitlab "mr list" maps --state and --author to GitLab query params', async () => {
  const fetchImpl = fakeFetch([{ json: [], headers: { 'x-total': '0' } }]);
  await runGitlab(['mr', 'list', 'proj', '--state=opened', '--author=jdoe'], { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /state=opened/);
  assert.match(fetchImpl.calls[0].url, /author_username=jdoe/);
});

test('runGitlab "mr comments" flattens discussions via formatDiscussions', async () => {
  const fetchImpl = fakeFetch([
    { json: [{ notes: [{ author: { name: 'Jane' }, created_at: 't', body: 'Ship it.' }] }] },
  ]);
  const output = await runGitlab(['mr', 'comments', 'proj:5'], { fetchImpl });
  assert.match(output, /Ship it\./);
  assert.match(fetchImpl.calls[0].url, /merge_requests\/5\/discussions$/);
});

test('runGitlab "file show" returns raw text, not JSON-parsed', async () => {
  const fetchImpl = fakeFetch([{ text: 'export const x = 1;\n' }]);
  const output = await runGitlab(['file', 'show', 'proj', 'src/index.js', '--ref=main'], { fetchImpl });
  assert.equal(output, 'export const x = 1;\n');
  assert.match(fetchImpl.calls[0].url, /repository\/files\/src%2Findex\.js\/raw\?ref=main$/);
});

test('runGitlab "job log" returns the raw trace text', async () => {
  const fetchImpl = fakeFetch([{ text: 'Running job...\nDone.' }]);
  const output = await runGitlab(['job', 'log', 'proj:123'], { fetchImpl });
  assert.equal(output, 'Running job...\nDone.');
  assert.match(fetchImpl.calls[0].url, /jobs\/123\/trace$/);
});

test('runGitlab "search run" scopes to a project, group, or the whole instance based on flags', async () => {
  const fetchImpl = fakeFetch([
    { json: [], headers: { 'x-total': '0' } },
    { json: [], headers: { 'x-total': '0' } },
    { json: [], headers: { 'x-total': '0' } },
  ]);
  await runGitlab(['search', 'run', 'issues', 'bug', '--project=proj'], { fetchImpl });
  await runGitlab(['search', 'run', 'issues', 'bug', '--group=grp'], { fetchImpl });
  await runGitlab(['search', 'run', 'issues', 'bug'], { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /\/projects\/proj\/search\?scope=issues&search=bug/);
  assert.match(fetchImpl.calls[1].url, /\/groups\/grp\/search\?scope=issues&search=bug/);
  assert.match(fetchImpl.calls[2].url, /\/api\/v4\/search\?scope=issues&search=bug/);
});

test('runGitlab rejects an unknown resource before making any request', async () => {
  const fetchImpl = fakeFetch([]);
  await assert.rejects(() => runGitlab(['bogus', 'show', 'x'], { fetchImpl }), /Unknown resource "bogus"/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('runGitlab rejects an unknown action for a known resource before making any request', async () => {
  const fetchImpl = fakeFetch([]);
  await assert.rejects(() => runGitlab(['project', 'delete', 'x'], { fetchImpl }), /Unknown action "delete"/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('runGitlab surfaces a clear error when required env vars are missing', async () => {
  delete process.env.GITLAB_API_TOKEN;
  await assert.rejects(() => runGitlab(['project', 'show', '1'], { fetchImpl: fakeFetch([]) }), /GITLAB_API_TOKEN/);
});

test('runGitlab surfaces non-2xx responses without leaking the token', async () => {
  const fetchImpl = fakeFetch([{ ok: false, status: 404, statusText: 'Not Found', text: 'project not found' }]);
  await assert.rejects(async () => runGitlab(['project', 'show', '999'], { fetchImpl }), (err) => {
    assert.match(err.message, /404/);
    assert.doesNotMatch(err.message, /secret-token/);
    return true;
  });
});
