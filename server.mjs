import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { createRooms } from './server/rooms.mjs';

/**
 * Tek süreç, tek port: statik dosyalar (oyun) + WebSocket (odalar, lobi, otoriter simülasyon). Cloudflare Tunnel bu
 * portu cayirmuhafizi-sunucu.josephuz.com'a bağlar; oyun dosyaları Cloudflare'deki statik siteden (cayirmuhafizi.josephuz.com,
 * wrangler.jsonc) gelir ve tarayıcı bu adrese bağlanır. Yerelde sayfa da buradan açılır (ws://aynı-adres). Proje klasörü ve three.js paketi dışında
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
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};
const rootFiles = ['index.html', 'style.css', 'game.js'];
/** Kod dışındaki, adıyla sabitlenmiş klasörler: oyun içi müzik (bkz. src/muzik.js). */
const assetDirs = ['src', 'muzik'];
/**
 * Oyun dosyaları **hiç önbelleğe alınmaz**: tek bir sürüm vardır ve güncelleme anında geçmelidir. `no-cache` yetmez,
 * çünkü araya giren vekiller (Cloudflare'ın "Browser Cache TTL" ayarı) onu kendi süresiyle değiştirebiliyor;
 * `no-store` + `max-age=0` en katı olanıdır. Cloudflare tarafında ayrıca Caching > Browser Cache TTL "Respect
 * Existing Headers" seçilmeli ya da bir Cache Rule ile bypass edilmelidir (bkz. README).
 */
const noStore = 'no-store, no-cache, must-revalidate, max-age=0';
/**
 * Müzik dosyaları bunun dışındadır: her biri ~2 MB'tır, adları parçanın adıdır ve içerikleri değişmez. Her sayfa
 * yenilemesinde yeniden inmesinler diye bir hafta önbelleğe alınır; parça değişirse dosya adı da değişir.
 */
const mediaCache = 'public, max-age=604800';
const cacheFor = file => (path.extname(file).toLowerCase() === '.mp3' ? mediaCache : noStore);
/** Sürüm damgası: en yeni oyun dosyasının değişme zamanı; /health ile hangi yapının ayakta olduğu görülür. */
async function buildStamp() {
  let newest = 0;
  const walk = async dir => {
    let list = []; try { list = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) await walk(full);
      else if (/.(js|mjs|css|html)$/.test(d.name)) { try { newest = Math.max(newest, (await stat(full)).mtimeMs); } catch { /* yok */ } }
    }
  };
  for (const f of rootFiles) { try { newest = Math.max(newest, (await stat(path.join(root, f))).mtimeMs); } catch { /* yok */ } }
  await walk(path.join(root, 'src'));
  await walk(path.join(root, 'server'));
  try { newest = Math.max(newest, (await stat(path.join(root, 'server.mjs'))).mtimeMs); } catch { /* yok */ }
  return new Date(newest).toISOString();
}
let stamp = 'bilinmiyor';

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
  if (top !== rel && !assetDirs.includes(top)) return null;
  return path.join(root, rel);
}

/**
 * `Range: bytes=a-b` başlığını [başlangıç, son] olarak çözer (tek aralık yeter: tarayıcılar ses için bunu yollar).
 * Anlaşılmayan ya da dosyanın dışına taşan istek null döner; o zaman dosyanın tamamı 200 ile verilir.
 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  const bas = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const son = m[1] ? (m[2] ? Math.min(Number(m[2]), size - 1) : size - 1) : size - 1;
  return bas <= son && bas < size ? [bas, son] : null;
}

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const address = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, address);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': noStore });
    res.end(JSON.stringify({ ...rooms.stats(), surum: stamp })); return;
  }
  const file = resolveFile(url.pathname);
  const type = file && types[path.extname(file).toLowerCase()];
  if (!file || !type || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const bytes = await readFile(file);
    const headers = { 'Content-Type': type, 'Cache-Control': cacheFor(file) };
    // Ses dosyalarında parça aralığı: tarayıcı indirmediği bir yere atlarken (ya da akışı sürdürürken) `Range` ister.
    // Karşılığı verilmezse Chrome yüklenmemiş bir noktaya sarılamaz; müzik baştan dinlenir (bkz. src/muzik.js).
    if (type.startsWith('audio/')) {
      headers['Accept-Ranges'] = 'bytes';
      const dilim = parseRange(req.headers.range, bytes.length);
      if (dilim) {
        const [bas, son] = dilim;
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${bas}-${son}/${bytes.length}`, 'Content-Length': son - bas + 1 });
        res.end(req.method === 'HEAD' ? undefined : bytes.subarray(bas, son + 1)); return;
      }
    }
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(file.startsWith(vendorDir) ? 500 : 404);
    res.end(file.startsWith(vendorDir) ? 'three.js bulunamadi. Once npm install calistirin.' : 'Not found');
  }
});
const rooms = createRooms({ log: (...a) => console.log(new Date().toLocaleTimeString('tr-TR'), ...a) });
/**
 * WebSocket yalnız bilinen sayfalardan: aynı adres (yerelde, aynı ağda), *.josephuz.com (Cloudflare'deki statik site) ve
 * Android uygulaması (https://localhost). Origin'siz istemciler (testler, araçlar) kabul edilir.
 */
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { const u = new URL(origin); return u.host === req.headers.host || u.hostname === 'josephuz.com' || u.hostname.endsWith('.josephuz.com') || u.hostname === 'localhost'; } catch { return false; }
}
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024, verifyClient: ({ req }) => allowedOrigin(req) });
wss.on('connection', ws => rooms.attach(ws));

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `${port} portu kullanimda. Baska port icin PORT ortam degiskenini ayarlayin.` : error);
  process.exit(1);
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(sig + ': kapaniyor.'); wss.close(); server.close(); process.exit(0); });
buildStamp().then(s => { stamp = s; });
server.listen(port, host, () => {
  console.log(`Cayir Muhafizi: ${address} (dinlenen: ${host}:${port})\nDurdurmak icin Ctrl+C.`);
  if (process.argv.includes('--open')) {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${address}'`], { windowsHide: true, stdio: 'ignore' });
    child.on('error', console.error);
  }
});
