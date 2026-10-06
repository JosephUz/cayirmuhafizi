// **Hücum gösterisi ayar ölçeri** (`?gosteri=hucum`; yalnız geliştirme aracı, oyuna girmez).
// Sahneyi kare kare (30 fps sahte saat — çekim betiğiyle birebir aynı kalıp) bir tur boyunca koşturur ve
// müziğin işaretleriyle karşılaştırılacak **ölçülen anları** yazar: Güney'in menzilli kanatlarının tükendiği
// an, kılıçlılarının tükendiği an, hücumun Kuzey okçu hattına vardığı an, Kuzey kahramanının düştüğü an ve
// Kuzey'in sahadan silindiği an. `--kare <sn,sn,...>` verilirse o saniyelerde ekran görüntüsü de alır.
//
// Kullanım: `node scripts/hucum-olc.mjs [--kare 0,10,17,22,27,31] [--klasor artifacts]`
// Sunucuyu kendi açar; Playwright'ı scripts/test.mjs ile aynı sırayla arar (PLAYWRIGHT_MODULE da verilebilir).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GOSTERI_HUCUM as K } from '../src/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (ad, v = null) => { const i = argv.indexOf(ad); return i >= 0 ? argv[i + 1] : v; };
const kareSn = (arg('--kare') || '').split(',').filter(Boolean).map(Number);
const klasor = path.join(root, arg('--klasor', 'artifacts'));

const bosPort = () => new Promise((çöz, hata) => {
  const s = createServer();
  s.on('error', hata);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => çöz(port)); });
});
const bekle = ms => new Promise(r => setTimeout(r, ms));

