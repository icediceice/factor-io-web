// demo-control/lib/colab.mjs — drives Colab through Light's own helper
// (Light-CF LightServer/mcptools/colab_helper.py), the code light_colab runs.
// The helper holds ~/.config/colab-cli/light.lock and keeps Light's claims and
// stops journals, so demo VMs show up in light_colab sessions and Light's reaper
// backs up every stop. Contract (Light-CF docs/architecture/colab-lane.md): one
// base64 JSON request in argv; the result is the LAST stdout line LIGHTCOLAB:{json}.

import { spawn } from 'node:child_process';

const PREFIX = 'LIGHTCOLAB:';
const OUTPUT_CAP = 4 * 1024 * 1024;

export function parseResult(stdout) {
  const lines = String(stdout).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith(PREFIX)) continue;
    try { return JSON.parse(line.slice(PREFIX.length)); } catch { return null; }
  }
  return null;
}

// One helper call at a time: the helper serialises on light.lock anyway, and a
// queue here keeps the demo's own steps in order.
export function createColab({ python, helper, cli, kernelKeepaliveS = 300, timeoutMs = 20 * 60_000, spawnImpl = spawn }) {
  let chain = Promise.resolve();

  function once(req) {
    return new Promise((resolve, reject) => {
      const arg = Buffer.from(JSON.stringify({ cli, kernel_keepalive_s: kernelKeepaliveS, ...req })).toString('base64');
      const child = spawnImpl(python, [helper, arg], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
      child.stdout.on('data', (d) => { if (out.length < OUTPUT_CAP) out += d; });
      child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const res = parseResult(out);
        if (res) return resolve(res);
        const why = signal ? `killed by ${signal}` : `exit ${code}`;
        reject(new Error(`Colab helper gave no result (${why}): ${(err || out).trim().slice(-600)}`));
      });
    });
  }

  function call(req) {
    const p = chain.then(() => once(req));
    chain = p.catch(() => {});
    return p;
  }

  return { call };
}