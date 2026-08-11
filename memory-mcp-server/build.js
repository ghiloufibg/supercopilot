// Bundles src/index.js into dist/index.js as a single, self-contained file so the deployed
// server needs NO `npm install` at deploy time -- see the "offline / restricted-registry
// deploy" rationale in the repo README and CLAUDE.md.
//
// Why this exists: the MCP SDK is a 90+ package dependency tree (it also ships express/cors/
// eventsource for its HTTP+SSE transports, which this stdio-only server never uses). In a
// corporate environment with the public npm registry blocked, the old deploy step -- which ran
// `npm install` inside the deployed copy -- simply failed. Bundling moves that dependency
// resolution to build time (here, on a machine that DOES have registry access); the committed
// dist/index.js that results carries every third-party dependency inlined.
//
// Two deliberate choices below:
//   1. esbuild tree-shakes from the two modules we actually import (server/mcp.js +
//      server/stdio.js). The HTTP/SSE transport code -- and with it express, cors, eventsource,
//      and every node:http/net import -- is unreachable and gets dropped. test/dist.test.js
//      asserts the resulting bundle contains zero network-capable imports, so the
//      "zero outbound network calls" property (DESIGN.md §5b) holds for the shipped artifact,
//      not just for our hand-written source.
//   2. ./store.js is marked external, NOT inlined. store.js has no third-party dependencies
//      (node builtins only), and the memory-automation hooks in bin/ import it directly. Keeping
//      it a single real file -- shipped beside the bundle -- means the server process and the
//      hook processes share ONE copy of the store logic, and network-isolation.test.js keeps
//      checking that one file exactly as before.

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(dir, 'src', 'index.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // Keep store.js out of the bundle -- it is shipped as a sibling file and shared with bin/ hooks.
  external: ['./store.js'],
  outfile: path.join(dir, 'dist', 'index.js'),
});

console.log('built dist/index.js (self-contained; ./store.js kept external, shipped alongside)');
