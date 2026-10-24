#!/usr/bin/env node
// giveaway/cli.mjs — command-line client for the giveaway admin, run on light-worker.
// It calls the same API as the web UI over loopback with the agent bearer token,
// which the server accepts only from a loopback socket.
//
//   node cli.mjs [--env FILE] [--url URL] <command> [options]
//
//   campaigns
//   campaign-create <id> [--name N] [--source S] [--platforms android[,ios]] [--cap N]
//   campaign-update <id> [--name N] [--source S] [--platforms P] [--cap N|none] [--status active|paused|ended]
//   stats
//   import --platform android|ios [--batch B] [--expires YYYY-MM-DD] <file | ->
//   revoke --platform android|ios <code> [<code> ...]
//   claims [--campaign ID] [--csv]
//
// --env defaults to ~/.factor-giveaway/.env; only GIVEAWAY_AGENT_TOKEN and
// GIVEAWAY_PORT are read from it.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key === 'csv') flags.csv = true;
      else if (next === undefined || next.startsWith('--')) throw new Error(`--${key} needs a value`);
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { flags, positional };
}

function readEnvFile(path) {
  const out = {};
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return out; }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

async function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const [command, ...rest] = positional;
  const env = { ...readEnvFile(flags.env ?? join(homedir(), '.factor-giveaway', '.env')), ...process.env };
  const base = flags.url ?? `http://127.0.0.1:${env.GIVEAWAY_PORT ?? 8788}`;
  const token = env.GIVEAWAY_AGENT_TOKEN;
  if (!token) throw new Error('GIVEAWAY_AGENT_TOKEN not found (pass --env FILE)');

  async function call(method, path, body) {
    const res = await fetch(base + '/api' + path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.trim()}`);
    return text;
  }
  const print = (text) => process.stdout.write(text.endsWith('\n') ? text : text + '\n');
  const cap = (v) => (v === undefined ? undefined : v === 'none' ? null : Number(v));
  const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  switch (command) {
    case 'campaigns': return print(await call('GET', '/campaigns'));
    case 'campaign-create':
      if (!rest[0]) throw new Error('campaign-create needs an id');
      return print(await call('POST', '/campaigns', defined({ id: rest[0], name: flags.name, source: flags.source, platforms: flags.platforms, max_claims: cap(flags.cap) })));
    case 'campaign-update':
      if (!rest[0]) throw new Error('campaign-update needs an id');
      return print(await call('PATCH', `/campaigns/${encodeURIComponent(rest[0])}`, defined({ name: flags.name, source: flags.source, platforms: flags.platforms, max_claims: cap(flags.cap), status: flags.status })));
    case 'stats': return print(await call('GET', '/stats'));
    case 'import': {
      if (!rest[0]) throw new Error('import needs a file (or - for stdin)');
      const codes = readFileSync(rest[0] === '-' ? 0 : rest[0], 'utf8');
      return print(await call('POST', '/codes/import', defined({ platform: flags.platform, batch: flags.batch, expires_at: flags.expires, codes })));
    }
    case 'revoke': return print(await call('POST', '/codes/revoke', { platform: flags.platform, codes: rest }));
    case 'claims': {
      const q = flags.campaign ? `?campaign=${encodeURIComponent(flags.campaign)}` : '';
      return print(await call('GET', (flags.csv ? '/claims.csv' : '/claims') + q));
    }
    default:
      throw new Error('commands: campaigns | campaign-create | campaign-update | stats | import | revoke | claims (see the header of cli.mjs)');
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e.message);
  process.exit(1);
});