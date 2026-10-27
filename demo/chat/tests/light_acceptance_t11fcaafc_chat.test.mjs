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

function page(fetch = async () => { throw Error('unexpected fetch'); }) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement: tag => new Element(tag),
    querySelector: () => ({ value: 'none' }),
    querySelectorAll: () => [],
    documentElement: { scrollHeight: 1000 },
  };
  const context = vm.createContext({
    document, fetch, TextDecoder, AbortController,
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