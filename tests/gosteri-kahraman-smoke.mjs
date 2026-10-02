// Kahramanların gücü gösterisi dumanı testi (?gosteri=kahraman): içerik videosu için sahnelenmiş sahne çalışıyor mu?
// Denetlenenler: menü atlanır, 1000 düşman (hepsi seviye 1, beyinsiz) kurulur, kahraman Mızraklı Atlıdır, kamera 3B'dir,
// arayüz gizlidir, sunucuya hiç WebSocket açılmaz ve ölçüm isteği gitmez, akış zıplama -> sağ tık alanı -> koridor
// dalgaları olarak işler ve kalabalıkta gözle görülür ölüm olur, sahne 10-14 sn'de bir baştan kurulur.
// Zıplama, sağ tık alanı ve dalga anlarının ekran görüntüsü artifacts/ altına yazılır, kare hızı ölçülüp basılır.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true,
  args: ['--mute-audio', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Açılan WebSocket'ler ve ölçüm çağrıları sayılır (gösteride ikisi de olmamalı); kare hızı için de kare sayılır.
  await ctx.addInitScript(() => {
    window.__sockets = 0; window.__olcum = 0; window.__kare = 0;
    const WS = window.WebSocket;
    window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
    const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (beacon) navigator.sendBeacon = (u, b) => { window.__olcum++; return beacon(u, b); };
    const fetch0 = window.fetch.bind(window);
    window.fetch = (u, o) => { if (String(u).includes('/api/olay')) window.__olcum++; return fetch0(u, o); };
    const tik = () => { window.__kare++; requestAnimationFrame(tik); }; requestAnimationFrame(tik);
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);

  const acildi = Date.now();
  await page.goto(url + '/?gosteri=kahraman');
  await page.waitForFunction(() => window.__meadow && window.__meadow.running && window.__meadow.gosteriDurum, null, { timeout: 30000 });

  // 1) Menü atlanır, sahne kurulur: 1000 düşman, hepsi seviye 1 ve beyinsiz (kıpırdamaz, saldırmaz).
  assert.ok(await page.locator('#mg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('meadow-game').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  const kadro = await game(() => {
    const w = window.__meadow, c = w.entities.filter(e => e.gosteriBirim);
    return {
      sayi: c.length, seviyeBir: c.every(e => e.level === 1), beyinsiz: c.every(e => !e.brain),
      dusman: c.every(e => e.faction !== w.player.faction),
      kahraman: w.player.loadout, kahramanSeviye: w.player.level,
      yaricap: Math.max(...c.map(e => Math.hypot(e.pos.x, e.pos.z))),
    };
  });
  assert.equal(kadro.sayi, 1000, 'ortada 1000 düşman durur');
  assert.ok(kadro.seviyeBir, 'kalabalığın hepsi seviye 1');
  assert.ok(kadro.beyinsiz, 'kalabalığın beyni yok: kahraman gelmeden dağılmaz');
  assert.ok(kadro.dusman, 'kalabalık kahramanın düşmanı');
  assert.deepEqual(kadro.kahraman, { weapon: 'spear', shield: false, horse: true }, 'kahraman Mızraklı Atlı');

  // 2) Kamera 3B (perspektif), izometrik değil.
  assert.ok(await game(() => window.__meadow.camera.isPerspectiveCamera === true), 'kamera 3B (perspektif)');

  // 3) Arayüz gizli: alt bant, minimap, üst sayaçlar, skor.
  for (const sel of ['#mg-bar', '#mg-hud', '#mg-score', '#mg-minimap']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }

  /**
   * 4) Akış: zıplama -> havada sağ tık alanı -> yere inince koridor dalgaları. Her anın ekran görüntüsü alınır.
   * Sahne durumu 80 ms'de bir okunur: 1000 birimi tek tek saymamak için yalnız sayaçlara bakılır.
   */
  const bak = () => game(() => {
    const w = window.__meadow, p = w.player, d = w.gosteriDurum();
    return { evre: d.evre, tur: d.tur, ayakta: d.ayakta, yazi: d.yazi, y: p.jumpY, zones: w.zones.map(z => z.kind) };
  });
  const olay = { zipla: 0, alan: 0, vakum: false, dalga: 0, enAzAyakta: 1000, turBasi: [] };
  let oncekiTur = 0;
  for (let i = 0; i < 420; i++) {
    const s = await bak();
    const gecen = (Date.now() - acildi) / 1000;
    if (s.tur !== oncekiTur) { olay.turBasi.push(+gecen.toFixed(1)); oncekiTur = s.tur; }
    if (!olay.zipla && s.y > 1.5) { olay.zipla = gecen; await page.screenshot({ path: 'artifacts/kahraman-1-zipla.png' }); }
    if (!olay.alan && s.zones.includes('spikes')) {
      olay.alan = gecen;
      olay.vakum = await game(() => window.__meadow.zones.some(z => z.kind === 'spikes' && z.vacuum && z.vacuum.radius > 0));
      await page.screenshot({ path: 'artifacts/kahraman-2-sagtik-alan.png' });
    }
    if (!olay.dalga && s.zones.includes('burst')) { olay.dalga = gecen; await page.screenshot({ path: 'artifacts/kahraman-3-dalga.png' }); }
    if (s.ayakta < olay.enAzAyakta) olay.enAzAyakta = s.ayakta;
    if (olay.dalga && olay.turBasi.length >= 3) break;
    await page.waitForTimeout(80);
  }
  assert.ok(olay.zipla > 0, 'kahraman zıplar');
  assert.ok(olay.alan > olay.zipla, 'zıpladıktan sonra sağ tık alanı açılır');
  assert.ok(olay.vakum, 'alan vakumludur: düşmanlar merkeze çekilir');
  assert.ok(olay.dalga > olay.alan, 'alandan sonra sol tık şarjının koridor dalgaları iner');
  assert.ok(olay.enAzAyakta <= 900, `dalgalar kalabalığı biçer (en az ${1000 - olay.enAzAyakta} birim düştü)`);

  // 5) Döngü: sahne 10-14 sn'de bir baştan kurulur ve kalabalık yeniden 1000 olur.
  assert.ok(olay.turBasi.length >= 3, `sahne tekrar eder (görülen tur başlangıçları: ${olay.turBasi.join(', ')})`);
  const sureler = olay.turBasi.slice(1).map((t, i) => +(t - olay.turBasi[i]).toFixed(1));
  for (const s of sureler) assert.ok(s >= 9 && s <= 15, `bir tur 10-14 sn sürer (ölçülen ${s} sn)`);
  assert.equal(await game(() => window.__meadow.entities.filter(e => e.gosteriBirim).length), 1000, 'her turda kalabalık yeniden kurulur');

  // 6) Ne ağ ne ölçüm.
  assert.equal(await game(() => window.__sockets), 0, 'gösteride sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'gösteride ölçüm olayı gitmez');

  /**
   * 7) Kare hızı: 1000 birimle akıcı kalmalı. Eşik bilerek düşük (masaüstü hedefi 60, ölçülen ~55): bu bir başarım
   * ölçütü değil, **ağır gerileme** alarmıdır — sayı donanıma bağlıdır. Zayıf makinede `FPS_ESIK` ile indirilebilir.
   */
  const esik = Number(process.env.FPS_ESIK || 40);
  const k0 = await game(() => window.__kare);
  await page.waitForTimeout(8000);
  const fps = ((await game(() => window.__kare) - k0) / 8);
  const cizim = await game(() => { const r = window.__meadow.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
  assert.ok(fps >= esik, `1000 birimle kare hızı yeterli (ölçülen ${fps.toFixed(1)} fps, eşik ${esik})`);

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log('Kahraman gösterisi dumanı testi geçti.');
  console.log(`  tur başlangıçları (sn): ${olay.turBasi.join(', ')} · tur süresi: ${sureler.join(', ')} sn`);
  console.log(`  zıplama ${olay.zipla.toFixed(1)} sn · sağ tık alanı ${olay.alan.toFixed(1)} sn · ilk dalga ${olay.dalga.toFixed(1)} sn`);
  console.log(`  en az ayakta kalan: ${olay.enAzAyakta} / 1000 · kalabalık yarıçapı ${kadro.yaricap.toFixed(1)} birim · kahraman seviye ${kadro.kahramanSeviye}`);
  console.log(`  kare hızı: ${fps.toFixed(1)} fps (1280x720, ${cizim.calls} çizim çağrısı, ${cizim.tris} üçgen)`);
} finally {
  await browser.close();
}
