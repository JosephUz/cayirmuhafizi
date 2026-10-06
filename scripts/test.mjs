// `npm test`: önce tarayıcısız **birim** testlerini (`tests/*.test.mjs`), sonra dumanı testlerini **kendi başına**
// koşturur — oyun sunucusunu boş bir portta açar, Playwright'ı bulur,
// testleri sırayla çalıştırır ve sonunda sunucuyu kapatır. Testleri tek tek koşturmak isteyen `GAME_URL` ve
// `PLAYWRIGHT_MODULE` vererek doğrudan `node tests/<ad>.mjs` diyebilir (bkz. README); bu betik aynı iki değişkeni
// kendisi hesaplar, böylece elle kurulum gerekmez.
//
// Playwright arama sırası: `PLAYWRIGHT_MODULE` → bu depodaki `playwright` → **komşu depolardaki** kurulum. Son
// adım bilerek var: Playwright bu depoya kurulu değil (oyun paketine girmesin diye), ama aynı makinedeki başka
// oyunlarda kuruludur. Komşu kurulumlardan **tarayıcısı gerçekten inmiş** olan seçilir; sürümle tarayıcı yapısı
// uyuşmazsa Playwright açılışta düşer.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Tarayıcısız birim testleri (`node --test`): sunucu da Playwright de gerekmez. */
const BIRIM_TESTLER = ['tests/gorunur-alan.test.mjs'];
const TESTLER = ['tests/gosteri-smoke.mjs', 'tests/gosteri-kahraman-smoke.mjs', 'tests/gosteri-savas-smoke.mjs', 'tests/gosteri-mancinik-smoke.mjs', 'tests/gosteri-hucum-smoke.mjs', 'tests/otopilot-smoke.mjs', 'tests/touch-smoke.mjs', 'tests/mobil-ust-alan.mjs', 'tests/muzik-smoke.mjs', 'tests/standart-cubuk.mjs'];

/** İşletim sisteminin verdiği boş bir port: sabit 5173 başka bir sunucuda açık olabilir. */
const bosPort = () => new Promise((çöz, hata) => {
  const s = createServer();
  s.on('error', hata);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => çöz(port)); });
});

/**
 * Playwright'ın indirdiği tarayıcıların durabileceği klasörler. Birden fazla aday var çünkü kabuk ortamı değişebiliyor:
 * Git Bash altında `LOCALAPPDATA` tanımsız gelebiliyor, bu yüzden `USERPROFILE` / `HOME` üzerinden de bakılır.
 */
function tarayiciKlasorleri() {
  const adaylar = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) adaylar.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  const ev = [process.env.LOCALAPPDATA, process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local'),
    process.env.HOME && path.join(process.env.HOME, 'AppData', 'Local')].filter(Boolean);
  for (const e of ev) adaylar.push(path.join(e, 'ms-playwright'));
  if (process.env.HOME) adaylar.push(path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright'), path.join(process.env.HOME, '.cache', 'ms-playwright'));
  return adaylar;
}

/** Bu Playwright kurulumunun istediği Chromium yapısı inmiş mi (inmemişse testler açılışta düşer)? */
function tarayicisiVar(kurulum) {
  try {
    const liste = JSON.parse(readFileSync(path.join(kurulum, '..', 'playwright-core', 'browsers.json'), 'utf8'));
    const chromium = liste.browsers.find(b => b.name === 'chromium');
    return Boolean(chromium) && tarayiciKlasorleri().some(k => existsSync(path.join(k, `chromium-${chromium.revision}`)));
  } catch { return false; }
}

/** Bir klasörde kurulu, tarayıcısı inmiş Playwright'ın giriş dosyası (yoksa null). */
function kurulumDene(klasor) {
  const kurulum = path.join(klasor, 'node_modules', 'playwright'), giris = path.join(kurulum, 'index.mjs');
  return existsSync(giris) && tarayicisiVar(kurulum) ? pathToFileURL(giris).href : null;
}

/**
 * Kullanılacak Playwright modülünün adresi (import edilebilir bir dize) ya da null. Bu depodan sonra **üst
 * klasörlere doğru** bakılır: hem üst klasörün kendisine hem de altındaki kardeş depolara (dal çalışma kopyaları
 * `C:/ju/_duzeltme/JOS-xxx` altında durduğu için bir değil iki kademe yukarı çıkmak gerekir).
 */
async function playwrightBul() {
  if (process.env.PLAYWRIGHT_MODULE) return process.env.PLAYWRIGHT_MODULE;
  try { await import('playwright'); return 'playwright'; } catch { /* bu depoda yok, komşulara bakılır */ }
  let klasor = root;
  for (let kademe = 0; kademe < 3; kademe++) {
    const ust = path.dirname(klasor);
    if (ust === klasor) break;
    klasor = ust;
    const burada = kurulumDene(klasor);
    if (burada) return burada;
    let komsular = [];
    try { komsular = readdirSync(klasor, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { continue; }
    for (const ad of komsular) {
      const bulundu = kurulumDene(path.join(klasor, ad));
      if (bulundu) return bulundu;
    }
  }
  return null;
}

/** Sunucu ayağa kalkana kadar bekler (en çok `sure` ms). */
async function sunucuyuBekle(adres, sure = 20000) {
  const bitis = Date.now() + sure;
  while (Date.now() < bitis) {
    try { const y = await fetch(adres + '/health'); if (y.ok) return true; } catch { /* henüz açılmadı */ }
    await new Promise(b => setTimeout(b, 150));
  }
  return false;
}

const kos = (komut, argv, env) => new Promise(çöz => {
  const c = spawn(komut, argv, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit', shell: false });
  c.on('close', kod => çöz(kod ?? 1));
  c.on('error', e => { console.error(e.message); çöz(1); });
});

// Birim testleri önce: tarayıcı ve sunucu gerektirmez, saniyeler sürer, düşerse dumanı testlerini beklemeye gerek yok.
const birim = await kos(process.execPath, ['--test', ...BIRIM_TESTLER]);
if (birim !== 0) process.exit(birim);

const playwright = await playwrightBul();
if (!playwright) {
  console.error('Playwright bulunamadı. Bu depoya kurulu değil ve komşu depolarda da tarayıcısı inmiş bir kurulum yok.');
  console.error('Çözüm: PLAYWRIGHT_MODULE ortam değişkenine kurulu bir playwright/index.mjs yolunu (file:// adresi) ver,');
  console.error('ya da bir yerde `npm i -D playwright && npx playwright install chromium` çalıştır.');
  process.exit(1);
}

const port = await bosPort();
const adres = `http://127.0.0.1:${port}`;
const sunucu = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
let kod = 0;
try {
  // Burada `process.exit` **kullanılmaz**: `finally` çalışmadan çıkılırsa açılan sunucu süreci arkada kalır.
  if (!await sunucuyuBekle(adres)) { console.error(`Oyun sunucusu ${adres} adresinde açılmadı.`); kod = 1; }
  else {
    console.log(`Oyun sunucusu: ${adres} · Playwright: ${playwright}\n`);
    for (const t of TESTLER) {
      const sonuc = await kos(process.execPath, [t], { GAME_URL: adres, PLAYWRIGHT_MODULE: playwright });
      if (sonuc !== 0) { kod = sonuc; break; }
    }
  }
} finally {
  sunucu.kill();
}
process.exit(kod);
