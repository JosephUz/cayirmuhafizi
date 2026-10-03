// STANDART üst araç çubuğu ve duraklatma menüsü testi (bütün JosephUz oyunlarında aynı).
// Denetlenenler:
//  - Giriş ekranının sağ üstü **tam olarak** `← josephuz.com` · `Ses: açık` · `Müzik: açık` · `Kontroller F1`
//    sırasında; eski adlar ("Kısayollar", "Nasıl oynanır") kalmamış.
//  - Çubuk üç ekran ölçüsünde de taşmıyor ve oyun adının üstüne binmiyor.
//  - Esc menüsü: DEVAM ET → · Kontroller F1 · Ses · Müzik · Grafik · Ana menü ·
//    josephuz.com'a dön; kart alçak ekranda da kaba **tamamen** sığıyor (sessizce kaydırmaya düşmüyor).
//  - Çubuktaki ve menüdeki Ses / Müzik düğmeleri aynı durumu gösterir, biri değişince öbürü de değişir.
// Dikey telefon dokunmatiksiz ölçülür: oyun dokunmatikte dikey tutulunca "Telefonu yan çevir" perdesi açılıyor,
// çubuk o perdenin altında kalıyor. Yerleşim kuralı (style.css @media max-width:480px) yine de denetlenmiş olur.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--mute-audio', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });

/** Çubuğun görünen düğme yazıları, soldan sağa; `kbd` gizliyse (dar ekran) yazıdan düşer. */
const cubukYazilari = page => page.evaluate(() => [...document.querySelectorAll('#mg-home .home-actions > *')]
  .filter(el => el.offsetParent !== null)
  .map(el => el.textContent.replace(/\s+/g, ' ').trim()));

const EKRANLAR = [
  { ad: 'masaustu', w: 1280, h: 720, dokunmatik: false, menu: true },
  { ad: 'telefon-yatay', w: 844, h: 390, dokunmatik: true, menu: true },
  { ad: 'telefon-dikey', w: 390, h: 844, dokunmatik: false, menu: false },
  // En dar yaygın telefon (Galaxy A / iPhone SE sınıfı): dört düğmeli çubuk burada taşmaya en yakındır. JOS-700'de
  // düzeltilen üst alan yeniden bozulmasın diye giriş şeridi de bütünüyle görünür alanda mı diye ölçülür.
  { ad: 'telefon-dar', w: 360, h: 640, dokunmatik: false, menu: false },
];

