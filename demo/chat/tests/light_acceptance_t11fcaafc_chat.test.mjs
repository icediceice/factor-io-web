// Quarantined verification checks; deliberately excluded from /tests' normal suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.value = '';
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  get lastChild() { return this.children.at(-1); }
  setAttribute() {}
  removeAttribute() {}
  querySelectorAll() { return []; }
  scrollIntoView() {}
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function page(fetch = async () => { throw Error('unexpected fetch'); }) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement: tag => new Element(tag),
    createTextNode: (text) => text,
    querySelector: () => Object.assign(new Element(), { value: 'none' }),
    querySelectorAll: () => [],
    documentElement: { scrollHeight: 1000 },
  };
  const context = vm.createContext({
    document, fetch, TextDecoder, AbortController,
    sessionStorage: memoryStorage(), localStorage: memoryStorage(),
    innerHeight: 800, scrollY: 0, scrollTo() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {},
  });
  // Boot depends on the browser. Evaluate all production functions unchanged,
  // then drive those functions through the same entry points as the UI.
  vm.runInContext(source.replace(/\nstart\(\);\s*$/, ''), context);
  return context;
}

function streamResponse(text) {
  const body = `event: citations\ndata: {"items":[],"mode":"none"}\n\nevent: token\ndata: ${JSON.stringify({ t: text })}\n\nevent: done\ndata: {"elapsed_s":1}\n\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

test('hostile model text remains escaped while valid citation buttons work', () => {
  const context = page();
  const rendered = context.renderMarkdown('<img src=x onerror=alert(1)> **bold** [1] [2]', 1);
  assert.ok(rendered.includes('&lt;img'));
  assert.ok(!rendered.includes('<img'));
  assert.ok(rendered.includes('<strong>bold</strong>'));
  assert.ok(rendered.includes('data-n="1"'));
  assert.ok(!rendered.includes('data-n="2"'));
});

test('a standalone streamed table delimiter is renderable as text', () => {
  const context = page();
  for (const text of ['|---|', '| --- | --- |', 'Some text\n\n|---|']) {
    assert.doesNotThrow(() => context.renderMarkdown(text, 0), text);
  }
});

test('finishing a table-delimiter answer releases the browser composer', async () => {
  const context = page(async () => streamResponse('|---|'));
  vm.runInContext("Object.assign(state, { phase: 'ready', api: 'http://gateway', key: 'k', session: 's' })", context);
  await assert.doesNotReject(() => context.ask('Quote the separator from my document'));
  assert.equal(vm.runInContext('state.busy', context), false);
  assert.equal(vm.runInContext('state.abort', context), null);
});

test('a separator-only pipe run shows as text, and a real table still renders', () => {
  const context = page();
  const loose = context.renderMarkdown('|---|', 0);
  assert.ok(loose.includes('|---|') && !loose.includes('<table>'));
  const table = context.renderMarkdown('| Item | Days |\n|---|---|\n| Battery | 900 |', 0);
  assert.ok(table.includes('<th>Item</th>') && table.includes('<td>900</td>'));
});

const READY = `Object.assign(state, { phase: 'ready', api: 'http://gateway', key: 'k', session: 'old',
  health: { model: { label: 'M', ready: true }, host: {}, queue: { parallel: 2, waiting: 0 } },
  docs: [{ id: 'd1', name: 'warranty.md', state: 'ready', tokens: 300 }],
  history: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'answer' }] });
  document.getElementById('messages').append('an earlier exchange')`;

test('Start over ends the server session and the next question goes out with no files or history', async () => {
  const calls = [];
  const context = page(async (url, opts = {}) => {
    calls.push({ method: opts.method, path: url.replace('http://gateway', ''), session: opts.headers?.['X-Session'], body: opts.body });
    if (url.endsWith('/api/session') && opts.method === 'POST') return Response.json({ session: 'new', ttl_s: 7200 });
    if (url.endsWith('/api/chat')) return streamResponse('Nothing uploaded yet.');
    return Response.json({ ok: true });
  });
  vm.runInContext(READY, context);
  await context.startOver();

  assert.deepEqual(calls.slice(0, 2).map((c) => [c.method, c.path, c.session]),
    [['DELETE', '/api/session', 'old'], ['POST', '/api/session', undefined]]);
  assert.equal(vm.runInContext('state.session', context), 'new');
  assert.equal(vm.runInContext('state.docs.length', context), 0);
  assert.equal(vm.runInContext("document.getElementById('messages').children.length", context), 0);

  await context.ask('What did I upload?');
  const chat = calls.find((c) => c.path === '/api/chat');
  assert.equal(chat.session, 'new');
  assert.deepEqual(JSON.parse(chat.body).history, []);
});

test('Start over that cannot reach the backend says so and keeps the conversation', async () => {
  const context = page(async () => { throw new TypeError('Failed to fetch'); });
  vm.runInContext(READY, context);
  await context.startOver();
  assert.equal(vm.runInContext('state.phase', context), 'error');
  assert.equal(vm.runInContext('state.session', context), 'old');
  assert.equal(vm.runInContext('state.history.length', context), 2);
});

test('Start over waits while a file is still uploading', async () => {
  const context = page(async () => { throw Error('no request may be sent'); });
  vm.runInContext(READY, context);
  vm.runInContext("state.docs.push({ name: 'big.pdf', state: 'uploading', progress: 0.4 })", context);
  await context.startOver();
  assert.equal(vm.runInContext('state.session', context), 'old');
});