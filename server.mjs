import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { createRooms } from './server/rooms.mjs';

/**
 * Tek süreç, tek port: statik dosyalar (oyun) + WebSocket (odalar, lobi, otoriter simülasyon). Cloudflare Tunnel bu
 * portu bir alan adına bağlar; tarayıcı ws(s)://aynı-adres ile bağlanır. Proje klasörü ve three.js paketi dışında
 * hiçbir dosyaya erişim yok.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(root, 'node_modules', 'three', 'build');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const rootFiles = ['index.html', 'style.css', 'game.js'];

function resolveFile(pathname) {
  if (pathname === '/' || pathname.startsWith('/?')) pathname = '/index.html';
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return null;
  if (rel.startsWith('vendor' + path.sep) || rel.startsWith('vendor/')) {
    const file = path.join(vendorDir, path.basename(rel));
    return file.startsWith(vendorDir) ? file : null;
  }
  const top = rel.split(/[\\/]/)[0];
  if (top === rel && !rootFiles.includes(rel)) return null;
  if (top !== rel && top !== 'src') return null;
  return path.join(root, rel);
}

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const address = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, address);
  if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': types['.json'] }); res.end(JSON.stringify(rooms.stats())); return; }
  const file = resolveFile(url.pathname);
  const type = file && types[path.extname(file).toLowerCase()];
  if (!file || !type || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(file.startsWith(vendorDir) ? 500 : 404);
    res.end(file.startsWith(vendorDir) ? 'three.js bulunamadi. Once npm install calistirin.' : 'Not found');
  }
});
const rooms = createRooms({ log: (...a) => console.log(new Date().toLocaleTimeString('tr-TR'), ...a) });
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on('connection', ws => rooms.attach(ws));

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `${port} portu kullanimda. Baska port icin PORT ortam degiskenini ayarlayin.` : error);
  process.exit(1);
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(sig + ': kapaniyor.'); wss.close(); server.close(); process.exit(0); });
server.listen(port, host, () => {
  console.log(`Cayir Muhafizi: ${address} (dinlenen: ${host}:${port})\nDurdurmak icin Ctrl+C.`);
  if (process.argv.includes('--open')) {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${address}'`], { windowsHide: true, stdio: 'ignore' });
    child.on('error', console.error);
  }
});
