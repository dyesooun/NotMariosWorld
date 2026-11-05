import http from 'node:http';
import path from 'node:path';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EDITOR_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SPRITE_ROOT = path.resolve(EDITOR_ROOT, '../../public/assets/sprites');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp' };

export function createEditorServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
    const reply = (code, text) => { response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(text); };
    if (!['GET', 'HEAD'].includes(request.method)) { reply(405, 'Read-only local server'); return; }
    const host = request.headers.host || '';
    if (!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host)) { reply(403, 'Local editor access only'); return; }
    try {
      const url = new URL(request.url, `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/health') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ app: 'level-editor', version: 1 })); return; }
      const sprites = pathname.startsWith('/assets/sprites/');
      const root = sprites ? SPRITE_ROOT : EDITOR_ROOT;
      const relative = sprites ? pathname.slice('/assets/sprites/'.length) : pathname === '/' ? 'index.html' : pathname.slice(1);
      const resolved = path.resolve(root, relative);
      if (!resolved.startsWith(root + path.sep)) { reply(403, 'Invalid path'); return; }
      const actual = await realpath(resolved);
      if (!actual.startsWith(root + path.sep) || !(await stat(actual)).isFile() || !MIME[path.extname(actual)]) { reply(404, 'Not found'); return; }
      const body = await readFile(actual);
      response.writeHead(200, { 'Content-Type': MIME[path.extname(actual)], 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { reply(404, 'Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.EDITOR_PORT || 10001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('EDITOR_PORT must be a port between 1 and 65535.');
  const server = createEditorServer();
  server.on('error', error => { console.error(`Level editor: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Level editor: http://127.0.0.1:${port}`));
}
