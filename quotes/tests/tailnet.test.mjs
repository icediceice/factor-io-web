import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTailnetCache, isTailnetAddr, tailnetWhois, whoisAvailable,
} from '../lib/tailnet.mjs';

describe('tailnet address boundary', () => {
  test('accepts exactly the IPv4 100.64.0.0/10 range, including mapped sockets', () => {
    assert.equal(isTailnetAddr('100.64.0.0'), true);
    assert.equal(isTailnetAddr('100.127.255.255'), true);
    assert.equal(isTailnetAddr('::ffff:100.83.80.43'), true);
    assert.equal(isTailnetAddr('100.63.255.255'), false);
    assert.equal(isTailnetAddr('100.128.0.0'), false);
    assert.equal(isTailnetAddr('10.0.0.1'), false);
    assert.equal(isTailnetAddr('100.83.80.43.evil'), false);
  });
});

describe('tailscale whois', () => {
  test('returns a lowercased login and caches it per peer', async () => {
    clearTailnetCache();
    let calls = 0;
    const run = async () => {
      calls++;
      return JSON.stringify({ UserProfile: { LoginName: 'Operator@Factor-IO.COM' } });
    };
    assert.equal(await tailnetWhois('100.83.80.43', { run }), 'operator@factor-io.com');
    assert.equal(await tailnetWhois('100.83.80.43', { run }), 'operator@factor-io.com');
    assert.equal(calls, 1);
  });

  test('never invokes whois for an address outside the tailnet', async () => {
    let called = false;
    assert.equal(await tailnetWhois('203.0.113.4', { run: async () => { called = true; } }), '');
    assert.equal(called, false);
  });

  test('command failures, malformed replies and timeouts all deny', async () => {
    clearTailnetCache();
    assert.equal(await tailnetWhois('100.64.0.1', { run: async () => { throw new Error('down'); } }), '');
    assert.equal(await tailnetWhois('100.64.0.2', { run: async () => '{bad json' }), '');
    assert.equal(await tailnetWhois('100.64.0.3', { run: () => new Promise(() => {}), timeoutMs: 10 }), '');
  });

  test('boot availability proves status and a self-whois login', async () => {
    const calls = [];
    const run = async (args) => {
      calls.push(args);
      if (args[0] === 'status') return JSON.stringify({ BackendState: 'Running', TailscaleIPs: ['100.111.93.20'] });
      return JSON.stringify({ UserProfile: { LoginName: 'ice@example.com' } });
    };
    assert.equal(await whoisAvailable({ run }), true);
    assert.deepEqual(calls, [['status', '--json'], ['whois', '--json', '100.111.93.20']]);
    assert.equal(await whoisAvailable({ run: async () => JSON.stringify({ BackendState: 'Stopped' }) }), false);
  });
});
