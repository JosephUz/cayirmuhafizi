// "Ya Allah Hücum" gösterisi (`?gosteri=hucum`) için **arazi tohumu** tarar. Bu sahnenin okunurluğu tamamen
// araziye bağlı: kadraj iki orduyu birden alıyor, araya düşen her ağaç bir bölüğü kapatıyor. Betik her tohumda
// sahanın (config GOSTERI_HUCUM.saha) içindeki engelleri (ağaç, kaya) sayar ve bölüklerin durduğu noktaların
// engellere uzaklığını ölçer; en temiz tohumları sıralar ve en iyi üçünün diziliş karesini yazar.
// Kullanım: `node scripts/hucum-tohum.mjs [adet]` (varsayılan 60 tohum).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GOSTERI_HUCUM as K } from '../src/config.js';

const PW = process.env.PLAYWRIGHT_MODULE || 'C:/ju/sonplaka/node_modules/playwright';
const ADET = Number(process.argv[2]) || 60;
const CIKTI = 'artifacts/hucum-tohum';
const SAAT = `(() => {
  let simdi = 0; const sira = [];
  performance.now = () => simdi;
  Date.now = () => 1767571200000 + simdi;
  window.requestAnimationFrame = cb => sira.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__kare = ms => { simdi += ms; const liste = sira.splice(0); for (const cb of liste) cb(simdi); };
})()`;
const bosPort = () => new Promise((c, h) => { const s = createServer(); s.on('error', h); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => c(port)); }); });
const bekle = ms => new Promise(r => setTimeout(r, ms));

/**
 * Puanlama (sayfada koşar):
 *  - **Birimler**: sahadaki her gösteri biriminin en yakın engele uzaklığı; 5 birimden sonrası puan katmaz
 *    (amaç çıplak arazi değil, bölüklerin üstünün açık olması). Askerin dibindeki ağaç en ağır cezadır.
 *  - **Saha**: sahanın içindeki engel sayısı. Kadrajın ortası (iki ordunun arası) boş kalsın: hücumun koştuğu
 *    koridor budur.
 *  - **Koridor**: merkez şeridin hücum yolu (a ≈ 0, b = -25 ... +25) ayrıca ve daha ağır ölçülür.
 */
const OLC = ({ saha, serit, K }) => {
  const w = window.__meadow;
  const E = { x: 0.7071, z: -0.7071 }, N = { x: -0.7071, z: -0.7071 };
  const aOf = (x, z) => x * E.x + z * E.z, bOf = (x, z) => x * N.x + z * N.z;
  const bosluk = (x, z) => {
    let d = Infinity;
    for (const o of w.obstacles) { const dd = Math.hypot(o.pos.x - x, o.pos.z - z) - o.radius; if (dd < d) d = dd; }
    return d;
  };
  let puan = 0, enYakin = Infinity;
  for (const e of w.entities) {
    if (!e.hucumGosteri) continue;
    const d = bosluk(e.pos.x, e.pos.z);
    if (d < enYakin) enYakin = d;
    puan += Math.min(d, 5);
  }
  // Hücum koridoru: merkez şeridin boydan boya yolu.
  let koridor = 0;
  for (let b = -25; b <= 25; b += 2.5) for (const a of [-serit.yari / 2, 0, serit.yari / 2]) {
    koridor += Math.min(bosluk(E.x * a + N.x * b, E.z * a + N.z * b), 6);
  }
  let sahaEngel = 0;
  for (const o of w.obstacles) {
    const a = aOf(o.pos.x, o.pos.z), b = bOf(o.pos.x, o.pos.z);
    if (Math.abs(a) <= saha.a && b >= saha.guney && b <= saha.kuzey) sahaEngel++;
  }
  return { puan: +(puan + koridor * 2 - sahaEngel * K.engelCezasi).toFixed(1), enYakin: +enYakin.toFixed(2), sahaEngel, birim: w.entities.filter(e => e.hucumGosteri).length };
};

const port = await bosPort(), adres = `http://127.0.0.1:${port}`;
const sunucu = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
fs.mkdirSync(CIKTI, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(adres + '/health')).ok) break; } catch { /* bekle */ } await bekle(150); }
  const { chromium } = await import(pathToFileURL(path.join(PW, 'index.mjs')).href);
  const tarayici = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'] });
  const sayfa = await tarayici.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  await sayfa.addInitScript(SAAT);
  const sonuc = [];
  for (let i = 0; i < ADET; i++) {
    const tohum = Number(process.env.TOHUM_BAS || 1000) + i * Number(process.env.TOHUM_ADIM || 1601);
    await sayfa.goto(`${adres}/?gosteri=hucum&muzik=0&tohum=${tohum}`, { waitUntil: 'load', timeout: 45000 });
    await sayfa.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000, polling: 100 });
    sonuc.push({ tohum, ...(await sayfa.evaluate(OLC, { saha: K.saha, serit: K.serit, K: { engelCezasi: 14 } })) });
  }
  sonuc.sort((a, b) => b.puan - a.puan);
  console.log('en iyi 10 tohum (puan = bölüklerin + hücum koridorunun açıklığı eksi sahadaki engel sayısı):');
  for (const s of sonuc.slice(0, 10)) console.log(`  ${s.tohum}  puan ${s.puan}  sahada ${s.sahaEngel} engel  en yakın ${s.enYakin} birim  (${s.birim} birim)`);
  await sayfa.close();

  const buyuk = await tarayici.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  await buyuk.addInitScript(SAAT);
  for (const s of sonuc.slice(0, 3)) {
    await buyuk.goto(`${adres}/?gosteri=hucum&muzik=0&tohum=${s.tohum}`, { waitUntil: 'load', timeout: 45000 });
    await buyuk.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000, polling: 100 });
    for (let i = 0; i < 4; i++) { await buyuk.evaluate(() => window.__kare(0)); await bekle(150); }
    await buyuk.screenshot({ path: path.join(CIKTI, `tohum-${s.tohum}.jpg`), type: 'jpeg', quality: 85 });
  }
  await tarayici.close();
  console.log(`\nİlk üç tohumun diziliş karesi: ${CIKTI}/`);
} finally { sunucu.kill(); }
