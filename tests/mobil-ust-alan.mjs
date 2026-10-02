// Telefon görünümü: oyunun üst kısmı (üst bilgi çubuğu, lobideki **oda kodu**) tarayıcı çubuklarının / çentiğin
// altında kalıyor mu? Playwright'ın kendi başsız Chromium'uyla (kullanıcının Chrome'una ve faresine dokunmaz)
// telefon kipinde (isMobile, hasTouch) ana ekran ve oda kurulmuş lobi ölçülür.
//
// İki **gerçek** (taklit nesne kullanmayan) durum denenir; ikisi de düzeltmeden önce düşüyordu:
//
//  1. `guvenli-alan` — çentik / durum çubuğu. Sayfa `viewport-fit=cover` ile açıldığı için içerik ekranın en
//     tepesinden başlar; telefonun üst payı CDP ile gerçekten verilir (`Emulation.setSafeAreaInsetsOverride`),
//     yani `env(safe-area-inset-top)` tarayıcıda gerçekten GUVENLI_UST olur. Düzeltmeden önce üst bilgi çubuğu
//     bu payın altında kalıyordu.
//  2. `adres-cubugu` — görünür alanın kısalması. Oyun yüklendikten **sonra** görüntü alanı CUBUK kadar kısaltılır
//     (gerçek `resize`: vh/dvh, visualViewport ve oyunun ResizeObserver'ı hep birlikte değişir). Düzeltmeden önce
//     `vh` ile ölçülen kart yüksekliği bu kısalmayı saymıyordu.
//
// Lobi **5v5** kurulur: kart on koltukla en uzun halidir (yatay telefonda kaptan taşar). Düzeltmeden önce
// `place-items:center` taşan kartın üstünü kabın dışına atıyordu ve oraya kaydırılamıyordu — oda kodu kartın en
// üstünde olduğu için okunmaz oluyordu. Ölçülen: 844x390'da kart 397px / kap 390px, kart üstü y=-3, kod y=12.
//
// Kullanım: GAME_URL=http://localhost:5191 ETIKET=sonra node tests/mobil-ust-alan.mjs
//   ETIKET  dosya adı öneki (artifacts/mobil-<etiket>-*.png), varsayılan "sonra"
//   MOBIL_KONTROL=0  yalnız görüntü al, doğrulama yapma (düzeltmeden önceki hali belgelemek için)
//   PLAYWRIGHT_MODULE  başka bir Playwright kurulumu (file:// URL)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = (process.env.GAME_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const etiket = process.env.ETIKET || 'sonra';
const kontrol = process.env.MOBIL_KONTROL !== '0';

const GUVENLI_UST = 47; // iPhone portre çentik / durum çubuğu payı (CSS px)
const CUBUK = 56; // tarayıcı adres çubuğunun yediği yükseklik (Android Chrome ~56 CSS px)
const EKRANLAR = [
  { ad: 'yatay', w: 844, h: 390 },
  { ad: 'dik', w: 390, h: 844 },
];
const DURUMLAR = ['guvenli-alan', 'adres-cubugu'];

await mkdir('artifacts', { recursive: true });
// SWIFTSHADER: donanım GL'si olmayan makinede yazılım çizici (dumanı testleriyle aynı seçim, bkz. touch-smoke.mjs).
const browser = await chromium.launch({
  headless: true,
  args: ['--mute-audio', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])],
});

/** Oda kurup 5v5 lobiye geçer (kartın en uzun hali). */
async function lobiyeGec(page) {
  await page.waitForSelector('#home-create:not([disabled])', { timeout: 15000 });
  await page.locator('#home-create').click();
  await page.waitForSelector('#mg-setup:not([hidden])', { timeout: 15000 });
  await page.locator('#setup-start').click();
  await page.waitForSelector('#mg-lobby:not([hidden])', { timeout: 15000 });
  await page.selectOption('#lobby-teams', '5');
  await page.waitForTimeout(600);
}

