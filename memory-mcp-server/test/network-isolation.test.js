// Closes the gap found in the corporate-safety review: DESIGN.md §5b states "zero outbound
// network calls" as a hard requirement for this server, but that was only ever a promise to
// code-review it once. This makes it an actual, automated, re-run-on-every-change check.
//
// Scope, stated honestly: this statically checks OUR source files (src/store.js, src/index.js)
// for network-capable imports, and spot-checks that the SDK's stdio transport (the only SDK
// module we actually import) doesn't itself import networking modules — stdio transport is
// process stdin/stdout by protocol design, not sockets. It does NOT attempt a full supply-chain
// audit of every transitive dependency; that's a separate, ongoing concern, not something a unit
// test can fully close.
//
// It ALSO checks the shipped bundle, dist/index.js — the self-contained artifact deploy actually
// installs (the MCP SDK + zod, inlined by esbuild so the server deploys with no npm install). This
// is a stronger guarantee than the source-only checks above: the SDK's HTTP+SSE transports pull in
// express/cors/eventsource and their node:http/net imports, but tree-shaking from our two
// stdio-only entry imports drops all of that. This test fails if a future dependency bump (or a
// change that reaches a network-capable code path) starts pulling networking modules INTO the
// bundle we ship.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const NETWORK_MODULES = ['http', 'https', 'http2', 'net', 'dgram', 'tls', 'dns'];
// A module specifier is network-capable if it names one of the above, with or without the "node:"
// prefix and with or without a subpath (e.g. "node:dns/promises"). Anchored to an import/require/
// fetch site so bare occurrences of the words in strings, URLs, or identifiers don't false-match.
const MODULE_SPECIFIER = `(?:node:)?(?:${NETWORK_MODULES.join('|')})(?:/[^'"]*)?`;
const FORBIDDEN_PATTERN = new RegExp(
  `\\b(?:require\\(['"]${MODULE_SPECIFIER}['"]\\)|from\\s+['"]${MODULE_SPECIFIER}['"]|fetch\\s*\\()`,
);

async function assertNoNetworkImports(relativePath) {
  const filePath = path.resolve(import.meta.dirname, '..', relativePath);
  const content = await readFile(filePath, 'utf8');
  const match = content.match(FORBIDDEN_PATTERN);
  assert.equal(
    match,
    null,
    `${relativePath} appears to import a network-capable module or call fetch(): ${match?.[0]}`
  );
}

test('store.js has no network-capable imports', async () => {
  await assertNoNetworkImports('src/store.js');
});

test('index.js has no network-capable imports beyond the MCP SDK itself', async () => {
  await assertNoNetworkImports('src/index.js');
});

test('memory-hook.js has no network-capable imports', async () => {
  await assertNoNetworkImports('bin/memory-hook.js');
});

test('memory-checkpoint-hook.js has no network-capable imports', async () => {
  await assertNoNetworkImports('bin/memory-checkpoint-hook.js');
});

test('memory-nudge-hook.js has no network-capable imports', async () => {
  await assertNoNetworkImports('bin/memory-nudge-hook.js');
});

test('the MCP SDK stdio transport module has no network-capable imports', async () => {
  await assertNoNetworkImports('node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js');
});

test('the shipped bundle (dist/index.js) has no network-capable imports', async () => {
  const bundlePath = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
  assert.ok(
    existsSync(bundlePath),
    'dist/index.js is missing — it is the committed artifact deploy installs. Run "npm run build" to regenerate it.'
  );
  await assertNoNetworkImports('dist/index.js');
});