try {
  for (const e of EKRANLAR) {
    const ctx = await browser.newContext({ viewport: { width: e.w, height: e.h }, ...(e.dokunmatik ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', x => errors.push(x.message));
    page.on('console', x => { if (x.type() === 'error') errors.push(x.text()); });

    await page.goto(url + '/?muzik=1');
    await page.waitForFunction(() => window.__meadow && !document.querySelector('#mg-home').hidden, null, { timeout: 20000 });

    // 1) Sıra ve yazılar. Dar ekranda `F1` tuş etiketi gizlenir (style.css), sıra ve adlar değişmez.
    const yazilar = await cubukYazilari(page);
    assert.deepEqual(yazilar, ['← josephuz.com', 'Ses: açık', 'Müzik: açık', 'Kontroller F1'], `${e.ad}: standart çubuk sırası ve yazıları`);
    // Dar ekranda `F1` tuş etiketi görünmez (yer açmak için, style.css @media max-width:1100px); yazı aynı kalır.
    assert.equal(await page.locator('#mg-home .home-actions kbd').isVisible(), e.w > 1100, `${e.ad}: F1 etiketi ${e.w > 1100 ? 'görünür' : 'gizli'}`);

    // 2) Taşma yok: çubuk görünür alanın içinde ve oyun adıyla çakışmıyor.
    const kutu = await page.evaluate(() => {
      const c = document.querySelector('#mg-home .home-actions').getBoundingClientRect();
      const l = document.querySelector('#mg-home .home-top .logo').getBoundingClientRect();
      const s = document.querySelector('#mg-home .home-top').getBoundingClientRect();
      return {
        c: { l: c.left, r: c.right, t: c.top, b: c.bottom }, logoR: l.right, logoB: l.bottom,
        serit: { l: s.left, r: s.right, t: s.top, b: s.bottom }, w: innerWidth, h: innerHeight,
      };
    });
    assert.ok(kutu.c.l >= 0 && kutu.c.r <= kutu.w + 0.5, `${e.ad}: çubuk yatayda taşmıyor (${Math.round(kutu.c.l)}..${Math.round(kutu.c.r)} / ${kutu.w})`);
    assert.ok(kutu.c.t >= 0 && kutu.c.b <= kutu.h, `${e.ad}: çubuk dikeyde görünür alanda`);
    // Çubuğun kendisi sığsa bile şerit (ad + çubuk) taşabilirdi: 360 px'te dört düğme ikinci satıra iner.
    assert.ok(kutu.serit.l >= -0.5 && kutu.serit.r <= kutu.w + 0.5 && kutu.serit.t >= 0 && kutu.serit.b <= kutu.h,
      `${e.ad}: giriş şeridi görünür alanda (${Math.round(kutu.serit.l)}..${Math.round(kutu.serit.r)} / ${kutu.w}, ${Math.round(kutu.serit.t)}..${Math.round(kutu.serit.b)} / ${kutu.h})`);
    // Çakışma yok: ya adın sağında (geniş ekran) ya da tamamen altında (dar ekranda ikinci satıra iner).
    assert.ok(kutu.c.l >= kutu.logoR || kutu.c.t >= kutu.logoB, `${e.ad}: çubuk oyun adının üstüne binmiyor (ad ${Math.round(kutu.logoR)}x${Math.round(kutu.logoB)}, çubuk ${Math.round(kutu.c.l)}x${Math.round(kutu.c.t)})`);

    // 3) Çubuktaki Ses ve Müzik birbirinden bağımsız ve menüdeki eşleriyle aynı durumu gösterir.
    await page.locator('#home-sound').click();
    assert.equal(await page.locator('#home-sound').textContent(), 'Ses: kapalı', `${e.ad}: çubuktaki ses düğmesi kapanır`);
    assert.equal(await page.locator('#menu-sound').textContent(), 'Ses: kapalı', `${e.ad}: menüdeki ses düğmesi de kapalı yazar`);
    assert.equal(await page.locator('#home-muzik').textContent(), 'Müzik: açık', `${e.ad}: efekt sesi müziğe dokunmaz`);
    assert.equal(await page.evaluate(() => window.__meadow.muzik.acik), true, `${e.ad}: efekt sesi kapanınca müzik ayarı açık kalır`);
    await page.locator('#home-muzik').click();
    assert.equal(await page.locator('#menu-muzik').textContent(), 'Müzik: kapalı', `${e.ad}: menüdeki müzik düğmesi de kapalı yazar`);
    assert.equal(await page.evaluate(() => localStorage.getItem('cm.sound')), 'off', `${e.ad}: efekt ayarı ayrı saklanır`);
    assert.equal(await page.evaluate(() => localStorage.getItem('cm.muzik')), 'off', `${e.ad}: müzik ayarı ayrı saklanır`);
    await page.locator('#home-sound').click(); await page.locator('#home-muzik').click();
    await page.screenshot({ path: `artifacts/cubuk-${e.ad}.png` });

    // 4) Duraklatma menüsü: sıra, yazılar ve kartın kaba sığması.
    if (e.menu) {
      await page.locator('#home-solo').click();
      await page.locator('#setup-start').click();
      await page.waitForFunction(() => window.__meadow.running, null, { timeout: 20000 });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#mg-menu').hidden, null, { timeout: 8000 });
      const menu = await page.evaluate(() => [...document.querySelectorAll('#mg-menu .menu > *')]
        .filter(el => el.offsetParent !== null)
        .map(el => el.id === 'menu-quality' ? 'Grafik' : el.textContent.replace(/\s+/g, ' ').trim()));
      assert.deepEqual(menu, ['DEVAM ET →', 'Kontroller F1', 'Ses: açık', 'Müzik: açık', 'Grafik', 'Ana menü', "josephuz.com'a dön"], `${e.ad}: standart duraklatma menüsü`);
      // Kart kaba tam sığsın: alçak ekranda yedi satır sessizce kaydırmaya düşüyordu.
      const kart = await page.evaluate(() => {
        const k = document.querySelector('#mg-menu .card');
        return { tasma: k.scrollHeight - k.clientHeight, t: k.getBoundingClientRect().top, b: k.getBoundingClientRect().bottom, h: innerHeight };
      });
      assert.ok(kart.tasma <= 1, `${e.ad}: menü kartı kaydırmaya düşmüyor (taşma ${kart.tasma}px)`);
      assert.ok(kart.t >= 0 && kart.b <= kart.h + 0.5, `${e.ad}: menü kartı görünür alanda (${Math.round(kart.t)}..${Math.round(kart.b)} / ${kart.h})`);
      await page.screenshot({ path: `artifacts/cubuk-${e.ad}-menu.png` });
      console.log(`${e.ad}: çubuk ${Math.round(kutu.c.l)}..${Math.round(kutu.c.r)} / ${kutu.w} · menü kartı ${Math.round(kart.t)}..${Math.round(kart.b)} / ${kart.h}, taşma ${kart.tasma}px`);
    } else {
      console.log(`${e.ad}: çubuk ${Math.round(kutu.c.l)}..${Math.round(kutu.c.r)} / ${kutu.w} (ad ${Math.round(kutu.logoR)}'de biter)`);
    }

    assert.deepEqual(errors, [], `${e.ad}: sayfa hatasız`);
    await ctx.close();
  }
  console.log('Standart üst araç çubuğu testi geçti. Ekran görüntüleri: artifacts/cubuk-*.png');
} finally {
  await browser.close();
}
