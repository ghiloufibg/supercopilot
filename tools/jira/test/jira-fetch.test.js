import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runJira, formatIssue, formatSearchResults, formatComments } from '../jira-fetch.js';

const ENV_KEYS = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.JIRA_BASE_URL = 'https://example.atlassian.net';
  process.env.JIRA_EMAIL = 'me@example.com';
  process.env.JIRA_API_TOKEN = 'secret-token';
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
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  impl.calls = calls;
  return impl;
}

test('formatIssue renders key fields and flattens ADF description', () => {
  const digest = formatIssue({
    key: 'PROJ-1',
    fields: {
      summary: 'Fix the thing',
      status: { name: 'Open' },
      assignee: { displayName: 'Jane Doe' },
      priority: { name: 'High' },
      updated: '2024-01-01T00:00:00.000Z',
      description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Broken on load.' }] }] },
    },
  });
  assert.match(digest, /Key: PROJ-1/);
  assert.match(digest, /Assignee: Jane Doe/);
  assert.match(digest, /Broken on load\./);
});

test('formatIssue handles missing optional fields without throwing', () => {
  const digest = formatIssue({ key: 'PROJ-2', fields: {} });
  assert.match(digest, /Assignee: Unassigned/);
  assert.match(digest, /Description:\n—/);
});

test('formatSearchResults reports zero results distinctly from a list', () => {
  assert.equal(formatSearchResults({ issues: [], total: 0 }), 'Found 0 issues.');
  const digest = formatSearchResults({
    total: 1,
    issues: [{ key: 'PROJ-3', fields: { summary: 'X', status: { name: 'Done' }, assignee: null } }],
  });
  assert.match(digest, /Found 1 issue/);
  assert.match(digest, /PROJ-3\tDone\tUnassigned\tX/);
});

test('formatComments joins entries and flattens ADF bodies', () => {
  const digest = formatComments({
    comments: [
      {
        author: { displayName: 'Jane' },
        created: '2024-01-01T00:00:00.000Z',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Looks good.' }] }] },
      },
    ],
  });
  assert.match(digest, /Jane:/);
  assert.match(digest, /Looks good\./);
});

test('runJira "issue" sends a Basic auth header built from email:token', async () => {
  const fetchImpl = fakeFetch([{ key: 'PROJ-1', fields: { summary: 'S' } }]);
  await runJira(['issue', 'PROJ-1'], { fetchImpl });
  const { init } = fetchImpl.calls[0];
  const expected = `Basic ${Buffer.from('me@example.com:secret-token').toString('base64')}`;
  assert.equal(init.headers.Authorization, expected);
});

test('runJira "issue" restricts fields server-side in text mode, not in json mode', async () => {
  const fetchImpl = fakeFetch([{ key: 'PROJ-1', fields: {} }, { key: 'PROJ-1', fields: {} }]);
  await runJira(['issue', 'PROJ-1'], { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /fields=summary,status,assignee,priority,updated,description/);

  await runJira(['issue', 'PROJ-1', '--format=json'], { fetchImpl });
  assert.doesNotMatch(fetchImpl.calls[1].url, /fields=/);
});

test('runJira "search" URL-encodes the JQL', async () => {
  const fetchImpl = fakeFetch([{ issues: [], total: 0 }]);
  await runJira(['search', 'project = PROJ AND status = Open'], { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /jql=project%20%3D%20PROJ%20AND%20status%20%3D%20Open/);
});

test('runJira rejects an unknown subcommand before making any request', async () => {
  const fetchImpl = fakeFetch([]);
  await assert.rejects(() => runJira(['bogus', 'X'], { fetchImpl }), /Unknown subcommand "bogus"/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('runJira surfaces a clear error when required env vars are missing', async () => {
  delete process.env.JIRA_API_TOKEN;
  await assert.rejects(() => runJira(['issue', 'PROJ-1'], { fetchImpl: fakeFetch([]) }), /JIRA_API_TOKEN/);
});

test('runJira surfaces non-2xx responses without leaking the auth header', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    text: async () => 'issue does not exist',
  });
  await assert.rejects(async () => runJira(['issue', 'PROJ-404'], { fetchImpl }), (err) => {
    assert.match(err.message, /404/);
    assert.doesNotMatch(err.message, /secret-token/);
    return true;
  });
});
