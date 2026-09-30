#!/usr/bin/env node
// serve.mjs — local static server so the calculator runs on an HTTP origin.
// Browser fetch from a file:// origin is rejected, and this repo already
// recorded that trap for spec-artifact.html (PROGRESS.md). The deployed origin
// is GitHub Pages; this server stands in for verification only.
//
// Run: node scripts/serve.mjs [port]   then open http://127.0.0.1:<port>/tco-calculator.html
import { createServer } from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { extname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2] ?? 8787);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

const withinRoot = file => { const rel = relative(ROOT, file); return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel); };
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let file = resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (!withinRoot(file)) throw new Error('traversal');
    file = await realpath(file);
    if (!withinRoot(file)) throw new Error('symlink outside root');
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' + url.search }); res.end(); return; }
      file = await realpath(join(file, 'index.html'));
      if (!withinRoot(file)) throw new Error('index outside root');
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${ROOT} at http://127.0.0.1:${server.address().port}/`);
});