/** scripts/test.mjs ile aynı arama: bu depo → üst klasörler → komşu depolar. */
function tarayiciKlasorleri() {
  const a = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) a.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  for (const e of [process.env.LOCALAPPDATA, process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local')].filter(Boolean)) a.push(path.join(e, 'ms-playwright'));
  return a;
}
function kurulumDene(f) {
  const kurulum = path.join(f, 'node_modules', 'playwright'), giris = path.join(kurulum, 'index.mjs');
  if (!existsSync(giris)) return null;
  try {
    const liste = JSON.parse(readFileSync(path.join(kurulum, '..', 'playwright-core', 'browsers.json'), 'utf8'));
    const c = liste.browsers.find(b => b.name === 'chromium');
    if (!c || !tarayiciKlasorleri().some(k => existsSync(path.join(k, `chromium-${c.revision}`)))) return null;
  } catch { return null; }
  return pathToFileURL(giris).href;
}
function playwrightBul() {
  if (process.env.PLAYWRIGHT_MODULE) return process.env.PLAYWRIGHT_MODULE;
  let f = root;
  for (let i = 0; i < 3; i++) {
    const ust = path.dirname(f); if (ust === f) break; f = ust;
    const burada = kurulumDene(f); if (burada) return burada;
    for (const ad of readdirSync(f, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
      const b = kurulumDene(path.join(f, ad)); if (b) return b;
    }
  }
  throw new Error('Playwright bulunamadı (PLAYWRIGHT_MODULE ver).');
}

const SAAT = `(() => {
  let simdi = 0; const sira = [];
  performance.now = () => simdi;
  Date.now = () => 1767571200000 + simdi;
  window.requestAnimationFrame = cb => sira.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__kare = ms => { simdi += ms; const liste = sira.splice(0); for (const cb of liste) cb(simdi); };
})()`;

const port = await bosPort(), adres = `http://127.0.0.1:${port}`;
const sunucu = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(adres + '/health')).ok) break; } catch { /* açılmadı */ } await bekle(150); }
  const { chromium } = await import(playwrightBul());
  const tarayici = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
  const sayfa = await tarayici.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const hatalar = [];
  sayfa.on('pageerror', e => hatalar.push(e.message));
  sayfa.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
  await sayfa.addInitScript(SAAT);
  await sayfa.goto(adres + '/?gosteri=hucum&muzik=0', { waitUntil: 'load', timeout: 45000 });
  await sayfa.waitForFunction('window.__gosteri && window.__gosteri.evre', null, { timeout: 30000, polling: 100 });
  for (let i = 0; i < 4; i++) { await sayfa.evaluate(() => window.__kare(0)); await bekle(150); }

  if (kareSn.length) mkdirSync(klasor, { recursive: true });
  const toplam = Math.round(K.isaret.son * 30);
  const kalan = new Set(kareSn.map(s => Math.round(s * 30)));
  console.log('sn    evre     kuzey(sol/mrk/sag)  guney(sol/mrk/sag)  kanatK/G döv  G.cephe  akınÖn  kaçak  taş  K.kahraman');
  for (let i = 1; i <= toplam; i++) {
    await sayfa.evaluate(() => window.__kare(1000 / 30));
    if (kalan.has(i)) {
      const sn = (i / 30).toFixed(1);
      await sayfa.screenshot({ path: path.join(klasor, `hucum-${sn}sn.jpg`), type: 'jpeg', quality: 88 });
      kalan.delete(i);
    }
    if (i % 15 === 0) {
      const d = await sayfa.evaluate(() => window.__gosteri);
      const s = (o) => `${o.sol}/${o.merkez}/${o.sag}`.padEnd(10);
      const k = d.kanatSavasi;
      console.log(`${d.saniye.toString().padEnd(6)}${d.evre.padEnd(9)}${s(d.kuzey)}          ${s(d.guney)}          ${(k.kuzey + '/' + k.guney + ' d' + k.dovusen).padEnd(14)}${String(k.guneyCephe).padEnd(9)}${String(d.akinOn).padEnd(8)}${String(d.seritKacagi).padEnd(7)}${String(d.tas).padEnd(5)}${d.kahraman.kuzey.can} ${d.kahraman.kuzey.sag ? 'sağ' : 'ÖLÜ'} b=${d.kahraman.kuzey.b}`);
    }
  }
  const son = await sayfa.evaluate(() => window.__gosteri);
  const satir = (ad, olculen, isaret) => `  ${ad.padEnd(22)} ${String(olculen).padStart(6)} sn   (işaret ${isaret})   fark ${(olculen - isaret).toFixed(2)}`;
  console.log('\nÖlçülen anlar:');
  console.log(`  kanatlar tükenmedi mi: en az Kuzey ${son.kanatEnAz.kuzey} · en az Güney ${son.kanatEnAz.guney} birim ayakta`);
  console.log(`  nida anında kanatlar: Kuzey ${son.nidaKanat.kuzey} · Güney ${son.nidaKanat.guney} · dövüşen ${son.nidaKanat.dovusen} · Güney cephesi ${son.nidaKanat.guneyCephe} (en güneyi ${son.guneyCepheEnAz})`);
  console.log(satir('hücum okçu hattında', son.carpisma, K.isaret.carpisma));
  console.log(satir('kahraman dibine varır', son.kahramanYetisti, K.isaret.kahramanOlur));
  // Ölüm anı bir ölçüm değil: kalkan (config kahramanKalkani) onu işarete oturtur. Gerçek ölçü üstteki
  // yetişme anı ve iki kahraman arasındaki en kısa mesafedir.
  console.log(satir('Kuzey kahramanı ölür', son.kahramanOlum, K.isaret.kahramanOlur) + '  [kalkan oturtur]');
  console.log(`  iki kahraman arası en kısa mesafe: ${son.kahramanAra} birim (sınır ${K.kahramanYetisme})`);
  console.log(`  Kapanışta: kadrajda ${son.kuzeyKalan} Kuzey birimi · merkezde ${son.kuzeyMerkezKalan} · hepsi kaçıyor mu: ${son.hepsiKaciyor}`);
  console.log(`\n  şerit kaçağı (en çok): ${son.seritKacagi} birim · atılan taş: ${son.tas} · yapı: ${son.yapi}`);
  console.log(`  son kadro — Kuzey ${JSON.stringify(son.kuzey)} · Güney ${JSON.stringify(son.guney)}`);
  if (hatalar.length) console.log('\nSayfa hataları:\n  ' + hatalar.slice(0, 8).join('\n  '));
  await tarayici.close();
} finally {
  sunucu.kill();
}
