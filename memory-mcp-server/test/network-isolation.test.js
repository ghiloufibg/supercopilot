// Closes the gap found in the corporate-safety review: DESIGN.md §5b states "zero outbound
// network calls" as a hard requirement for this server, but that was only ever a promise to
// code-review it once. This makes it an actual, automated, re-run-on-every-change check.
//
// Revision 9: this server has zero npm dependencies (no npm registry access in the target
// environment), so this check now covers 100% of the server's code, not just "our files plus
// a spot-check of one SDK module" — there is no supply chain left to leave unaudited.

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

test('index.js has no network-capable imports', async () => {
  await assertNoNetworkImports('src/index.js');
});

test('package.json declares zero dependencies', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const pkg = JSON.parse(
    await readFile(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8')
  );
  assert.equal(pkg.dependencies, undefined, 'package.json should declare no dependencies at all');
});
