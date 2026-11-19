// serve.ts — a tiny static server for SOLMAR's game/ directory, for local
// playtesting only. Serves http://localhost:8080, Node standard library
// only, no caching, and never serves a path outside game/.
// Run it with: node serve.ts

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'game');
const PORT = 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** Resolve a request path inside game/, or null when it escapes it. */
function resolveGamePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(clean).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const full = resolve(GAME_DIR, rel === '' ? '.' : rel);
  if (full !== GAME_DIR && !full.startsWith(GAME_DIR + sep)) return null;
  return full;
}

const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }
  let full = resolveGamePath(req.url || '/');
  if (full === null) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  try {
    if (existsSync(full) && statSync(full).isDirectory()) full = join(full, 'index.html');
    if (!existsSync(full) || !statSync(full).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(full).pipe(res);
});

server.listen(PORT, () => {
  console.log(`SOLMAR serves game/ at http://localhost:${PORT}`);
});
