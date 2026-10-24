// Quarantined verify-ship acceptance proof for local:81e06262b4b3a21d430f321ce3a82be2.
// Run explicitly with Vitest; the plan's normal node:test suite is unchanged.
import { afterEach, expect, test, vi } from 'vitest';
import worker from '../../catcountdown/worker/src/index.js';

afterEach(() => vi.unstubAllGlobals());

test('the landing-page film retains byte-range delivery through the Worker', async () => {
  const media = new Uint8Array(1024);
  vi.stubGlobal('fetch', async (input, init) => {
    const upstream = new Request(input, init);
    if (upstream.headers.get('range') === 'bytes=100-199') {
      return new Response(media.slice(100, 200), {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 100-199/1024', 'accept-ranges': 'bytes' },
      });
    }
    return new Response(media, { headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' } });
  });
  const response = await worker.fetch(new Request('https://catcountdown.factor-io.com/assets/work/cat-countdown-promo.mp4', {
    headers: { range: 'bytes=100-199' },
  }), {});
  expect(response.status).toBe(206);
  expect(response.headers.get('content-range')).toBe('bytes 100-199/1024');
  expect((await response.arrayBuffer()).byteLength).toBe(100);
});

// Explicit opt-in: upstream/CDN state is not part of the deterministic unit proof.
if (process.env.CATCOUNTDOWN_LIVE_VERIFY === '1') {
  test('the deployed Worker preserves the origin video range response', async () => {
    const path = '/assets/work/cat-countdown-promo.mp4';
    const [origin, edge] = await Promise.all([
      fetch('https://studio.factor-io.com' + path, { headers: { range: 'bytes=100-199' } }),
      fetch('https://catcountdown.factor-io.com' + path, { headers: { range: 'bytes=100-199' } }),
    ]);
    const observed = { originStatus: origin.status, edgeStatus: edge.status, edgeRange: edge.headers.get('content-range') };
    await Promise.all([origin.body?.cancel(), edge.body?.cancel()]);
    expect(observed).toEqual({ originStatus: 206, edgeStatus: 206, edgeRange: 'bytes 100-199/3358980' });
  }, 20000);
}