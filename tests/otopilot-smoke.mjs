// Otopilot dumanı testi (?otopilot=1): içerik videoları için "kahramanı bir bot oynayan" gerçek maç çalışıyor mu?
// Denetlenenler: menü atlanır ve maç başlar, bir insan koltuğu vardır ve kahramanı girdiyle oynanır, bot komutan
// insanın kasasını da sürer (asker üretir), kahraman hareket eder / vurur / yeteneklerini kullanır, duvara takılıp
// kalmaz, sunucuya hiç WebSocket açılmaz ve ölçüm isteği gitmez, kamera kahramanı izler, maç bitince yenisi başlar.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: [...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Açılan WebSocket'ler ve ölçüm çağrıları sayılır: otopilotta ikisi de olmamalı.
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

  await page.goto(url + '/?otopilot=1&muzik=0');
  await page.waitForFunction(() => window.__meadow && window.__meadow.running, null, { timeout: 20000 });

  // 1) Menü atlanır; gösteriden farklı olarak **bir insan koltuğu** vardır ve kamera onun kahramanını izler.
  assert.ok(await page.locator('#mg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.equal(await game(() => window.__meadow.players.filter(p => p.human).length), 1, 'tek insan koltuğu');
  assert.ok(await game(() => window.__meadow.me.otopilot === true), 'insan koltuğu otopilottadır');
  assert.ok(await game(() => window.__meadow.player && window.__meadow.player.isPlayer === true), 'kamera oyuncunun kahramanını izler');
  assert.ok(await game(() => !document.getElementById('meadow-game').classList.contains('gosteri')), 'gösteri kipi değil: arayüz normal oyundaki gibi durur');

  // Otopilot koltuğunun **maç başındaki** sayaçları: 4. adım bunların üstüne gerçekten üretim geldiğini sınar.
  // Maç "çatışma başlangıcı"ndan açıldığı için herkese bir bölük basılıyor (bkz. otopilot.js cepheyeDiz) ve bu da
  // soldiersSpawned'ı artırıyor; mutlak sayıya ya da rakiple orana bakmak üretim hiç olmasa da geçerdi.
  const bas = await game(() => {
    const w = window.__meadow;
    return { asker: w.me.eco.soldiersSpawned, isci: w.entities.filter(e => e.alive && e.owner === w.me && e.isWorker).length };
  });

  // 2) Kahramanın girdisi gerçekten üretiliyor: hareket eder ve yer değiştirir.
  const yer0 = await game(() => ({ x: window.__meadow.player.pos.x, z: window.__meadow.player.pos.z }));
  await page.waitForTimeout(6000);
  const yer1 = await game(() => ({ x: window.__meadow.player.pos.x, z: window.__meadow.player.pos.z }));
  assert.ok(Math.hypot(yer1.x - yer0.x, yer1.z - yer0.z) > 5, 'kahraman boş durmaz, sahada ilerler');

  // 3) Kahraman dövüşür: 40 saniye boyunca vuruş, şarj, atılma ve zıplama örneklenir.
  await game(() => {
    const w = window.__meadow;
    w.__say = { vurus: 0, sarj: 0, atilma: 0, ziplama: 0, yakin: 0 };
    let v = 0, a = 0, z = 0;
    w.__sayac = setInterval(() => {
      const p = w.player, s = w.__say; if (!p) return;
      if (p.attackTimer > 0 && v <= 0) s.vurus++;
      if (p.dodgeTimer > 0 && a <= 0) s.atilma++;
      if (p.jumpY > 0.2 && z <= 0.2) s.ziplama++;
      v = p.attackTimer; a = p.dodgeTimer; z = p.jumpY;
      if (p.charging) s.sarj++;
      if (w.entities.some(e => e.alive && e.faction !== p.faction && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 8)) s.yakin++;
    }, 50);
  });
  await page.waitForTimeout(40000);
  const say = await game(() => { clearInterval(window.__meadow.__sayac); return window.__meadow.__say; });
  await page.screenshot({ path: 'artifacts/otopilot-1-dovus.png' });
  assert.ok(say.yakin > 40, `kahraman çatışmanın içinde (düşman dibinde ${say.yakin} örnek)`);
  assert.ok(say.vurus + say.sarj > 0, `kahraman saldırır (vuruş ${say.vurus}, şarj ${say.sarj})`);
  assert.ok(say.atilma + say.ziplama > 0, `kahraman yeteneklerini kullanır (atılma ${say.atilma}, zıplama ${say.ziplama})`);

  // 4) Bot komutan insanın kasasını da sürer (economy.js updateBots → `p.otopilot`): maç başındaki bölüğün **üstüne**
  // yeni asker ve işçi gelmiş olmalı. Ölçü maç başına göre artış: başlangıç bölüğü ikisinde de aynı olduğu için
  // mutlak sayı ya da rakiple oran, üretim hiç koşmasa da geçerdi.
  const son = await game(() => {
    const w = window.__meadow;
    return { asker: w.me.eco.soldiersSpawned, isci: w.entities.filter(e => e.alive && e.owner === w.me && e.isWorker).length, kuyruk: w.structures.filter(s => s.alive && s.owner === w.me).reduce((n, s) => n + (s.queue ? s.queue.length : 0), 0) };
  });
  assert.ok(son.asker > bas.asker,
    `otopilot koltuğu maç içinde asker üretir (başlangıç ${bas.asker} → ${son.asker})`);
  assert.ok(son.isci > bas.isci || son.kuyruk > 0,
    `otopilot koltuğu işçi de basar (işçi ${bas.isci} → ${son.isci}, kuyrukta ${son.kuyruk})`);
  assert.ok(await game(() => window.__meadow.entities.length > 40), 'sahada gerçek bir maç kadrosu var');

  // 5) Kamera kahramanı izler (ölü değilse): bakılan nokta kahramanın birkaç birim yakınında.
  const kam = await game(() => {
    const w = window.__meadow, c = w.camTarget, p = w.player;
    return { d: Math.hypot(p.pos.x - c.x, p.pos.z - c.z), canli: p.alive };
  });
  if (kam.canli) assert.ok(kam.d < 6, `kamera kahramanı izler (${kam.d.toFixed(1)} birim)`);

  // 6) Ne ağ ne ölçüm.
  assert.equal(await game(() => window.__sockets), 0, 'otopilotta sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'otopilotta ölçüm olayı gitmez');

  /**
   * 7) Klavye hiç okunmaz: kayıt sırasında yanlışlıkla basılan Esc molayı, F1 de yardım penceresini açmamalı —
   * ikisi de maçı dondurur ve videoya menü girerdi (bkz. input.js `world.otopilot` dalı).
   */
  for (const tus of ['Escape', 'F1']) await page.keyboard.press(tus);
  await page.waitForTimeout(500);
  assert.ok(await game(() => !window.__meadow.paused), 'Esc otopilotta mola açmaz');
  assert.ok(await page.locator('#mg-help').isHidden(), 'F1 otopilotta yardım penceresini açmaz');

  // 8) Maç bitince sonuç ekranı açılmaz, yenisi başlar.
  const onceki = await game(() => window.__meadow.time);
  await game(() => { window.__meadow.ended = true; window.__meadow.onEnd({}); });
  await page.waitForFunction(t => window.__meadow.running && !window.__meadow.ended && window.__meadow.time < t, onceki, { timeout: 15000 });
  assert.ok(await page.locator('#mg-end').isHidden(), 'sonuç ekranı açılmaz');
  assert.ok(await game(() => window.__meadow.entities.length > 0), 'yeni maç kurulur');
  await page.screenshot({ path: 'artifacts/otopilot-2-yeni-mac.png' });

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log(`Otopilot dumanı testi geçti (vuruş ${say.vurus}, şarj ${say.sarj}, atılma ${say.atilma}, zıplama ${say.ziplama}).`);
} finally {
  await browser.close();
}
