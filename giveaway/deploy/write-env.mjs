#!/usr/bin/env node
// giveaway/deploy/write-env.mjs — write the admin's .env (mode 0600, directory 0700).
//
//   GIVEAWAY_CF_API_TOKEN=… GIVEAWAY_CF_ACCOUNT_ID=… node write-env.mjs <path/.env> [--rotate]
//
// Secrets arrive only through the environment (the plan passes them as vault env_refs)
// and are never printed. The D1 database id is read from the Worker's wrangler.toml.
// The operator allowlist is GIVEAWAY_ALLOWED_EMAILS if set, else the quotes app's
// QUOTES_ALLOWED_EMAILS (the same operators). An existing GIVEAWAY_AGENT_TOKEN is kept
// unless --rotate is given, so a redeploy does not break the CLI.

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRANGLER = join(HERE, '..', '..', 'catcountdown', 'worker', 'wrangler.toml');
const QUOTES_ENV = '/home/ice/.factor-quotes/.env';

function readEnv(path) {
  const out = {};
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return out; }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const [target, ...flags] = process.argv.slice(2);
if (!target) {
  console.error('usage: write-env.mjs <path/.env> [--rotate]');
  process.exit(2);
}

const databaseId = /database_id\s*=\s*"([0-9a-f-]{36})"/.exec(readFileSync(WRANGLER, 'utf8'))?.[1];
const previous = readEnv(target);
const emails = process.env.GIVEAWAY_ALLOWED_EMAILS ?? previous.GIVEAWAY_ALLOWED_EMAILS ?? readEnv(QUOTES_ENV).QUOTES_ALLOWED_EMAILS ?? '';
const values = {
  GIVEAWAY_CF_API_TOKEN: process.env.GIVEAWAY_CF_API_TOKEN ?? '',
  GIVEAWAY_CF_ACCOUNT_ID: process.env.GIVEAWAY_CF_ACCOUNT_ID ?? '',
  GIVEAWAY_D1_DATABASE_ID: databaseId ?? '',
  GIVEAWAY_ALLOWED_EMAILS: emails,
  GIVEAWAY_ALLOWED_HOSTS: 'giveaway.factor-io.com:8788,100.111.93.20:8788,127.0.0.1:8788',
  GIVEAWAY_BIND: '127.0.0.1,100.111.93.20',
  GIVEAWAY_AGENT_TOKEN: !flags.includes('--rotate') && previous.GIVEAWAY_AGENT_TOKEN?.length >= 32
    ? previous.GIVEAWAY_AGENT_TOKEN
    : randomBytes(32).toString('base64url'),
};
const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`refusing to write ${target}: missing ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
chmodSync(dirname(target), 0o700);
const tmp = `${target}.tmp-${process.pid}`;
writeFileSync(tmp, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
chmodSync(tmp, 0o600);
renameSync(tmp, target);
console.log(`wrote ${target} (0600): ${Object.keys(values).join(', ')}${values.GIVEAWAY_AGENT_TOKEN === previous.GIVEAWAY_AGENT_TOKEN ? ' (agent token kept)' : ' (new agent token)'}`);