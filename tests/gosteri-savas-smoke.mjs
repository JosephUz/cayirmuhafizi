// İki ordu gösterisi dumanı testi (?gosteri=savas): içerik videosu için sahnelenmiş sahne çalışıyor mu?
// Denetlenenler: menü atlanır, 1000'er kişilik iki ordu (hepsi kılıçlı, beyinsiz ve **görünümsüz** — örnekli
// çizilirler) kurulur, kamera tepeden izometriktir, arayüz gizlidir, sunucuya hiç WebSocket açılmaz ve ölçüm isteği
// gitmez; akış hazir -> hucum -> kahramanların zıplayıp atılması -> ortada peş peşe saldırı -> savaş -> tur sıfırlama
// olarak işler, iki Kılıçlı Atlı kahraman hiç düşmez ("DÜŞTÜN!" ekranı içerik kurallarında yasak) ve bir tur 12-16 sn
// sürer. Hücum, kahramanların fırlaması ve çarpışma anlarının ekran görüntüsü artifacts/ altına yazılır, kare hızı
// ölçülüp basılır. Sonda telefon ölçüsünde (dokunmatik) sahnenin **çökmeden** açıldığı da denetlenir.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
// Kadro ve evre sayıları sahnenin ayarından okunur: config değişince test iki yerde güncellenmesin.
import { GOSTERI_SAVAS as K } from '../src/config.js';