const sonuc = [];
try {
  for (const durum of DURUMLAR) {
    for (const ekran of EKRANLAR) {
      const context = await browser.newContext({
        viewport: { width: ekran.w, height: ekran.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      });
      const page = await context.newPage(), hatalar = [];
      page.on('pageerror', e => hatalar.push(e.message));
      page.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });

      // Görünür alanın üstü (bu çizginin yukarısı kullanıcıya görünmez) ve altı.
      let ustSinir = 0, altSinir = ekran.h;
      if (durum === 'guvenli-alan') {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: GUVENLI_UST } });
        ustSinir = GUVENLI_UST;
      }

      await page.goto(url + '/?test=1');
      await page.waitForFunction(() => !!window.__meadow && !document.querySelector('#mg-home').hidden);
      await page.waitForTimeout(800);

      if (durum === 'adres-cubugu') {
        // Adres çubuğu açılıyor: görüntü alanı gerçekten kısalır (taklit nesne yok).
        await page.setViewportSize({ width: ekran.w, height: ekran.h - CUBUK });
        altSinir = ekran.h - CUBUK;
        await page.waitForTimeout(500);
      }

      // Dik tutuşta oyun "Telefonu yan çevir" perdesini gösterir (değişmedi, kuralları da aynı). Ana ekranı ve
      // lobiyi ölçebilmek için perde yalnız bu testte gizlenir.
      if (ekran.ad === 'dik') await page.addStyleTag({ content: '#mg-rotate{display:none!important}' });

      // Görünmeyen üst payı ekran görüntüsünde göster: düzeltmeden önceki görüntülerde neyin örtüldüğü okunur.
      if (ustSinir) {
        await page.addStyleTag({ content:
          `body::after{content:"🔒  cayirmuhafizi.josephuz.com";position:fixed;left:0;top:0;width:100%;height:${ustSinir}px;`
          + 'z-index:2147483647;display:flex;align-items:center;padding:0 14px;box-sizing:border-box;background:#30343ad9;'
          + 'color:#dfe3e8;font:13px system-ui,sans-serif;border-bottom:1px solid #000;pointer-events:none}' });
      }
      await page.screenshot({ path: `artifacts/mobil-${etiket}-${durum}-${ekran.ad}-01-ana.png` });

      const olc = async sec => page.locator(sec).boundingBox();
      // Giriş ekranı: üst şerit ve "Oda kur" düğmesi görünür alanda mı?
      const girisUst = await olc('#mg-home .home-top'), kur = await olc('#home-create');

      await lobiyeGec(page);
      await page.screenshot({ path: `artifacts/mobil-${etiket}-${durum}-${ekran.ad}-02-lobi.png` });

      const kod = await olc('#lobby-code'), kutu = await olc('#mg-lobby .codebox');
      // Üst bilgi çubuğunun **okunan** kısmı: `#mg-hud` bilerek ekranın en tepesinden başlayan bir geçiş
      // (gradient) şerididir, çentiğin altına girmesi gereken onun içeriğidir.
      const ust = await olc('#mg-hud .side.ours'), kart = await olc('#mg-lobby .card');
      const kodMetni = (await page.locator('#lobby-code').textContent()).trim();
      const icerde = k => !!k && k.y >= ustSinir - 0.5 && k.y + k.height <= altSinir + 0.5;
      const satir = {
        durum, ekran: ekran.ad, gorunurAlan: `${ustSinir}..${altSinir}`, kod: kodMetni,
        odaKoduGorunur: icerde(kod), kodKutusuGorunur: icerde(kutu), hudGorunur: icerde(ust), lobiKartiGorunur: icerde(kart),
        kodY: kod && Math.round(kod.y), hudY: ust && Math.round(ust.y),
        kartY: kart && Math.round(kart.y), kartAlt: kart && Math.round(kart.y + kart.height),
        girisUstY: girisUst && Math.round(girisUst.y), girisUstGorunur: icerde(girisUst),
        odaKurGorunur: icerde(kur), odaKurAlt: kur && Math.round(kur.y + kur.height),
      };
      sonuc.push(satir);
      console.log(JSON.stringify(satir));

      if (kontrol) {
        assert.ok(/^[A-Z0-9-]{4,10}$/.test(kodMetni), `oda kodu okunamadı: "${kodMetni}"`);
        const nere = `${durum}/${ekran.ad}`;
        assert.ok(icerde(kod), `${nere}: oda kodu görünür alanın (${ustSinir}..${altSinir}) dışında (y=${satir.kodY})`);
        assert.ok(icerde(kutu), `${nere}: oda kodu kutusu görünür alanın dışında (y=${kutu && Math.round(kutu.y)})`);
        assert.ok(icerde(kart), `${nere}: lobi kartı görünür alanın dışına taşıyor (üst=${satir.kartY}, alt=${satir.kartAlt})`);
        assert.ok(icerde(ust), `${nere}: üst bilgi çubuğu görünür alanın dışında (y=${satir.hudY})`);
        assert.ok(icerde(girisUst), `${nere}: giriş ekranının üst şeridi görünür alanın dışında (y=${satir.girisUstY})`);
        assert.ok(icerde(kur), `${nere}: giriş ekranında Oda kur düğmesi görünür alanın dışında (alt=${satir.odaKurAlt})`);
        assert.deepEqual(hatalar, [], 'tarayıcı hataları: ' + hatalar.join(' | '));
      }
      await context.close();
    }
  }
  console.log(`Telefon görünümü ekran görüntüleri: artifacts/mobil-${etiket}-*.png`);
  if (kontrol) console.log('Telefon üst alanı testi geçti: çentik payında da, adres çubuğu açıkken de oda kodu, lobi kartı ve üst bilgi çubuğu görünür alanda.');
} finally {
  await browser.close();
}
