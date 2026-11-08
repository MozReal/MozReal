import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './db.js';
import { api } from './api.js';
import { HttpError, readJson, sendJson } from './http.js';
import { loadAuth } from './auth.js';
import { startScheduler } from './scheduler.js';

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(ROOT, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
  const m = api.match(req.method, url.pathname);
  if (!m) return sendJson(res, 404, { error: 'ไม่พบ API' });
  try {
    const ctx = {
      req, params: m.params, query: url.searchParams, auth: loadAuth(req),
      body: ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readJson(req) : {},
    };
    const out = (await m.handler(ctx)) ?? { ok: true };
    if (out.raw !== undefined) {
      res.writeHead(200, {
        'content-type': out.type, 'cache-control': 'no-store',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
      });
      return res.end(out.raw);
    }
    const headers = out.headers || {};
    if (out.headers) delete out.headers;
    sendJson(res, 200, out, headers);
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message });
    console.error(e);
    sendJson(res, 500, { error: e.message || 'เกิดข้อผิดพลาดภายในระบบ' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`📒 ระบบสมุดคุมเลข พร้อมใช้งานที่ http://localhost:${PORT}`);
  startScheduler();
});
