// Mancınık gösterisi için arazi tohumu tarar. Sahnenin okunurluğu araziye bağlıdır: mancınıkların ve son
// çarpışmanın üstüne ağaç düşerse kadraj kapanır. Bu betik her tohumda **sayısal boşluk** ölçer —
// engellerin (ağaç, kaya) sahnenin önemli noktalarına en yakın uzaklığı — ve en iyi tohumları sıralar.
// Seçilen tohumun iki karesi (düellonun ortası ve son darbe) artifacts/mancinik-tohum/ altına yazılır.
// Kullanım: `node scripts/mancinik-tohum.mjs [adet]` (varsayılan 40 tohum tarar).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PW = process.env.PLAYWRIGHT_MODULE || 'C:/ju/sonplaka/node_modules/playwright';
const ADET = Number(process.argv[2]) || 40;
const CIKTI = 'artifacts/mancinik-tohum';
const SAAT = `(() => {
  let simdi = 0; const sira = [];
  performance.now = () => simdi;
  Date.now = () => 1767571200000 + simdi;
  window.requestAnimationFrame = cb => sira.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__kare = ms => { simdi += ms; const liste = sira.splice(0); for (const cb of liste) cb(simdi); return sira.length; };
})()`;
const bosPort = () => new Promise((c, h) => { const s = createServer(); s.on('error', h); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => c(port)); }); });
const bekle = ms => new Promise(r => setTimeout(r, ms));

/**
 * Sahnedeki **önemli noktalar** ve her birinin istediği boşluk (birim). Sayfada koşar.
 *  - mancınıklar ve muhafız hatları: üstlerine ağaç düşmesin,
 *  - son çarpışma bölgesi (mavi sıranın alt ucu): akının vardığı yer tamamen açık olsun — en çok burası önemli,
 *  - taş yolu: iki sıra arasındaki koridor (kanat ekseninde sıraların yayıldığı kuşak).
 */
const OLC = () => {
  const w = window.__meadow;
  const mancinik = w.entities.filter(e => e.isSiege);
  const mavi = mancinik.filter(e => e.faction === 'blue'), kizil = mancinik.filter(e => e.faction === 'red');
  const noktalar = [];
  for (const e of mancinik) noktalar.push({ x: e.pos.x, z: e.pos.z, agirlik: 3 });
  // Taş yolları: karşılıklı her mancınık çifti arasındaki doğru üstünde üç örnek.
  for (const a of mavi) for (const b of kizil) for (const k of [0.3, 0.5, 0.7]) {
    noktalar.push({ x: a.pos.x + (b.pos.x - a.pos.x) * k, z: a.pos.z + (b.pos.z - a.pos.z) * k, agirlik: 1 });
  }
  // **Son darbe bölgesi**: akının vardığı yer — süvariye en yakın mavi mancınığın çevresi. En ağır ölçüt bu.
  const on = w.entities.filter(e => e.loadout && e.loadout.horse && e.faction === 'red');
  if (mavi.length && on.length) {
    const yon = { x: on[0].pos.x, z: on[0].pos.z };
    let hedef = mavi[0], en = Infinity;
    for (const m of mavi) { const d = Math.hypot(m.pos.x - yon.x, m.pos.z - yon.z); if (d < en) { en = d; hedef = m; } }
    const ux = (yon.x - hedef.pos.x) / en, uz = (yon.z - hedef.pos.z) / en;
    for (const d of [0, 3, 6, 9]) noktalar.push({ x: hedef.pos.x + ux * d, z: hedef.pos.z + uz * d, agirlik: 6 });
  }

  let puan = 0, enYakin = Infinity;
  for (const n of noktalar) {
    let d = Infinity;
    for (const o of window.__meadow.obstacles) {
      const dd = Math.hypot(o.pos.x - n.x, o.pos.z - n.z) - o.radius;
      if (dd < d) d = dd;
    }
    if (d < enYakin) enYakin = d;
    // Boşluk 6 birimi aşınca ek puan yok: amaç çıplak arazi değil, önemli noktaların açık olması.
    puan += Math.min(d, 6) * n.agirlik;
  }
  return { puan: +puan.toFixed(1), enYakin: +enYakin.toFixed(2), engel: window.__meadow.obstacles.length };
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
    const tohum = 1000 + i * 1777;
    await sayfa.goto(`${adres}/?gosteri=mancinik&muzik=0&tohum=${tohum}`, { waitUntil: 'load', timeout: 45000 });
    await sayfa.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000, polling: 100 });
    sonuc.push({ tohum, ...(await sayfa.evaluate(OLC)) });
  }
  sonuc.sort((a, b) => b.puan - a.puan);
  console.log('en iyi 8 tohum (puan = önemli noktaların engellere uzaklığı, ağırlıklı):');
  for (const s of sonuc.slice(0, 8)) console.log(`  ${s.tohum}  puan ${s.puan}  en yakın engel ${s.enYakin} birim  (${s.engel} engel)`);
  await sayfa.close();

  // En iyi üç tohumun iki karesi: düellonun ortası ve son darbe.
  const buyuk = await tarayici.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  await buyuk.addInitScript(SAAT);
  for (const s of sonuc.slice(0, 3)) {
    await buyuk.goto(`${adres}/?gosteri=mancinik&muzik=0&tohum=${s.tohum}`, { waitUntil: 'load', timeout: 45000 });
    await buyuk.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000, polling: 100 });
    for (let i = 0; i < 4; i++) { await buyuk.evaluate(() => window.__kare(0)); await bekle(150); }
    for (const sn of [6, 22.9]) {
      while ((await buyuk.evaluate(() => window.__gosteri.saniye)) < sn) await buyuk.evaluate(() => window.__kare(1000 / 30));
      await buyuk.screenshot({ path: path.join(CIKTI, `tohum-${s.tohum}-${String(sn).replace('.', '_')}.jpg`), type: 'jpeg', quality: 85 });
    }
  }
  await tarayici.close();
} finally { sunucu.kill(); }
