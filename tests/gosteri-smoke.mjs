// Gösteri kipi dumanı testi (?gosteri=1): içerik klipleri için "kendi kendine oynayan" maç çalışıyor mu?
// Denetlenenler: menü atlanır ve maç başlar, iki tarafta da insan oyuncu yoktur, arayüz panelleri gizlidir, sunucuya
// hiç WebSocket açılmaz ve ölçüm isteği gitmez, ilk 10 saniyede çatışma başlar, kamera çatışmayı takip eder, maç
// bitince yenisi başlar. Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: [...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Açılan WebSocket'ler ve ölçüm çağrıları sayılır: gösteri kipinde ikisi de olmamalı.
  await ctx.addInitScript(() => {
    window.__sockets = 0; window.__olcum = 0;
    const WS = window.WebSocket;
    window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
    const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (beacon) navigator.sendBeacon = (u, b) => { window.__olcum++; return beacon(u, b); };
    const fetch0 = window.fetch.bind(window);
    window.fetch = (u, o) => { if (String(u).includes('/api/olay')) window.__olcum++; return fetch0(u, o); };
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);

  await page.goto(url + '/?gosteri=1');
  await page.waitForFunction(() => window.__meadow && window.__meadow.running, null, { timeout: 20000 });

  // 1) Menü atlanır, iki tarafı da bot yönetir.
  assert.ok(await page.locator('#mg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('meadow-game').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  assert.ok(await game(() => window.__meadow.players.length >= 2), 'iki taraf da kurulur');
  assert.equal(await game(() => window.__meadow.players.filter(p => p.human).length), 0, 'hiç insan oyuncu yok');

  // 2) Arayüz gizli: alt bant, minimap, üst sayaçlar, skor.
  for (const sel of ['#mg-bar', '#mg-hud', '#mg-score', '#mg-minimap']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }

  // 3) İlk 10 saniyede çatışma: iki taraf da hasar vermiş olmalı.
  await page.waitForFunction(() => window.__meadow.players.some(p => p.st.dmgDealt > 0), null, { timeout: 10000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'artifacts/gosteri-1-savas.png' });

  // 4) Ne ağ ne ölçüm.
  assert.equal(await game(() => window.__sockets), 0, 'gösteri kipinde sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'gösteri kipinde ölçüm olayı gitmez');

  // 5) Kamera çatışmayı takip eder: bakılan noktanın yakınında karşı karşıya gelmiş birimler var.
  const kamera = await game(() => {
    const w = window.__meadow, c = w.camTarget;
    let yakin = Infinity;
    for (const a of w.entities) {
      if (!a.alive || a.isWorker) continue;
      for (const b of w.entities) {
        if (!b.alive || b.isWorker || b.faction === a.faction) continue;
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 6) continue;
        yakin = Math.min(yakin, Math.hypot(a.pos.x - c.x, a.pos.z - c.z));
      }
    }
    return { yakin, x: c.x, z: c.z };
  });
  assert.ok(kamera.yakin < 30, `kamera çatışmaya bakar (en yakın çatışma ${Math.round(kamera.yakin)} birim)`);

  // 6) Maç bitince yenisi başlar (bitişi elle tetikleyip bekliyoruz).
  const oncekiSure = await game(() => window.__meadow.time);
  assert.ok(oncekiSure > 5, 'maç iki kat hızda ilerler');
  await game(() => { window.__meadow.ended = true; window.__meadow.onEnd({}); });
  await page.waitForFunction(t => window.__meadow.running && !window.__meadow.ended && window.__meadow.time < t, oncekiSure, { timeout: 15000 });
  assert.ok(await game(() => window.__meadow.entities.length > 0), 'yeni maç kurulur');
  await page.screenshot({ path: 'artifacts/gosteri-2-yeni-mac.png' });

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log('Gösteri kipi dumanı testi geçti.');
} finally {
  await browser.close();
}
