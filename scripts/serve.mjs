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
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// Browsers fetch video with a Range header and will not seek without a 206, so
// honour a single byte range the way GitHub Pages does. Multi-range requests get
// the whole file, which the spec permits.
const byteRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start = match[1] === '' ? size - Number(match[2]) : Number(match[1]);
  let end = match[1] === '' || match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start < 0) start = 0;
  return start > end || start >= size ? 'unsatisfiable' : { start, end };
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
    const headers = { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store", "accept-ranges": "bytes" };
    const range = byteRange(req.headers.range, body.length);
    if (range === 'unsatisfiable') { res.writeHead(416, { ...headers, "content-range": `bytes */${body.length}` }); res.end(); return; }
    if (range) {
      res.writeHead(206, { ...headers, "content-range": `bytes ${range.start}-${range.end}/${body.length}`, "content-length": range.end - range.start + 1 });
      res.end(req.method === 'HEAD' ? undefined : body.subarray(range.start, range.end + 1));
      return;
    }
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${ROOT} at http://127.0.0.1:${server.address().port}/`);
});