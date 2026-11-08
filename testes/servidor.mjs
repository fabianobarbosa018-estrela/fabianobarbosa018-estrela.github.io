import http from 'http'; import fs from 'fs'; import path from 'path';
import { criarAmbiente } from './ambiente.mjs';
const E = await criarAmbiente(); await E.instalar();
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((q, r) => {
  if (q.url === '/api' && q.method === 'POST') { let b = ''; q.on('data', c => b += c); q.on('end', async () => { const x = JSON.parse(b); r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(await E.api(x.token, x.acao, x.d))); }); return; }
  const f = path.join('/home/claude/supa/web', q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f));
}).listen(8770, () => console.log('ok'));
