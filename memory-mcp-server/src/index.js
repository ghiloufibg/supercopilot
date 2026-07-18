#!/usr/bin/env node
// Memory MCP server (DESIGN.md §6 Tier B). Exactly four tools, deliberately no more —
// see DESIGN.md §6's decision on why think_about_*/summarize_changes were NOT added here.
// stdio transport only, per the per-surface support matrix in DESIGN.md §3.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { writeMemory, readMemory, listMemories, deleteMemory } from './store.js';

const server = new McpServer({
  name: 'copilot-superclaude-memory',
  version: '0.1.0',
});

server.registerTool(
  'write_memory',
  {
    title: 'Write Memory',
    description: 'Persist a value under a key for cross-session recall. Local file store only, no network calls.',
    inputSchema: {
      key: z.string().describe('Memory key, e.g. "session/context" or "plan/auth/hypothesis"'),
      value: z.string().describe('The value to store (serialize objects to a string first)'),
    },
  },
  async ({ key, value }) => {
    const result = await writeMemory(key, value);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'read_memory',
  {
    title: 'Read Memory',
    description: 'Retrieve a previously stored value by key.',
    inputSchema: {
      key: z.string().describe('Memory key to look up'),
    },
  },
  async ({ key }) => {
    const result = await readMemory(key);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'list_memories',
  {
    title: 'List Memories',
    description: 'List all stored memory keys with their last-updated timestamps.',
    inputSchema: {},
  },
  async () => {
    const result = await listMemories();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'delete_memory',
  {
    title: 'Delete Memory',
    description: 'Remove a stored memory by key.',
    inputSchema: {
      key: z.string().describe('Memory key to delete'),
    },
  },
  async ({ key }) => {
    const result = await deleteMemory(key);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
