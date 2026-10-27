#!/usr/bin/env node
// giveaway/deploy/dns-record.mjs — idempotent DNS-only A record for the tailnet admin.
//
//   CF_API_TOKEN=… node dns-record.mjs giveaway.factor-io.com 100.111.93.20
//
// The record points at a Tailscale (100.64.0.0/10) address and is never proxied, so
// the name resolves publicly but only tailnet devices can reach it, like quotes.
// Refuses any non-tailnet address so a typo cannot publish the admin.

import { isTailnetAddr } from '../lib/tailnet.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const [name, ip] = process.argv.slice(2);
const token = process.env.CF_API_TOKEN;

async function cf(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success !== true) {
    throw new Error(`${method} ${path.split('?')[0]}: HTTP ${res.status} ${(json.errors ?? []).map((e) => e.message).join('; ')}`);
  }
  return json.result;
}

try {
  if (!name || !ip) throw new Error('usage: dns-record.mjs <fqdn> <tailnet-ip>');
  if (!token) throw new Error('CF_API_TOKEN is not set');
  if (!isTailnetAddr(ip)) throw new Error(`${ip} is not a Tailscale address; refusing to publish`);
  const zoneName = name.split('.').slice(-2).join('.');
  const [zone] = await cf('GET', `/zones?name=${encodeURIComponent(zoneName)}`);
  if (!zone) throw new Error(`zone ${zoneName} not found`);
  const existing = await cf('GET', `/zones/${zone.id}/dns_records?name=${encodeURIComponent(name)}`);
  const record = { type: 'A', name, content: ip, ttl: 1, proxied: false, comment: 'giveaway admin, tailnet only (giveaway/README.md)' };
  if (existing.length > 1 || (existing[0] && existing[0].type !== 'A')) {
    throw new Error(`${name} already has ${existing.map((r) => r.type).join(', ')} record(s); resolve by hand`);
  }
  if (!existing[0]) {
    await cf('POST', `/zones/${zone.id}/dns_records`, record);
    console.log(`created A ${name} -> ${ip} (DNS only)`);
  } else if (existing[0].content === ip && existing[0].proxied === false) {
    console.log(`unchanged: A ${name} -> ${ip} (DNS only)`);
  } else {
    await cf('PATCH', `/zones/${zone.id}/dns_records/${existing[0].id}`, record);
    console.log(`updated A ${name}: ${existing[0].content}${existing[0].proxied ? ' (proxied)' : ''} -> ${ip} (DNS only)`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}