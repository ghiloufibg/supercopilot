import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runConfluence, formatPage, formatSearchResults, formatChildren } from '../confluence-fetch.js';

const ENV_KEYS = ['CONFLUENCE_BASE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.CONFLUENCE_BASE_URL = 'https://example.atlassian.net/wiki';
  process.env.CONFLUENCE_EMAIL = 'me@example.com';
  process.env.CONFLUENCE_API_TOKEN = 'secret-token';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const body = responses.shift();
    return { ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => JSON.stringify(body) };
  };
  impl.calls = calls;
  return impl;
}

test('formatPage renders key fields and strips storage-format HTML', () => {
  const digest = formatPage({
    id: '123',
    title: 'My Page',
    space: { key: 'TEAM' },
    version: { number: 5, when: '2024-01-01T00:00:00.000Z', by: { displayName: 'Jane Doe' } },
    body: { storage: { value: '<p>Hello <strong>world</strong></p>' } },
  });
  assert.match(digest, /ID: 123/);
  assert.match(digest, /Space: TEAM/);
  assert.match(digest, /\(v5\)/);
  assert.match(digest, /Hello world/);
  assert.doesNotMatch(digest, /<p>|<strong>/);
});

test('formatPage handles a page with no body without throwing', () => {
  const digest = formatPage({ id: '999', title: 'Empty', space: {}, version: {} });
  assert.match(digest, /Body:\n—/);
});

test('formatSearchResults reports zero results distinctly from a list', () => {
  assert.equal(formatSearchResults({ results: [], size: 0 }), 'Found 0 results.');
  const digest = formatSearchResults({
    size: 1,
    results: [{ id: '1', type: 'page', space: { key: 'TEAM' }, title: 'X' }],
  });
  assert.match(digest, /Found 1 result/);
  assert.match(digest, /1\tpage\tTEAM\tX/);
});

test('formatChildren lists id and title per child', () => {
  assert.equal(formatChildren({ results: [] }), 'No child pages.');
  const digest = formatChildren({ results: [{ id: '1', title: 'Child A' }, { id: '2', title: 'Child B' }] });
  assert.match(digest, /1\tChild A/);
  assert.match(digest, /2\tChild B/);
});

test('runConfluence "page" sends a Basic auth header built from email:token', async () => {
  const fetchImpl = fakeFetch([{ id: '1', title: 'T', space: {}, version: {} }]);
  await runConfluence(['page', '123'], { fetchImpl });
  const expected = `Basic ${Buffer.from('me@example.com:secret-token').toString('base64')}`;
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, expected);
});

test('runConfluence "page" requests body/space/version expansion', async () => {
  const fetchImpl = fakeFetch([{ id: '1', title: 'T', space: {}, version: {} }]);
  await runConfluence(['page', '123'], { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /expand=body\.storage,space,version/);
});

test('runConfluence "search" URL-encodes the CQL', async () => {
  const fetchImpl = fakeFetch([{ results: [], size: 0 }]);
  await runConfluence(['search', 'space = TEAM AND title ~ "Runbook"'], { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /cql=space%20%3D%20TEAM/);
});

test('runConfluence rejects an unknown subcommand before making any request', async () => {
  const fetchImpl = fakeFetch([]);
  await assert.rejects(() => runConfluence(['bogus', 'X'], { fetchImpl }), /Unknown subcommand "bogus"/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('runConfluence surfaces a clear error when required env vars are missing', async () => {
  delete process.env.CONFLUENCE_API_TOKEN;
  await assert.rejects(
    () => runConfluence(['page', '123'], { fetchImpl: fakeFetch([]) }),
    /CONFLUENCE_API_TOKEN/
  );
});

test('runConfluence surfaces non-2xx responses without leaking the auth header', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'no access' });
  await assert.rejects(async () => runConfluence(['page', '123'], { fetchImpl }), (err) => {
    assert.match(err.message, /403/);
    assert.doesNotMatch(err.message, /secret-token/);
    return true;
  });
});
