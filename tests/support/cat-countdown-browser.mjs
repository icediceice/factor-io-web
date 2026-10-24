import { launch, openPage, serve } from '../../scripts/films/cdp.mjs';

export async function catPage(t, { scripts = true, reducedMotion = 'reduce', saveData = false, randomValue } = {}) {
  const server = await serve();
  t.after(() => server.close());
  const browser = await launch();
  t.after(() => browser.close());
  const page = await openPage(browser, { width: 390, height: 844, reducedMotion });
  if (randomValue !== undefined) await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `Math.random = () => ${JSON.stringify(randomValue)};`,
  });
  if (!scripts) await page.send('Emulation.setScriptExecutionDisabled', { value: true });
  if (saveData) await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });',
  });
  await page.goto(server.origin + '/cat-countdown.html?noredirect=1');
  return { page, origin: server.origin };
}

export async function eventually(page, expression) {
  return page.evaluate(`new Promise((resolve, reject) => {
    const until = performance.now() + 4000;
    const probe = () => {
      if (${expression}) return resolve(true);
      if (performance.now() > until) return reject(new Error('browser condition timed out: ' + ${JSON.stringify(expression)}));
      setTimeout(probe, 40);
    };
    probe();
  })`);
}