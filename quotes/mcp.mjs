#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { TOOLS, callTool } from './lib/mcp-tools.mjs';

const root = dirname(fileURLToPath(import.meta.url));
function token() {
  if (process.env.QUOTES_AGENT_TOKEN) return process.env.QUOTES_AGENT_TOKEN;
  try {
    const text = readFileSync(process.env.QUOTES_ENV_FILE || join(root, '.env'), 'utf8');
    let value = '';
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?QUOTES_AGENT_TOKEN\s*=\s*(.*?)\s*$/);
      if (match) value = match[1].replace(/^(['"])(.*)\1$/, '$2');
    }
    return value;
  } catch { return ''; }
}
const base = (process.env.QUOTES_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
async function request(method, path, body, { raw = false } = {}) {
  const headers = { authorization: `Bearer ${token()}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try { const obj = JSON.parse(text); detail = obj.error || text; if (obj.errors) detail += `: ${JSON.stringify(obj.errors)}`; } catch {}
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
}
if (process.argv.includes('--selftest')) {
  try {
    const response = await fetch(`${base}/api/settings`, { headers: { authorization: `Bearer ${token()}` } });
    console.log(`selftest ${response.status === 200 ? 'ok' : 'failed'} ${response.status}`);
    if (response.status !== 200) process.exitCode = 1;
  } catch { console.log('selftest failed 0'); process.exitCode = 1; }
} else {
  const versions = ['2026-07-28','2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
  const output = obj => process.stdout.write(`${JSON.stringify(obj)}\n`);
  async function handle(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (!Object.hasOwn(msg, 'id')) return;
    const reply = { jsonrpc: '2.0', id: msg.id };
    if (msg.method === 'initialize') reply.result = { protocolVersion: versions.includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : '2025-11-25', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'factor-quotes', version: '1.0.0' } };
    else if (msg.method === 'ping') reply.result = {};
    else if (msg.method === 'tools/list') reply.result = { tools: TOOLS };
    else if (msg.method === 'tools/call') {
      try {
        const data = await callTool(request, msg.params?.name, msg.params?.arguments);
        reply.result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false };
      } catch (e) {
        const data = { error: e.message };
        reply.result = { content: [{ type: 'text', text: e.message }], structuredContent: data, isError: true };
      }
    } else reply.error = { code: -32601, message: 'Method not found' };
    output(reply);
  }
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => {
    try { void handle(JSON.parse(line)); } catch { output({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  });
  input.on('close', () => process.exit(0));
}