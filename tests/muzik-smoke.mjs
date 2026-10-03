// Oyun içi müzik dumanı testi (bkz. src/muzik.js). Denetlenenler: ilk tıklamadan önce hiç çalmaz, tıklayınca menüde
// sakin parça (`cayir-2-cayirda-sabah`) çalar ve ilerler, maç başlayınca maç parçasına (`cayir-1-kahramansiz-savas`)
// geçer, "Müzik kapalı" ayarı sayfa yenilenince korunur ve `?gosteri=1`'de hiç ses öğesi kurulmaz.
// Tarayıcı sesi `--mute-audio` ile kısılır: ölçüm `audio.currentTime` / `paused` üzerinden yapılır.
// Oyunun kendisi otomatik tarayıcıda müziği kapatır (navigator.webdriver), bu yüzden `?muzik=1` ile açılır.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true,
  args: ['--mute-audio', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  /** Sayfadaki bütün ses öğelerinin durumu: hangi dosya, duruyor mu, nerede, ne kadar sesli. */
  const sesler = () => page.evaluate(() => [...document.querySelectorAll('audio')].map(a => ({
    parca: a.dataset.parca, paused: a.paused, currentTime: a.currentTime, volume: a.volume, loop: a.loop,
  })));
  /** O an baskın olan parça: çapraz geçiş sırasında iki öğe birden çalar, sesi yüksek olan yeni parçadır. */
  const calan = async () => (await sesler()).filter(s => !s.paused && s.volume > 0).sort((a, b) => b.volume - a.volume)[0] || null;

  // 1) Açılış: oyun kurulur, müzik açıktır ama kullanıcı daha dokunmadığı için hiçbir şey çalmaz.
  await page.goto(url + '/?muzik=1');
  await page.waitForFunction(() => window.__meadow && window.__meadow.muzik, null, { timeout: 20000 });
  const ilk = await page.evaluate(() => window.__meadow.muzik.durum());
  assert.equal(ilk.kapali, false, 'müzik açık (?muzik=1)');
  assert.equal(ilk.acik, true, 'varsayılan ayar: müzik açık');
  assert.ok(Math.abs(ilk.ses - 0.35) < 0.001, `varsayılan ses düzeyi %35 (okunan: ${ilk.ses})`);
  assert.equal(await calan(), null, 'ilk dokunuştan önce hiçbir parça çalmaz');
  assert.equal((await sesler()).length, 0, 'dokunulmadan ses dosyası da yüklenmez');

  // 2) İlk tıklamadan sonra menüde sakin parça çalar ve gerçekten ilerler.
  await page.locator('#mg-home h1').click();
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('audio')].find(x => !x.paused);
    return a && a.dataset.parca === 'cayir-2-cayirda-sabah' && a.currentTime > 0.2;
  }, null, { timeout: 15000 });
  const menu = await calan();
  assert.equal(menu.parca, 'cayir-2-cayirda-sabah', 'menüde sakin parça çalar');
  assert.equal(menu.loop, true, 'tek parçalı sahne kendi kendine döner');
  const t0 = menu.currentTime;
  await page.waitForTimeout(1200);
  const menu2 = await calan();
  assert.ok(menu2.currentTime > t0 + 0.5, `sakin parça ilerler (${t0.toFixed(2)} → ${menu2.currentTime.toFixed(2)})`);
  assert.ok(menu2.volume > 0.3 && menu2.volume <= 0.36, `ses düzeyi ~%35 (okunan: ${menu2.volume.toFixed(3)})`);

  // 3) Maç başlayınca maç parçasına geçilir; sakin parça susar. Geçiş 1,8 sn çapraz süzülmedir.
  await page.locator('#home-solo').click();
  await page.locator('#setup-start').click();
  await page.waitForFunction(() => window.__meadow.running, null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.3);
    return a && a.dataset.parca === 'cayir-1-kahramansiz-savas' && a.currentTime > 0.2;
  }, null, { timeout: 15000 });
  const mac = await calan();
  assert.equal(mac.parca, 'cayir-1-kahramansiz-savas', 'maç başlayınca ana temaya geçilir');
  assert.equal(await page.evaluate(() => window.__meadow.muzik.durum().sahne), 'mac', 'müzik sahnesi: maç');
  await page.waitForFunction(() => {
    const s = [...document.querySelectorAll('audio')].find(x => x.dataset.parca === 'cayir-2-cayirda-sabah');
    return s && (s.paused || s.volume === 0);
  }, null, { timeout: 10000 });
  const sakin = (await sesler()).find(s => s.parca === 'cayir-2-cayirda-sabah');
  assert.ok(sakin.paused, 'sakin parça maçta susar');

  // 3b) Maç sahnesinde parça bitmeden öbürü üstüne açılır: ana tema ↔ çatışma sırayla gider. Parçalar iki dakikalık
  // olduğu için ana tema sonuna sarılır; geçişin kendisi (çapraz süzülme) olağan akıştaki gibi çalışır.
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('audio')].find(x => x.dataset.parca === 'cayir-1-kahramansiz-savas');
    a.currentTime = Math.max(0, a.duration - 2.4);
  });
  await page.waitForFunction(() => {
    const el = ad => [...document.querySelectorAll('audio')].find(x => x.dataset.parca === ad);
    const yeni = el('cayir-3-sancak-dusmeden'), eski = el('cayir-1-kahramansiz-savas');
    return yeni && !yeni.paused && yeni.currentTime > 0.1 && (eski.paused || eski.volume === 0);
  }, null, { timeout: 20000 });
  assert.equal((await calan()).parca, 'cayir-3-sancak-dusmeden', 'ana tema bitince çatışma parçası devralır');

  // 4) "Müzik kapalı" ayarı: Esc menüsünden kapat, sayfa yenilenince korunsun.
  await page.keyboard.press('Escape');
  await page.locator('#menu-muzik').click();
  assert.equal(await page.locator('#menu-muzik').textContent(), 'Müzik: kapalı', 'düğme kapalıyı gösterir');
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(a => a.paused || a.volume === 0), null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('cm.muzik')), 'off', 'ayar tarayıcıda saklanır');

  // 4b) Yeniden açınca **aynı sahnenin aynı parçası kaldığı yerden** sürer (başa sarmaz).
  const durdu = (await sesler()).find(s => s.parca === 'cayir-3-sancak-dusmeden').currentTime;
  assert.ok(durdu > 0.5, `kapatılan parça bir yerde durdu (${durdu.toFixed(2)} sn)`);
  await page.locator('#menu-muzik').click();
  assert.equal(await page.locator('#menu-muzik').textContent(), 'Müzik: açık', 'düğme yeniden açıldı');
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.3);
    return a && a.dataset.parca === 'cayir-3-sancak-dusmeden';
  }, null, { timeout: 10000 });
  const surdu = await calan();
  assert.ok(surdu.currentTime >= durdu, `kaldığı yerden sürer (${durdu.toFixed(2)} → ${surdu.currentTime.toFixed(2)} sn, başa sarmadı)`);

  // 4c) Efekt sesi düğmesi müziğe dokunmaz (ikisi ayrı anahtar).
  await page.locator('#menu-sound').click();
  assert.equal(await page.locator('#menu-sound').textContent(), 'Ses: kapalı', 'efekt sesi kapandı');
  await page.waitForTimeout(600);
  assert.equal((await calan()).parca, 'cayir-3-sancak-dusmeden', 'efekt sesi kapalıyken müzik çalmaya devam eder');
  await page.locator('#menu-sound').click();

  // Yenileme sınaması için müziği yeniden kapat.
  await page.locator('#menu-muzik').click();
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(a => a.paused || a.volume === 0), null, { timeout: 8000 });

  await page.goto(url + '/?muzik=1');
  await page.waitForFunction(() => window.__meadow && window.__meadow.muzik, null, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__meadow.muzik.durum().acik), false, 'yenilemeden sonra müzik kapalı');
  assert.equal(await page.locator('#home-muzik').textContent(), 'Müzik: kapalı', 'giriş ekranındaki düğme de kapalı yazar');
  await page.locator('#mg-home h1').click();
  await page.waitForTimeout(2500);
  assert.equal(await calan(), null, 'müzik kapalıyken tıklamadan sonra da hiç çalmaz');
  assert.equal((await sesler()).length, 0, 'müzik kapalıyken dosya da inmez');

  // Ayarı geri aç: sonraki testler (ve elle açanlar) aynı tarayıcı profilinde kalmasın.
  await page.locator('#home-muzik').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('cm.muzik')), 'on', 'ayar geri açılabilir');

  // 5) Gösteri kipi: video betiği müziğini kendi ekler, oyun hiç ses öğesi kurmaz.
  await page.goto(url + '/?gosteri=1');
  await page.waitForFunction(() => window.__meadow && window.__meadow.running, null, { timeout: 20000 });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => window.__meadow.muzik.durum().kapali), true, 'gösteride müzik kapalıdır');
  assert.equal((await sesler()).length, 0, '?gosteri=1 sayfasında hiç <audio> öğesi yok');
  assert.ok(await page.locator('#home-muzik').isHidden(), 'gösteride müzik düğmesi gizli');

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log('Müzik dumanı testi geçti.');
} finally {
  await browser.close();
}
