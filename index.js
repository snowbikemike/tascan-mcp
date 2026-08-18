#!/usr/bin/env node

// ============================================================
// TaScan MCP Server — stdio transport
// Thin transport over the canonical tool registry (tools.cjs),
// which is shared with the remote HTTP endpoint at
// https://app.tascan.io/mcp. Add or change tools in tools.cjs —
// never here.
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { TOOLS } = require('./tools.cjs');

const API_BASE = process.env.TASCAN_API_URL || 'https://app.tascan.io/api/v1';
const API_KEY = process.env.TASCAN_API_KEY || '';

if (!API_KEY) {
  console.error('TASCAN_API_KEY environment variable is required');
  process.exit(1);
}

// Transport-bound REST call handed to every tool handler
async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + API_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (body && (method === 'POST' || method === 'PUT')) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(API_BASE + path, opts);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || `API error ${resp.status}`);
  }
  return data;
}

const server = new Server(
  { name: 'tascan', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema, annotations }) => ({
    name, description, inputSchema, annotations
  }))
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find(t => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const text = await tool.handler(req.params.arguments || {}, api);
    return { content: [{ type: 'text', text: String(text) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('TaScan MCP server error:', err);
  process.exit(1);
});
