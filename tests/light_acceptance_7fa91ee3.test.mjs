// Quarantined verify-ship proofs for local:7fa91ee316e4c514a7579062e1954a9a.
// Explicit opt-in: npm test --prefix tests -- light_acceptance_7fa91ee3.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { catPage } from './support/cat-countdown-browser.mjs';

test('the full scene gallery remains available with page JavaScript disabled', { timeout: 15000 }, async t => {
  const { page } = await catPage(t, { scripts: false });
  const gallery = await page.evaluate(`(() => {
    const tiles = [...document.querySelectorAll('#art-grid > li')];
    return { all: tiles.length, available: tiles.filter(li => li.getClientRects().length > 0).length };
  })()`);
  assert.ok(gallery.all > 0, 'a gallery must exist');
  assert.equal(gallery.available, gallery.all, 'plain HTML must expose every scene without requiring the Show all handler');
});

test('the promised home screen widget recording is a playable demo chapter', { timeout: 15000 }, async t => {
  const { page } = await catPage(t);
  const widget = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('#demo button[data-video]')].find(b => /widget/i.test(b.textContent));
    if (!button) return null;
    button.click();
    const video = document.getElementById('demo-video');
    return { selected: button.getAttribute('aria-pressed'), src: video.getAttribute('src'), poster: video.getAttribute('poster') };
  })()`);
  assert.ok(widget, 'the captured widget demo is missing');
  assert.equal(widget.selected, 'true');
  assert.ok(widget.src && widget.poster);
});

test('the closing call to action includes the promised scannable QR code', { timeout: 15000 }, async t => {
  const { page } = await catPage(t);
  const qr = await page.evaluate(`(() => {
    const cta = document.querySelector('.cta');
    const qr = cta.querySelector('svg[aria-label*="QR"], img[alt*="QR"]');
    return !!qr && qr.getClientRects().length > 0;
  })()`);
  assert.equal(qr, true, 'a visitor who finishes the page needs the closing QR promised by the plan');
});