// Dokunmatik dumanı testi: yatay telefon taklidiyle (844x390, dokunmatik) çalışan sunucuya bağlanır. Uygulama kipinde (?app)
// oda düğmelerinin "Yakında" olduğunu ve hiç WebSocket açılmadığını; joystick'i (yürüme, sonuna kadar itince koşu), SALDIR,
// ORDU düğmelerini, ⚒ çekmecesini, iki dokunuşla bina dikmeyi, yapıya dokununca seçimi, omuz üstünde parmakla bakışı,
// menüyü ve dik tutunca "yan çevir" uyarısını dener. Dokunuşlar Chrome DevTools (Input.dispatchTouchEvent) ile çoklu parmak.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: [...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });
try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // Açılan WebSocket'ler ve dışarı çıkan ölçüm istekleri sayılır: uygulama kipinde ikisi de olmamalı.
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
  // Konsol hatasının yanına **adresi** de yaz: "Failed to load resource" metni tek başına hangi isteğin
  // düştüğünü söylemez, düşen testten sebebi okumak imkânsızlaşır.
  page.on('console', e => {
    if (e.type() !== 'error') return;
    const yer = e.location() && e.location().url;
    errors.push(yer ? `${e.text()} [${yer}]` : e.text());
  });
  const game = (fn, arg) => page.evaluate(fn, arg);
  const hero = () => game(() => { const p = window.__meadow.player; return { x: p.pos.x, z: p.pos.z, sprinting: p.sprinting, attackTimer: p.attackTimer }; });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const center = async sel => { const b = await page.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const tapAt = async ([x, y], hold = 70) => { await touch('touchStart', [[x, y]]); await page.waitForTimeout(hold); await touch('touchEnd', []); };
  /** Dünya noktasının ekran konumu (sahne tam ekran). */
  const screenOf = (x, z) => game(([x, z]) => { const p = window.__meadow.toScreen({ x, y: 0, z, clone() { return this; } }); return [p.x, p.y]; }, [x, z]);

  await page.goto(url + '/?test=1&app');
  await page.waitForFunction(() => !!window.__meadow && !document.querySelector('#mg-home').hidden);
  assert.ok(await game(() => document.getElementById('meadow-game').classList.contains('touch')), 'dokunmatik kip açılmalı');
  assert.ok(await page.locator('#home-create').isDisabled(), 'Oda kur basılmaz');
  assert.ok(await page.locator('#home-join').isDisabled(), 'Odaya katıl basılmaz');
  assert.ok(await page.locator('#home-quick').isDisabled(), 'Hızlı katıl basılmaz');
  assert.equal(await page.locator('.soon-tag').count(), 3, 'üç çevrim içi düğmede YAKINDA');
  assert.ok(await page.locator('#home-rooms').isHidden(), 'açık oda listesi gizli');
  await page.screenshot({ path: 'artifacts/t1-home-app.png' });

  await page.tap('#home-solo');
  await page.tap('#setup-start');
  await page.waitForFunction(() => window.__meadow.running);
  await page.waitForTimeout(400);
  assert.equal(await game(() => window.__sockets), 0, 'uygulama kipinde sunucuya bağlanılmaz');
  // Maç başlarken ölçüm olayı doğar (olcum.js macBasladi), ama `?app` yalnız uygulama kipinin **taklididir**:
  // yerel sayfadan dışarı gerçek bir istek çıkmamalı (bkz. platform.js olcumUrl). Çıksaydı hem üretim
  // sayıları test koşularıyla kirlenirdi hem de ağsız makinede `npm test` konsol hatasıyla düşerdi.
  assert.equal(await game(() => window.__olcum), 0, 'yerelde uygulama kipi taklidinden ölçüm gitmez');
  assert.ok(await page.locator('.tbtn[data-t=attack]').isVisible(), 'dokunmatik düğmeler görünür');
  assert.ok(await page.locator('#mg-tbar').isVisible(), 'üst düğmeler görünür');
  assert.ok(!(await game(() => document.getElementById('meadow-game').classList.contains('drawer'))), 'çekmece kapalı başlar');

  // Joystick: yürür; sonuna kadar itiş koşar.
  const start = await hero();
  await touch('touchStart', [[150, 250]]);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', [[150, 250 - i * 7]]); await page.waitForTimeout(30); }
  await page.waitForTimeout(400);
  const walked = await hero();
  assert.ok(Math.hypot(walked.x - start.x, walked.z - start.z) > 0.8, 'joystick yürütür');
  assert.equal(walked.sprinting, false, 'yarım itiş koşmaz');
  await touch('touchMove', [[150, 170]]);
  await page.waitForTimeout(150);
  assert.equal((await hero()).sprinting, true, 'sonuna kadar itiş koşar');
  await page.screenshot({ path: 'artifacts/t2-stick.png' });
  await touch('touchEnd', []);
  await page.waitForTimeout(150);

  // SALDIR: vuruş başlar; ORDU: toplanma alanı kahramana dikilir.
  await tapAt(await center('.tbtn[data-t=attack]'));
  await page.waitForTimeout(40);
  assert.ok((await hero()).attackTimer > 0, 'SALDIR vurur');
  await tapAt(await center('.tbtn[data-t=army]'));
  await page.waitForTimeout(60);
  const rally = await game(() => { const r = window.__meadow.me.rally, p = window.__meadow.player.pos; return r && Math.hypot(r.x - p.x, r.z - p.z); });
  assert.ok(rally !== null && rally < 1, 'ORDU toplanma alanını kahramana diker');

  // ⚒ (ZIPLA'nın üstünde) çekmece: açılır, sağ altta ✕ belirir; Kışla seçilince kapanır; sahaya iki dokunuş: hayalet, sonra dikme.
  assert.ok(!(await page.locator('#mg-drawer-close').isVisible()), 'çekmece kapalıyken ✕ yok');
  await tapAt(await center('.tbtn[data-t=build]'));
  await page.waitForTimeout(250);
  assert.ok(await game(() => document.getElementById('meadow-game').classList.contains('drawer')), '⚒ çekmeceyi açar');
  assert.ok(!(await page.locator('.tbtn[data-t=attack]').isVisible()), 'çekmece açıkken düğmeler gizli');
  assert.ok(await page.locator('#mg-drawer-close').isVisible(), 'çekmece açıkken sağ altta ✕');
  await page.screenshot({ path: 'artifacts/t3-drawer.png' });
  await page.tap('#mg-cmd [data-build=barracks]');
  await page.waitForTimeout(250);
  assert.equal(await game(() => window.__meadow.placing), 'barracks', 'Kışla yerleştirme başlar');
  assert.ok(!(await game(() => document.getElementById('meadow-game').classList.contains('drawer'))), 'yerleştirirken çekmece kapanır');
  const before = await game(() => window.__meadow.structures.length);
  const p0 = await hero();
  const spot = await screenOf(p0.x + 7, p0.z - 3);
  await tapAt(spot);
  await page.waitForTimeout(200);
  assert.equal(await game(() => window.__meadow.placing), 'barracks', 'ilk dokunuş hayaleti koyar');
  assert.ok(await page.locator('#mg-place-tap b').isVisible(), 'hayaletin tepesinde ⚒ "tekrar dokun"');
  await page.screenshot({ path: 'artifacts/t4-ghost.png' });
  await tapAt(spot);
  await page.waitForTimeout(200);
  const placed = await game(() => ({ placing: window.__meadow.placing, n: window.__meadow.structures.length, err: window.__meadow.placeError }));
  assert.equal(placed.placing, null, 'ikinci dokunuş diker (' + placed.err + ')');
  assert.equal(placed.n, before + 1, 'yeni yapı');
  assert.ok(!(await page.locator('#mg-place-tap b').isVisible()), 'dikilince ⚒ kaybolur');

  // Kendi yapına dokun: seçilir, çekmece açılır.
  const banner = await game(() => { const s = window.__meadow.structures.find(o => o.owner === window.__meadow.me && o.kind === 'banner'); return s && [s.pos.x, s.pos.z]; });
  assert.ok(banner, 'sancak bulundu');
  await tapAt(await screenOf(banner[0], banner[1]));
  await page.waitForTimeout(250);
  assert.equal(await game(() => window.__meadow.sel.structure && window.__meadow.sel.structure.kind), 'banner', 'dokunulan yapı seçilir');
  assert.ok(await game(() => document.getElementById('meadow-game').classList.contains('drawer')), 'yapı seçilince çekmece açılır');
  assert.ok(await page.locator('#mg-cmd > :nth-child(5)[data-close]').count(), 'Kapat sağ üst yuvada');
  await page.screenshot({ path: 'artifacts/t5-banner.png' });
  await page.tap('#mg-drawer-close');
  await page.waitForTimeout(200);
  assert.ok(!(await game(() => document.getElementById('meadow-game').classList.contains('drawer'))), '✕ çekmeceyi kapatır');

  // 🎥 omuz üstü: sağ yarıda parmak kaydırmak bakışı çevirir, artı görünür.
  await page.tap('#mg-tbar [data-tb=cam]');
  await page.waitForTimeout(200);
  assert.equal(await game(() => window.__meadow.cam), 'tps');
  assert.ok(await page.locator('#mg-cross').isVisible(), 'omuz üstünde artı');
  const y0 = await game(() => window.__meadow.look.yaw);
  await touch('touchStart', [[600, 200]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[600 + i * 12, 200]]); await page.waitForTimeout(20); }
  await touch('touchEnd', []);
  await page.waitForTimeout(80);
  assert.ok(Math.abs((await game(() => window.__meadow.look.yaw)) - y0) > 0.1, 'omuz üstünde parmakla bakış');
  await page.screenshot({ path: 'artifacts/t5-tps.png' });

  // ☰ menü: oyun durur, düğmeler gizlenir.
  /**
   * Dokunuş sonucu çıkana kadar dener. Yukarıdaki bakış kaydırması CDP ile elle gönderildiği için (Playwright'ın
   * kendi dokunuş sırasının dışında), ondan sonraki ilk `tap` arada Chromium tarafından yutuluyor ve düğme hiç
   * basılmamış oluyordu — test de boşuna düşüyordu. Sonuç gelene kadar dokunuşu tekrarlamak bunu kapatır.
   */
  const tapTaDa = async (dugme, bekleyen, mesaj) => {
    for (let i = 0; i < 4; i++) {
      if (await page.locator(bekleyen).isVisible()) return;
      await page.tap(dugme);
      await page.waitForTimeout(300);
    }
    assert.ok(await page.locator(bekleyen).isVisible(), mesaj);
  };
  await tapTaDa('#mg-tbar [data-tb=menu]', '#mg-menu', '☰ menüyü açar');
  assert.ok(await game(() => window.__meadow.paused), 'menü oyunu durdurur');
  assert.ok(!(await page.locator('.tbtn[data-t=attack]').isVisible()), 'menüde düğmeler gizli');
  await tapTaDa('#menu-resume', '.tbtn[data-t=attack]', 'Devam et oyuna döner');

  // Başsız Chromium tam ekran isteğini kabul eder; boyut değiştirmek için önce çıkılır.
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#mg-rotate').isVisible(), 'dik tutunca yan çevir uyarısı');
  assert.deepEqual(errors, []);
  console.log('dokunmatik dumanı testi geçti');
} finally {
  await browser.close();
}
