// Worker fixture for test/concurrency.test.js -- run as its own process, not imported. Writes the
// same key repeatedly, standing in for a separate MCP server instance or hook process hammering
// the shared store, which is the actual scenario DESIGN.md §11e's locking is meant to survive.

import { writeMemory } from '../../src/store.js';

const [, , key, iterationsRaw, prefix] = process.argv;
const iterations = parseInt(iterationsRaw, 10);

for (let i = 0; i < iterations; i++) {
  await writeMemory(key, `${prefix}-${i}`);
}
