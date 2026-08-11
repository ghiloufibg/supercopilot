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
  version: '0.1.0-alpha.2',
});

const scopeSchema = z
  .enum(['global', 'project'])
  .optional()
  .describe(
    'Defaults to "global" (loads in every session, in every repo). Use "project" for something ' +
      'specific to the current repo only -- the project is inferred automatically, no need to name it.'
  );

server.registerTool(
  'write_memory',
  {
    title: 'Write Memory',
    description: 'Persist a value under a key for cross-session recall. Local file store only, no network calls.',
    inputSchema: {
      key: z.string().describe('Memory key, e.g. "session/context" or "plan/auth/hypothesis"'),
      value: z.string().describe('The value to store (serialize objects to a string first)'),
      scope: scopeSchema,
    },
  },
  async ({ key, value, scope }) => {
    const result = await writeMemory(key, value, { scope });
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
      scope: scopeSchema,
    },
  },
  async ({ key, scope }) => {
    const result = await readMemory(key, { scope });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  'list_memories',
  {
    title: 'List Memories',
    description: 'List stored memory keys with their last-updated timestamps. Omit scope to list everything (global plus every project); pass scope to filter.',
    inputSchema: {
      scope: scopeSchema,
    },
  },
  async ({ scope }) => {
    const result = await listMemories({ scope });
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
      scope: scopeSchema,
    },
  },
  async ({ key, scope }) => {
    const result = await deleteMemory(key, { scope });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