const SAYI = K.ordu.sayi;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true,
  args: ['--mute-audio', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])],
});
/** Açılan WebSocket'ler ve ölçüm çağrıları sayılır (gösteride ikisi de olmamalı); kare hızı için de kare sayılır. */
const sayaclar = () => {
  window.__sockets = 0; window.__olcum = 0; window.__kare = 0;
  const WS = window.WebSocket;
  window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
  const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (beacon) navigator.sendBeacon = (u, b) => { window.__olcum++; return beacon(u, b); };
  const fetch0 = window.fetch.bind(window);
  window.fetch = (u, o) => { if (String(u).includes('/api/olay')) window.__olcum++; return fetch0(u, o); };
  const tik = () => { window.__kare++; requestAnimationFrame(tik); }; requestAnimationFrame(tik);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(sayaclar);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);

  const acildi = Date.now();
  await page.goto(url + '/?gosteri=savas');
  await page.waitForFunction(() => window.__meadow && window.__meadow.running && window.__meadow.gosteriDurum, null, { timeout: 30000 });

  // 1) Menü atlanır, iki ordu kurulur: her biri SAYI kişi, hepsi kılıçlı, **beyinsiz** (ai.js hiç koşmaz) ve
  //    **görünümsüz** (view null: örnekli çizilirler, bkz. src/view/ordu.js). Sahada başka hiçbir birim yok.
  assert.ok(await page.locator('#mg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('meadow-game').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  const kadro = await game(() => {
    const w = window.__meadow, a = w.entities.filter(e => e.gosteriAsker);
    const say = f => a.filter(e => e.faction === f).length;
    const kahramanlar = w.entities.filter(e => e.isPlayer);
    return {
      mavi: say('blue'), kizil: say('red'), baska: w.entities.length - a.length - kahramanlar.length,
      beyinsiz: a.every(e => !e.brain), gorunumsuz: a.every(e => !e.view),
      kilicli: a.every(e => e.loadout.weapon === 'sword' && !e.loadout.shield && !e.loadout.horse),
      kahramanSayi: kahramanlar.length,
      kahramanSet: kahramanlar.map(e => e.loadout), kahramanTaraf: kahramanlar.map(e => e.faction).sort(),
      yapi: w.structures.length, kamp: w.camps.length,
      // Cephenin eni: askerlerin hücum eksenine **dik** eksendeki yayılımı (eksen 0.7071, -0.7071).
      cephe: Math.max(...a.map(e => Math.abs(e.pos.x * 0.7071 + e.pos.z * 0.7071))) * 2,
    };
  });
  assert.equal(kadro.mavi, SAYI, `mavi ordu ${SAYI} kişi`);
  assert.equal(kadro.kizil, SAYI, `kızıl ordu ${SAYI} kişi`);
  assert.equal(kadro.baska, 0, 'sahada iki ordu ve iki kahraman dışında birim yok (kamp yaratığı, haydut)');
  assert.ok(kadro.kilicli, 'bütün askerler kalkansız, atsız kılıçlı');
  assert.ok(kadro.beyinsiz, 'askerlerin beyni yok: yapay zekâ (ai.js) bu sahnede hiç koşmaz');
  assert.ok(kadro.gorunumsuz, 'askerlerin ayrı görünümü yok: taraf başına tek InstancedMesh ile çizilirler');
  assert.equal(kadro.kahramanSayi, 2, 'sahada iki kahraman var');
  assert.deepEqual(kadro.kahramanTaraf, ['blue', 'red'], 'kahramanlar rakip taraflardan');
  for (const l of kadro.kahramanSet) assert.deepEqual(l, { weapon: 'sword', shield: false, horse: true }, 'kahramanlar Kılıçlı Atlı');
  assert.equal(kadro.yapi, 0, 'sahada yapı yok: kuleler orduyu ok yağmuruna tutardı');

  // 2) Kamera izometrik (dik izdüşüm), 3B değil; ordular tek çizim çağrısında çizilir.
  const cizim = await game(() => {
    const w = window.__meadow, r = w.renderer.info.render;
    let ordu = 0;
    w.scene.traverse(o => { if (o.isInstancedMesh && o.count > 200) ordu++; });
    return { izometrik: w.camera.isOrthographicCamera === true, orduCizimi: ordu, calls: r.calls, tris: r.triangles };
  });
  assert.ok(cizim.izometrik, 'kamera izometrik (dik izdüşüm)');
  assert.equal(cizim.orduCizimi, 2, 'ordular taraf başına tek InstancedMesh ile çizilir (asker başına ~15 mesh değil)');
  assert.ok(await page.locator('#mg-gosteri-yazi').isHidden(), 'bu sahnede büyük açıklama yazısı yok (kanca videoda duracak)');

  // 3) Arayüz gizli: alt bant, minimap, üst sayaçlar, skor.
  for (const sel of ['#mg-bar', '#mg-hud', '#mg-score', '#mg-minimap']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }

  /**
   * 4) Akış: hazir -> hucum (iki ordu birbirine koşar, cephe arası kapanır) -> ziplama (iki kahraman zıplar ve
   * rakibine atılır: kılıç fırtınası alanı açılır) -> dovus (kahramanlar ortada peş peşe vurur, şok dalgası
   * çıkar) -> savas -> tur sıfırlanır. Sahne durumu 80 ms'de bir okunur.
   */
  const bak = () => game(() => {
    const w = window.__meadow, d = w.gosteriDurum();
    const k = w.entities.filter(e => e.isPlayer);
    return { ...d, kahramanSag: k.every(e => e.alive), kahramanVurus: k.some(e => e.attackTimer > 0) };
  });
  const olay = {
    evreler: [], turBasi: [], hucumAralik: [], zipla: 0, atilma: 0, carpisma: 0, sokDalgasi: 0, kahramanVurus: 0,
    enAzAralik: Infinity, enCokY: 0, enYakinKahraman: Infinity, enCokDovusen: 0, enAzAyakta: SAYI, kahramanDustu: false,
  };
  for (let i = 0; i < 600; i++) {
    const s = await bak();
    const gecen = (Date.now() - acildi) / 1000;
    if (!olay.evreler.includes(s.evre)) olay.evreler.push(s.evre);
    if (s.tur !== olay.sonTur) { olay.turBasi.push(+gecen.toFixed(1)); olay.sonTur = s.tur; }
    if (s.evre === 'hucum') olay.hucumAralik.push(s.aralik);
    if (s.aralik < olay.enAzAralik) olay.enAzAralik = s.aralik;
    const y = Math.max(...s.kahramanY);
    if (y > olay.enCokY) olay.enCokY = y;
    if (!olay.zipla && y > 1.5) { olay.zipla = gecen; await page.screenshot({ path: 'artifacts/savas-2-kahraman-ziplar.png' }); }
    if (!olay.atilma && s.alanlar.includes('blades')) { olay.atilma = gecen; await page.screenshot({ path: 'artifacts/savas-3-kahraman-atilir.png' }); }
    if (!olay.sokDalgasi && s.alanlar.includes('burst')) olay.sokDalgasi = gecen;
    if (s.kahramanVurus && !olay.kahramanVurus && s.evre === 'dovus') { olay.kahramanVurus = gecen; await page.screenshot({ path: 'artifacts/savas-4-carpisma.png' }); }
    if (s.evre === 'hucum' && !olay.hucumFoto && s.aralik < 50) { olay.hucumFoto = true; await page.screenshot({ path: 'artifacts/savas-1-hucum.png' }); }
    if (s.evre === 'ziplama' && !olay.carpisma) olay.carpisma = s.carpisma;
    if (s.kahramanArasi < olay.enYakinKahraman) olay.enYakinKahraman = s.kahramanArasi;
    const dovusen = Math.max(...s.dovusen), ayakta = Math.min(...s.ayakta);
    if (dovusen > olay.enCokDovusen) olay.enCokDovusen = dovusen;
    if (ayakta < olay.enAzAyakta) olay.enAzAyakta = ayakta;
    if (!s.kahramanSag) olay.kahramanDustu = true;
    if (olay.turBasi.length >= 3) break;
    await page.waitForTimeout(80);
  }
  for (const e of ['hazir', 'hucum', 'ziplama', 'dovus', 'savas', 'bitis']) {
    assert.ok(olay.evreler.includes(e), `${e} evresi koşar (görülenler: ${olay.evreler.join(', ')})`);
  }
  assert.ok(olay.hucumAralik.length > 2 && olay.hucumAralik[0] > olay.hucumAralik[olay.hucumAralik.length - 1] + 20,
    `hücumda iki ordunun arası gerçekten kapanır (${olay.hucumAralik[0]} -> ${olay.hucumAralik[olay.hucumAralik.length - 1]})`);
  assert.ok(olay.enAzAralik <= 0, 'cepheler birleşir: iki ordu temas eder');
  assert.ok(olay.zipla > 0, `kahramanlar zıplar (en yüksek ${olay.enCokY.toFixed(2)} birim)`);
  assert.ok(olay.enCokY > 2, 'ikinci zıplama da olur: kahraman 2 birimin üstüne çıkar');
  assert.ok(olay.atilma > olay.zipla, 'zıpladıktan sonra sağ tıkla atılır: kılıç fırtınası alanı açılır');
  assert.ok(olay.enYakinKahraman < K.dovusMesafe + 1.5, `kahramanlar ortada karşılaşır (en yakın ${olay.enYakinKahraman} birim)`);
  assert.ok(olay.kahramanVurus > 0, 'kahramanlar dövüşte peş peşe saldırır');
  assert.ok(olay.sokDalgasi > 0, 'şarjlı şok dalgası (peş peşe saldırının üçüncü vuruşu) çıkar');
  assert.ok(olay.enCokDovusen > SAYI * 0.2, `cephede gerçek bir çarpışma olur (en çok ${olay.enCokDovusen} asker dövüştü)`);
  assert.ok(olay.enAzAyakta < SAYI, `askerler ölür (en az ayakta ${olay.enAzAyakta} / ${SAYI})`);
  assert.ok(!olay.kahramanDustu, 'kahramanlar düşmez ("DÜŞTÜN!" görünmez)');

  // 5) Döngü: sahne 12-16 sn'de bir sıfırlanır ve iki ordu yeniden tam kadro olur.
  assert.ok(olay.turBasi.length >= 3, `sahne tekrar eder (görülen tur başlangıçları: ${olay.turBasi.join(', ')})`);
  const sureler = olay.turBasi.slice(1).map((t, i) => +(t - olay.turBasi[i]).toFixed(1));
  for (const s of sureler) assert.ok(s >= 11 && s <= 17, `bir tur 12-16 sn sürer (ölçülen ${s} sn)`);
  const yeniden = await game(() => window.__meadow.gosteriDurum());
  assert.equal(yeniden.ordu, SAYI, 'her turda ordular yeniden tam kadro kurulur');
  // Varlık sayısı sabit: ölen asker silinip yeniden doğurulmaz, cesedi gömülünce ordusunun gerisine döner.
  assert.equal(await game(() => window.__meadow.entities.length), SAYI * 2 + 2, 'varlık sayısı tur boyunca sabit kalır');

  // 6) Ne ağ ne ölçüm.
  assert.equal(await game(() => window.__sockets), 0, 'gösteride sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'gösteride ölçüm olayı gitmez');

  /**
   * 7) Kare hızı: 2000 askerle, yüzlerce dövüşenle ve kahramanların alan etkileriyle akıcı kalmalı. İki sayı
   * ölçülür: **ortalama** (25 sn, kabul ölçütündeki klip süresi) ve **en kötü yarım saniye** — "takılma yok"
   * asıl bunun sözüdür. Eşikler bilerek düşük: bu bir başarım ölçütü değil, **ağır gerileme** alarmıdır; sayı
   * donanıma bağlıdır. Zayıf makinede `FPS_ESIK` / `FPS_DIP_ESIK` ile indirilebilir.
   */
  const esik = Number(process.env.FPS_ESIK || 45), dipEsik = Number(process.env.FPS_DIP_ESIK || 28);
  let k0 = await game(() => window.__kare), t0 = Date.now(), toplamKare = 0, toplamSure = 0, dip = Infinity;
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(500);
    const k = await game(() => window.__kare), dt = (Date.now() - t0) / 1000;
    const anlik = (k - k0) / dt;
    if (anlik < dip) dip = anlik;
    toplamKare += k - k0; toplamSure += dt;
    k0 = k; t0 = Date.now();
  }
  const fps = toplamKare / toplamSure;
  const son = await game(() => { const r = window.__meadow.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
  assert.ok(fps >= esik, `${SAYI * 2} askerle ortalama kare hızı yeterli (ölçülen ${fps.toFixed(1)} fps, eşik ${esik})`);
  assert.ok(dip >= dipEsik, `takılma yok: en kötü yarım saniye de eşiğin üstünde (ölçülen ${dip.toFixed(1)} fps, eşik ${dipEsik})`);
  assert.deepEqual(errors, [], 'sayfa hatasız');

  // 8) Telefon: sahne **çökmeden** açılmalı (içerik kaydı masaüstünde yapılır, telefonda yalnız açılsın yeter).
  const mobil = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mSayfa = await mobil.newPage(), mHata = [];
  mSayfa.on('pageerror', e => mHata.push(e.message));
  mSayfa.on('console', e => { if (e.type() === 'error') mHata.push(e.text()); });
  await mSayfa.goto(url + '/?gosteri=savas&touch=1');
  await mSayfa.waitForFunction(() => window.__meadow && window.__meadow.running && window.__meadow.gosteriDurum, null, { timeout: 30000 });
  await mSayfa.waitForTimeout(6000);
  const mDurum = await mSayfa.evaluate(() => ({ ...window.__meadow.gosteriDurum(), varlik: window.__meadow.entities.length, kayip: window.__meadow.renderer.getContext().isContextLost() }));
  await mSayfa.screenshot({ path: 'artifacts/savas-5-telefon.png' });
  assert.equal(mDurum.ordu, K.ordu.telefon, `telefonda ordu ${K.ordu.telefon} kişi (görüntü belleği dolmasın)`);
  assert.ok(!mDurum.kayip, 'telefonda görüntü bağlamı düşmez');
  assert.ok(['hazir', 'hucum', 'ziplama', 'dovus', 'savas', 'bitis'].includes(mDurum.evre), 'telefonda sahne koşar');
  assert.deepEqual(mHata, [], 'telefonda sayfa hatasız');
  await mobil.close();

  console.log('İki ordu gösterisi dumanı testi geçti.');
  console.log(`  tur başlangıçları (sn): ${olay.turBasi.join(', ')} · tur süresi: ${sureler.join(', ')} sn`);
  console.log(`  hücum ${olay.hucumAralik[0]} -> ${olay.hucumAralik[olay.hucumAralik.length - 1]} birim · zıplama ${olay.zipla.toFixed(1)} sn (en yüksek ${olay.enCokY.toFixed(2)} birim) · atılma ${olay.atilma.toFixed(1)} sn · kahraman vuruşu ${olay.kahramanVurus.toFixed(1)} sn`);
  console.log(`  kahramanlar en yakın ${olay.enYakinKahraman} birim · en çok dövüşen ${olay.enCokDovusen} asker · en az ayakta ${olay.enAzAyakta} / ${SAYI} · çarpışma sahne saatinde ${olay.carpisma.toFixed(1)} sn`);
  console.log(`  cephe ${kadro.cephe.toFixed(0)} birim · ordu çizimi ${cizim.orduCizimi} InstancedMesh · kahraman seviye ${(await game(() => window.__meadow.gosteriDurum())).kahramanSeviye}`);
  console.log(`  kare hızı: ${fps.toFixed(1)} fps ortalama, en kötü yarım saniye ${dip.toFixed(1)} fps (1280x720, ${son.calls} çizim çağrısı, ${son.tris} üçgen)`);
} finally {
  await browser.close();
}
