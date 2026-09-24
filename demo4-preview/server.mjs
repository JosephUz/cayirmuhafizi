import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5174);
const allowed = new Set(['/index.html','/style.css','/game.js','/physics.js','/vendor/three.module.js','/vendor/three.core.js']);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  const name = url.pathname === '/' ? '/index.html' : url.pathname;
  if (name === '/health') { res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({game:'Kale Nakliyat',version:'0.1.0'})); }
  if (!allowed.has(name)) { res.writeHead(404); return res.end('Bulunamadı'); }
  try { const data = await readFile(path.join(root,name)); res.writeHead(200,{'Content-Type':mime[path.extname(name)] || 'application/octet-stream','Cache-Control':'no-store'}); res.end(data); }
  catch { res.writeHead(404); res.end('Dosya bulunamadı'); }
});
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Kale Nakliyat: http://localhost:${port}`));
server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `${port} portu dolu. Başka PORT seçin.` : err); process.exitCode=1; });
