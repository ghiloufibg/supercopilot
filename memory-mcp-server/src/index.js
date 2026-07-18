#!/usr/bin/env node
// Memory MCP server (DESIGN.md §6 Tier B), rewritten dependency-free (Revision 9) — no npm
// registry access is available in the target environment, so this can no longer rely on
// @modelcontextprotocol/sdk (or anything else fetched from npm). This hand-rolls just enough
// of the MCP stdio JSON-RPC protocol to serve four tools: write_memory, read_memory,
// list_memories, delete_memory. Only Node.js built-ins are used — verify with
// `npm ls --prefix memory-mcp-server` (should error "no package.json dependencies") or just
// read this file: there is no import/require of anything outside node:*.

import { createInterface } from 'node:readline';
import { writeMemory, readMemory, listMemories, deleteMemory } from './store.js';

const TOOLS = [
  {
    name: 'write_memory',
    description: 'Persist a value under a key for cross-session recall. Local file store only, no network calls.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key, e.g. "session/context" or "plan/auth/hypothesis"' },
        value: { type: 'string', description: 'The value to store (serialize objects to a string first)' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'read_memory',
    description: 'Retrieve a previously stored value by key.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Memory key to look up' } },
      required: ['key'],
    },
  },
  {
    name: 'list_memories',
    description: 'List all stored memory keys with their last-updated timestamps.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_memory',
    description: 'Remove a stored memory by key.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Memory key to delete' } },
      required: ['key'],
    },
  },
];

const HANDLERS = {
  write_memory: async ({ key, value }) => writeMemory(key, value),
  read_memory: async ({ key }) => readMemory(key),
  list_memories: async () => listMemories(),
  delete_memory: async ({ key }) => deleteMemory(key),
};

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function result(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    result(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'copilot-superclaude-memory', version: '0.2.0-no-deps' },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    // Notification, no id, no response expected.
    return;
  }

  if (method === 'tools/list') {
    result(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params ?? {};
    const handler = HANDLERS[name];
    if (!handler) {
      error(id, -32602, `Unknown tool: ${name}`);
      return;
    }
    try {
      const toolResult = await handler(args ?? {});
      result(id, { content: [{ type: 'text', text: JSON.stringify(toolResult) }] });
    } catch (err) {
      error(id, -32000, `Tool execution failed: ${err.message}`);
    }
    return;
  }

  if (id !== undefined) {
    error(id, -32601, `Method not found: ${method}`);
  }
  // else: unknown notification, silently ignore per JSON-RPC convention.
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    // Malformed JSON on a line we can't even get an id from — per JSON-RPC 2.0, respond with
    // id: null rather than silently dropping it.
    error(null, -32700, 'Parse error: invalid JSON');
    return;
  }
  handleRequest(msg).catch((err) => {
    error(msg?.id ?? null, -32603, `Internal error: ${err.message}`);
  });
});
