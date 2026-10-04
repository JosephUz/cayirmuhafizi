// Oyun içi müzik dumanı testi (bkz. src/muzik.js). Denetlenenler: ilk tıklamadan önce hiç çalmaz, tıklayınca menüde
// sakin parça (`cayir-8-degirmen-yolu`) çalar ve ilerler, maç başlayınca maç parçasına (`cayir-7-cayir-turkusu`)
// geçer, sancak erimeye başlayınca doruk parçasına (`cayir-9-kalkan-duvari`) geçer, "Müzik kapalı" ve sıfıra
// çekilmiş ses düzeyi ayarları sayfa yenilenince korunur ve `?gosteri=1`'de hiç ses öğesi kurulmaz.
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
  assert.ok(Math.abs(ilk.ses - 0.2) < 0.001, `varsayılan ses düzeyi %20 (okunan: ${ilk.ses})`);
  assert.equal(await calan(), null, 'ilk dokunuştan önce hiçbir parça çalmaz');
  assert.equal((await sesler()).length, 0, 'dokunulmadan ses dosyası da yüklenmez');

  // 2) İlk tıklamadan sonra menüde sakin parça çalar ve gerçekten ilerler.
  await page.locator('#mg-home h1').click();
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('audio')].find(x => !x.paused);
    return a && a.dataset.parca === 'cayir-8-degirmen-yolu' && a.currentTime > 0.2;
  }, null, { timeout: 15000 });
  const menu = await calan();
  assert.equal(menu.parca, 'cayir-8-degirmen-yolu', 'menüde sakin parça çalar');
  assert.equal(menu.loop, true, 'tek parçalı sahne kendi kendine döner');
  const t0 = menu.currentTime;
  await page.waitForTimeout(1200);
  const menu2 = await calan();
  assert.ok(menu2.currentTime > t0 + 0.5, `sakin parça ilerler (${t0.toFixed(2)} → ${menu2.currentTime.toFixed(2)})`);
  assert.ok(menu2.volume > 0.16 && menu2.volume <= 0.21, `ses düzeyi ~%20 (okunan: ${menu2.volume.toFixed(3)})`);

  // 3) Maç başlayınca maç parçasına geçilir; sakin parça susar. Geçiş 1,8 sn çapraz süzülmedir.
  await page.locator('#home-solo').click();
  await page.locator('#setup-start').click();
  await page.waitForFunction(() => window.__meadow.running, null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.15);
    return a && a.dataset.parca === 'cayir-7-cayir-turkusu' && a.currentTime > 0.2;
  }, null, { timeout: 15000 });
  const mac = await calan();
  assert.equal(mac.parca, 'cayir-7-cayir-turkusu', 'maç başlayınca Çayır Türküsü çalar');
  assert.equal(await page.evaluate(() => window.__meadow.muzik.durum().sahne), 'mac', 'müzik sahnesi: maç');
  await page.waitForFunction(() => {
    const s = [...document.querySelectorAll('audio')].find(x => x.dataset.parca === 'cayir-8-degirmen-yolu');
    return s && (s.paused || s.volume === 0);
  }, null, { timeout: 10000 });
  const sakin = (await sesler()).find(s => s.parca === 'cayir-8-degirmen-yolu');
  assert.ok(sakin.paused, 'sakin parça maçta susar');

  // 3a) Doruk: taraflardan birinin sancağı yarıdan çoğunu yiyince (maç sancak düşünce bittiği için bu an maçın
  // doruğudur) sıra beklenmeden "Kalkan Duvarı"na geçilir ve tehlike geçene kadar orada kalınır.
  await page.evaluate(() => {
    const b = window.__meadow.players.map(p => p.banner).find(x => x && x.alive);
    window.__muzikTestSancak = { b, hp: b.hp };
    b.hp = b.maxHp * 0.3;
  });
  await page.waitForFunction(() => window.__meadow.muzik.durum().sahne === 'doruk', null, { timeout: 10000 });
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.15);
    return a && a.dataset.parca === 'cayir-9-kalkan-duvari';
  }, null, { timeout: 15000 });
  const dorukDurum = await page.evaluate(() => window.__meadow.muzik.durum());
  assert.equal(dorukDurum.parca, 'cayir-9-kalkan-duvari', 'doruk anında savaş parçası çalar');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('audio')]
    .find(a => a.dataset.parca === 'cayir-9-kalkan-duvari').loop), true, 'doruk tek parçalıdır: kendi kendine döner');

  // Sancak onarılınca (giriş 0,5 / çıkış 0,65 eşikleri) maç müziğine, yani Çayır Türküsü'ne dönülür.
  await page.evaluate(() => { const s = window.__muzikTestSancak; s.b.hp = s.hp; });
  await page.waitForFunction(() => window.__meadow.muzik.durum().sahne === 'mac', null, { timeout: 10000 });
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.15);
    return a && a.dataset.parca === 'cayir-7-cayir-turkusu';
  }, null, { timeout: 15000 });
  console.log('  doruk: sancak %30 → cayir-9 (döner), onarılınca → mac / cayir-7');

  // 3b) Maç sahnesinde parça bitmeden öbürü üstüne açılır: Çayır Türküsü ↔ Değirmen Yolu sırayla gider. Parçalar iki dakikalık
  // olduğu için ilk parça sonuna sarılır; geçişin kendisi (çapraz süzülme) olağan akıştaki gibi çalışır.
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('audio')].find(x => x.dataset.parca === 'cayir-7-cayir-turkusu');
    a.currentTime = Math.max(0, a.duration - 2.4);
  });
  await page.waitForFunction(() => {
    const el = ad => [...document.querySelectorAll('audio')].find(x => x.dataset.parca === ad);
    const yeni = el('cayir-8-degirmen-yolu'), eski = el('cayir-7-cayir-turkusu');
    return yeni && !yeni.paused && yeni.currentTime > 0.1 && (eski.paused || eski.volume === 0);
  }, null, { timeout: 20000 });
  assert.equal((await calan()).parca, 'cayir-8-degirmen-yolu', 'ilk parça bitince ikincisi devralır');

  // 4) "Müzik kapalı" ayarı: Esc menüsünden kapat, sayfa yenilenince korunsun.
  await page.keyboard.press('Escape');
  await page.locator('#menu-muzik').click();
  assert.equal(await page.locator('#menu-muzik').textContent(), 'Müzik: kapalı', 'düğme kapalıyı gösterir');
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(a => a.paused || a.volume === 0), null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('cm.muzik')), 'off', 'ayar tarayıcıda saklanır');

  // 4b) Yeniden açınca **aynı sahnenin aynı parçası kaldığı yerden** sürer (başa sarmaz).
  const durdu = (await sesler()).find(s => s.parca === 'cayir-8-degirmen-yolu').currentTime;
  assert.ok(durdu > 0.5, `kapatılan parça bir yerde durdu (${durdu.toFixed(2)} sn)`);
  await page.locator('#menu-muzik').click();
  assert.equal(await page.locator('#menu-muzik').textContent(), 'Müzik: açık', 'düğme yeniden açıldı');
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.15);
    return a && a.dataset.parca === 'cayir-8-degirmen-yolu';
  }, null, { timeout: 10000 });
  const surdu = await calan();
  assert.ok(surdu.currentTime >= durdu, `kaldığı yerden sürer (${durdu.toFixed(2)} → ${surdu.currentTime.toFixed(2)} sn, başa sarmadı)`);

  // 4c) Efekt sesi düğmesi müziğe dokunmaz (ikisi ayrı anahtar).
  await page.locator('#menu-sound').click();
  assert.equal(await page.locator('#menu-sound').textContent(), 'Ses: kapalı', 'efekt sesi kapandı');
  await page.waitForTimeout(600);
  assert.equal((await calan()).parca, 'cayir-8-degirmen-yolu', 'efekt sesi kapalıyken müzik çalmaya devam eder');
  await page.locator('#menu-sound').click();

  // 4d) Müzik ses düzeyi sabit (%20): menüde sürgü yok, cihazın sesinden ayarlanır.
  assert.equal(await page.locator('#menu-muzik-ses').count(), 0, 'Esc menüsünde müzik sesi sürgüsü yok');
  assert.ok(Math.abs((await page.evaluate(() => window.__meadow.muzik.durum().ses)) - 0.2) < 1e-9, 'müzik düzeyi sabit %20');

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
  await page.evaluate(() => window.__meadow.muzik.sesAyarla(0.2));

  // 5) Gösteri kipi: video betiği müziğini kendi ekler, oyun hiç ses öğesi kurmaz.
  await page.goto(url + '/?gosteri=1');
  await page.waitForFunction(() => window.__meadow && window.__meadow.running, null, { timeout: 20000 });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => window.__meadow.muzik.durum().kapali), true, 'gösteride müzik kapalıdır');
  assert.equal((await sesler()).length, 0, '?gosteri=1 sayfasında hiç <audio> öğesi yok');
  assert.ok(await page.locator('#home-muzik').isHidden(), 'gösteride müzik düğmesi gizli');

  assert.deepEqual(errors, [], 'sayfa hatasız');

  // 6) iOS Safari taklidi: orada `audio.volume` **salt okunurdur** (yazma yutulur, okunurken hep 1 döner), bu
  // yüzden çalar Web Audio kazanç düğümüne geçer (muzik.js `yolSec`). Burada `volume` özelliği aynı şekilde
  // salt okunur yapılır: düzey öğeden değil kazançtan verilmeli, müzik yine çalmalı ve düzey işlemeli.
  {
    const ios = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ios.addInitScript(() => Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      get() { return 1; }, set() { /* iOS yazmayı yutar */ }, configurable: true,
    }));
    const ip = await ios.newPage(), iosHata = [];
    ip.on('pageerror', e => iosHata.push(e.message));
    await ip.goto(url + '/?muzik=1');
    await ip.waitForFunction(() => window.__meadow && window.__meadow.muzik, null, { timeout: 20000 });
    await ip.locator('#mg-home h1').click();
    await ip.waitForFunction(() => {
      const d = window.__meadow.muzik.durum();
      // Çapraz geçiş bitene kadar düzey tırmanır; ölçüm süzülme oturduktan sonra yapılır.
      return d.parca === 'cayir-8-degirmen-yolu' && d.caliyor && d.duzey > 0.195;
    }, null, { timeout: 15000 });
    const iosDurum = await ip.evaluate(() => window.__meadow.muzik.durum());
    assert.equal(iosDurum.yol, 'web', 'volume yazılamayan tarayıcıda Web Audio yoluna geçilir');
    assert.ok(Math.abs(iosDurum.duzey - 0.2) < 0.01, `düzey kazançtan verilir (okunan: ${iosDurum.duzey.toFixed(3)})`);
    assert.equal(await ip.evaluate(() => document.querySelector('audio').volume), 1, 'öğenin kendi volume değeri 1 kalır (yazılamıyor)');
    // Parça gerçekten akıyor mu (kazanç zinciri çalmayı durdurmamış)?
    const t = await ip.evaluate(() => document.querySelector('audio').currentTime);
    await ip.waitForTimeout(1200);
    const t2 = await ip.evaluate(() => document.querySelector('audio').currentTime);
    assert.ok(t2 > t + 0.5, `Web Audio yolunda parça ilerler (${t.toFixed(2)} → ${t2.toFixed(2)})`);
    // Düzey Web Audio yolunda da işler (sesAyarla iç API'si).
    await ip.evaluate(() => window.__meadow.muzik.sesAyarla(0.1));
    const kisik = await ip.evaluate(() => window.__meadow.muzik.durum().duzey);
    assert.ok(Math.abs(kisik - 0.1) < 0.01, `düzey Web Audio yolunda da işler (okunan: ${kisik.toFixed(3)})`);
    assert.deepEqual(iosHata, [], 'iOS taklidinde sayfa hatasız');
    console.log(`  iOS taklidi (volume salt okunur): yol=${iosDurum.yol}, duyulan düzey ${iosDurum.duzey.toFixed(2)}`);
    await ios.close();
  }

  console.log('Müzik dumanı testi geçti.');
} finally {
  await browser.close();
}
