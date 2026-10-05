// Mancınık gösterisini (?gosteri=mancinik) kare kare ilerletip müziğin işaretlerine göre ölçer ve birkaç kare
// yazar. Yalnız geliştirme aracı: `node scripts/mancinik-olc.mjs` (sunucuyu kendi açar).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PW = process.env.PLAYWRIGHT_MODULE || 'C:/ju/sonplaka/node_modules/playwright';
const CIKTI = process.env.CIKTI || 'artifacts/mancinik';
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

const port = await bosPort(), adres = `http://127.0.0.1:${port}`;
const sunucu = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
fs.mkdirSync(CIKTI, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(adres + '/health')).ok) break; } catch { /* bekle */ } await bekle(150); }
  const { chromium } = await import(pathToFileURL(path.join(PW, 'index.mjs')).href);
  const tarayici = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
  const sayfa = await tarayici.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const hatalar = [];
  sayfa.on('pageerror', e => hatalar.push(e.message));
  sayfa.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
  await sayfa.addInitScript(SAAT);
  await sayfa.goto(adres + '/?gosteri=mancinik&muzik=0', { waitUntil: 'load', timeout: 45000 });
  await sayfa.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000, polling: 100 });
  for (let i = 0; i < 4; i++) { await sayfa.evaluate(() => window.__kare(0)); await bekle(150); }

  // Ekran görüntüsü alınacak saniyeler: müziğin işaretleri ve aralarındaki birkaç an.
  const fotoSn = (process.env.FOTO || '0.5,2,4,6,8,10,12,13.3,14.5,15.2,16.5,18,19.5,21,22.3,22.9,24,25.3').split(',').map(Number);
  const toplam = Math.round(26 * 30), izleme = [];
  let f = 0;
  for (let i = 1; i <= toplam; i++) {
    await sayfa.evaluate(() => window.__kare(1000 / 30));
    const d = await sayfa.evaluate(() => window.__gosteri);
    izleme.push(d);
    while (f < fotoSn.length && d.saniye >= fotoSn[f]) {
      await sayfa.screenshot({ path: path.join(CIKTI, `sn-${String(fotoSn[f]).replace('.', '_')}.jpg`), type: 'jpeg', quality: 88 });
      f++;
    }
  }
  const son = izleme[izleme.length - 1];
  const ilk = (ko) => { const v = izleme.find(ko); return v ? v.saniye : null; };
  console.log('--- mancınık gösterisi ölçümü ---');
  console.log('ilk taş        :', son.ilkTas, 'sn');
  console.log('yıkılış        :', son.yikilis, 'sn   (müzik: 13.30)');
  console.log('çarpışma       :', son.carpisma, 'sn   (müzik: 22.90)');
  console.log('atılan taş     :', son.tas);
  console.log('mavi mancınık  :', son.mancinik.blue, '/ 4 · kızıl:', son.mancinik.red, '/ 4');
  console.log('akın ayakta    :', son.akin.ayakta, '· dövüşen:', son.akin.dovusen);
  console.log('kahraman çizili:', son.kahramanGorunur);
  console.log('kızıl mancınık 0 oldu:', ilk(d => d.mancinik.red === 0), 'sn');
  // Hangi mancınık ne zaman yıkıldı / hangi atış yola çıktı (betiğin tuttuğunu görmek için).
  for (const f of ['blue', 'red']) {
    for (let i = 0; i < 4; i++) {
      const t = izleme.find(d => !d.sag[f][i]);
      console.log(`  ${f}[${i}] yıkıldı:`, t ? t.saniye : '— (ayakta)');
    }
  }
  console.log('atılan taşlar (sn):', son.gunluk.join(' · '));
  console.log('akın sütunu -45 birime geldi:', ilk(d => d.akin.on > -45), 'sn (kadrajın alt kenarı dolayı)');
  for (const t of [4, 8, 13.3, 16, 18, 20, 22.9, 25]) {
    const d = izleme.find(x => x.saniye >= t);
    if (d) console.log(`  ${String(t).padEnd(5)} sn → evre ${String(d.evre).padEnd(7)} kadraj ${d.kadraj} mancınık ${d.mancinik.blue}/${d.mancinik.red} akınÖn ${d.akin.on} uçanTaş ${d.ucanTas}`);
  }
  if (hatalar.length) console.log('SAYFA HATALARI:', hatalar.slice(0, 5).join(' | '));
  await tarayici.close();
} finally { sunucu.kill(); }
