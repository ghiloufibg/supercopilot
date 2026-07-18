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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const NETWORK_MODULES = ['http', 'https', 'net', 'dgram', 'tls', 'dns'];
const FORBIDDEN_PATTERN = new RegExp(
  `\\b(require\\(['"](${NETWORK_MODULES.join('|')})(/[^'"]*)?['"]\\)|from\\s+['"](${NETWORK_MODULES.join('|')})(/[^'"]*)?['"]|\\bfetch\\s*\\()`,
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

test('the MCP SDK stdio transport module has no network-capable imports', async () => {
  await assertNoNetworkImports('node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js');
});
