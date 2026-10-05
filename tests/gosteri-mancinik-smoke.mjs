// Mancınık düellosu gösterisi dumanı testi (?gosteri=mancinik): short videosu için sahnelenmiş sahne
// çalışıyor mu? Denetlenenler: menü atlanır, sahada **kahraman görünmez** ve **kule / yapı yoktur**, iki
// mancınık sırası ile iki arka hat kurulur, kamera oyunun kendi izometrik açısındadır, arayüz gizlidir,
// sunucuya WebSocket açılmaz ve ölçüm gitmez. Asıl denetim **müziğe kilit**tir: sahne kare kare (sahte
// saatle) ilerletilir ve son kızıl mancınığın yıkıldığı an ile süvarinin mancınığa vardığı an müziğin
// işaretlerine (config isaret.yikilis / sonDarbe) oturmalı — video müziğin vuruşlarına bu sayede denk gelir.
// Sonda sahnenin tur başına sıfırlandığı ve telefon ölçüsünde çökmeden açıldığı da denetlenir.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
// Kadro, işaretler ve eşikler sahnenin ayarından okunur: config değişince test iki yerde güncellenmesin.
import { GOSTERI_MANCINIK as K } from '../src/config.js';

const MANCINIK = K.mancinik.yer.length;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true,
  args: ['--mute-audio', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])],
});
/** Açılan WebSocket'ler ve ölçüm çağrıları sayılır (gösteride ikisi de olmamalı). */
const sayaclar = () => {
  window.__sockets = 0; window.__olcum = 0;
  const WS = window.WebSocket;
  window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
  const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (beacon) navigator.sendBeacon = (u, b) => { window.__olcum++; return beacon(u, b); };
  const fetch0 = window.fetch.bind(window);
  window.fetch = (u, o) => { if (String(u).includes('/api/olay')) window.__olcum++; return fetch0(u, o); };
};
/**
 * Sahte saat: oyunun kare döngüsü `requestAnimationFrame` + `performance.now()` üstünde koşar, ikisi de
 * burada ele alınır. Çekim betiğinin (ajanlar/icerik/short-uret.mjs) yaptığının aynısı — test de sahneyi
 * **videonun göreceği kare temposuyla** (30 fps) ilerletir, yani ölçülen saniyeler videodakilerle birebirdir.
 */
const saat = () => {
  let simdi = 0; const sira = [];
  performance.now = () => simdi;
  Date.now = () => 1767571200000 + simdi;
  window.requestAnimationFrame = cb => sira.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__kare = ms => { simdi += ms; const liste = sira.splice(0); for (const cb of liste) cb(simdi); };
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  await ctx.addInitScript(sayaclar);
  await ctx.addInitScript(saat);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);

  await page.goto(url + '/?gosteri=mancinik&muzik=0');
  await page.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000, polling: 100 });
  // Isınma kareleri sıfır süreyle: sahne kurulur ama saati ilerlemez (çekim betiğiyle aynı kalıp).
  for (let i = 0; i < 4; i++) { await game(() => window.__kare(0)); await page.waitForTimeout(120); }

  // 1) Menü atlanır, kadro kurulur: iki mancınık sırası, iki arka hat, bir süvari sütunu. Sahada kahraman
  //    **görünmez** (Yusuf: "kahramanlar olmasın") ve **hiçbir yapı yoktur** ("kulelerin olmadığı bir alan").
  assert.ok(await page.locator('#mg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('meadow-game').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  const kadro = await game(() => {
    const w = window.__meadow, e = w.entities;
    const say = (f, ko) => e.filter(x => x.faction === f && ko(x)).length;
    const atli = x => x.loadout.horse;
    return {
      mancinikMavi: say('blue', x => x.isSiege), mancinikKizil: say('red', x => x.isSiege),
      atliKizil: say('red', atli), atliMavi: say('blue', atli),
      piyadeMavi: say('blue', x => !x.isSiege && !atli(x) && !x.isPlayer), piyadeKizil: say('red', x => !x.isSiege && !atli(x) && !x.isPlayer),
      kahraman: e.filter(x => x.isPlayer).length,
      kahramanGorunur: e.some(x => x.isPlayer && x.view),
      yapi: w.structures.length, kamp: w.camps.length,
      // Mancınıklar oyunun kendi kuşatma birimidir: can / menzil / hasar config'ten gelir.
      siegeCan: e.filter(x => x.isSiege).map(x => x.stats.maxHp),
      siegeMenzil: e.filter(x => x.isSiege).map(x => x.stats.weapon.range),
      // Atlılar oyunun kendi atlı hızında koşar (ezilmiş bir sahne hızı yok).
      atliHiz: [...new Set(e.filter(atli).map(x => +x.stats.speed.toFixed(2)))],
      yayaHiz: [...new Set(e.filter(x => !x.isSiege && !atli(x) && !x.isPlayer).map(x => +x.stats.speed.toFixed(2)))],
    };
  });
  assert.equal(kadro.mancinikMavi, MANCINIK, `mavi sırada ${MANCINIK} mancınık`);
  assert.equal(kadro.mancinikKizil, MANCINIK, `kızıl sırada ${MANCINIK} mancınık`);
  assert.equal(kadro.atliKizil, K.akin.sayi, `kızılın ${K.akin.sayi} atlısı var`);
  assert.equal(kadro.atliMavi, 0, 'mavinin atlısı yok: akını yapan kaybeden taraftır');
  assert.equal(kadro.piyadeMavi, K.muhafiz.sayi, `mavi arka hat ${K.muhafiz.sayi} piyade`);
  assert.equal(kadro.piyadeKizil, K.muhafiz.sayi, `kızıl arka hat ${K.muhafiz.sayi} piyade`);
  assert.equal(kadro.kahraman, 2, 'iki kahraman sahanın dışında park eder (world.player bir varlık olmalı)');
  assert.ok(!kadro.kahramanGorunur, 'sahnede kahraman GÖRÜNMEZ: görünümleri sökülür (Yusuf: kahramanlar olmasın)');
  assert.equal(kadro.yapi, 0, 'sahada yapı yok: orta alanda kule / sancak / kışla görünmez');
  assert.equal(kadro.kamp, 0, 'tarafsız kamp yok');
  assert.deepEqual([...new Set(kadro.siegeCan)], [40], 'mancınık canı oyunun kendi değeri (SIEGE.hp 40)');
  assert.deepEqual([...new Set(kadro.siegeMenzil)], [36], 'mancınık menzili oyunun kendi değeri (WEAPONS.catapult.range 36)');
  assert.deepEqual(kadro.atliHiz, [6.46], 'atlılar oyunun kendi atlı hızında (3.8 x 1.7) koşar');
  assert.ok(kadro.yayaHiz.length, 'piyade kurulur');

  // 2) Kamera: dik izdüşüm (izometrik) ve oyunun kendi bakış açısı — kahraman kamerasının yönü (24, 29, 24).
  const kamera = await game(() => {
    const c = window.__meadow.camera, p = c.position, t = window.__meadow.camTarget;
    const d = { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z };
    return { izometrik: c.isOrthographicCamera === true, yon: [+(d.x / d.y).toFixed(3), +(d.z / d.y).toFixed(3)], yariKadraj: +c.top.toFixed(1) };
  });
  assert.ok(kamera.izometrik, 'kamera izometrik (dik izdüşüm)');
  assert.deepEqual(kamera.yon, [+(24 / 29).toFixed(3), +(24 / 29).toFixed(3)], 'bakış açısı oyunun kendi izometrik yönü (24, 29, 24)');
  assert.equal(kamera.yariKadraj, K.kamera.duello, `düelloda dikey yarı kadraj ${K.kamera.duello}`);

  // 3) Arayüz gizli.
  for (const sel of ['#mg-bar', '#mg-hud', '#mg-score', '#mg-minimap']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }

  /**
   * 4) **Müziğe kilit.** Sahne 30 fps'lik sahte saatle bir tur boyunca ilerletilir; yol boyunca evreler,
   * yıkılan mancınıklar, atılan taşlar ve süvarinin yeri izlenir. Beklenen akış:
   *   duello (taşlar uçar, kızıl sıra teker teker yıkılır) -> yikilis -> akin (atlılar kanattan dörtnala)
   *   -> darbe. `isaret.yikilis` ve `isaret.sonDarbe` anları `PAY` saniyeden fazla kaymamalı.
   */
  const PAY = 0.2;
  const izleme = [];
  const toplam = Math.round((K.isaret.son + K.tekrar + 1.5) * 30);
  for (let i = 1; i <= toplam; i++) {
    await game(() => window.__kare(1000 / 30));
    const d = await game(() => window.__gosteri);
    izleme.push(d);
    if (!izleme.foto && d.saniye >= K.isaret.yikilis) { izleme.foto = true; await page.screenshot({ path: 'artifacts/mancinik-1-yikilis.png' }); }
  }
  const evreler = [...new Set(izleme.map(d => d.evre))];
  for (const e of ['duello', 'yikilis', 'akin', 'darbe']) assert.ok(evreler.includes(e), `${e} evresi koşar (görülenler: ${evreler.join(', ')})`);

  // Düello gerçekten iki taraflı: mavi de mancınık kaybeder, kızıl sıra sıfırlanır, taşlar oyunun kendi oku olarak uçar.
  const tur = izleme.filter(d => d.tur === 1);
  const son = tur[tur.length - 1];
  assert.equal(son.tas, K.atislar.length, `betikteki ${K.atislar.length} taşın hepsi yola çıkar (atılan: ${son.tas})`);
  assert.ok(izleme.some(d => d.ucanTas > 0), 'taşlar havada görünür (oyunun ok sistemiyle uçarlar)');
  assert.equal(son.mancinik.red, 0, 'kızıl mancınık sırası tamamen yıkılır');
  assert.ok(son.mancinik.blue > 0 && son.mancinik.blue < MANCINIK,
    `mavi de mancınık kaybeder ama ayakta kalır (${son.mancinik.blue} / ${MANCINIK}) — düello tek taraflı değil`);

  // **Yıkılış** müziğin 13.3 sn'sinde, **son darbe** 22.9 sn'sinde.
  assert.ok(Math.abs(son.yikilis - K.isaret.yikilis) <= PAY,
    `son kızıl mancınık müziğin yıkılış vuruşunda yıkılır (ölçülen ${son.yikilis} sn, beklenen ${K.isaret.yikilis} ± ${PAY})`);
  assert.ok(Math.abs(son.carpisma - K.isaret.sonDarbe) <= PAY,
    `atlılar müziğin son darbesinde mancınıklara varır (ölçülen ${son.carpisma} sn, beklenen ${K.isaret.sonDarbe} ± ${PAY})`);
  assert.ok(son.ilkTas > 0 && son.ilkTas < 1, `ilk taş daha ilk saniyede yola çıkar (${son.ilkTas} sn)`);

  // Akın gerçekten kanattan gelir ve kadrajın dışından başlar: sütunun önü akın başlarken çok geride,
  // son darbede mancınık sırasının dibindedir.
  const akinBasi = tur.find(d => d.saniye >= K.isaret.akin);
  const darbeAni = tur.find(d => d.saniye >= K.isaret.sonDarbe);
  assert.ok(akinBasi.akin.on < -40, `akın kadrajın dışından, uzaktan başlar (sütunun önü ${akinBasi.akin.on} birim)`);
  assert.ok(darbeAni.akin.on > -16, `sütun son darbede mancınık sırasına varır (sütunun önü ${darbeAni.akin.on} birim)`);
  assert.equal(akinBasi.akin.dovusen, 0, 'akın başlarken hiçbir atlı dövüşte değil: sahne onları yola koyar');
  assert.ok(darbeAni.akin.dovusen > 0, 'son darbede atlılar oyunun yapay zekâsına devredilmiş ve dövüşüyor');
  assert.ok(izleme.every(d => !d.kahramanGorunur), 'tur boyunca hiçbir karede kahraman çizilmez');

  // 5) Döngü: müzik bittikten `tekrar` saniye sonra sahne sıfırlanır ve kadro yeniden tam kurulur.
  const yeni = izleme.filter(d => d.tur === 2);
  assert.ok(yeni.length, `sahne tur başına sıfırlanır (${K.isaret.son} + ${K.tekrar} sn)`);
  assert.equal(yeni[yeni.length - 1].mancinik.red, MANCINIK, 'yeni turda kızıl sıra yeniden tam kadro');
  assert.equal(yeni[yeni.length - 1].mancinik.blue, MANCINIK, 'yeni turda mavi sıra yeniden tam kadro');

  // 6) Ne ağ ne ölçüm, ne de sayfa hatası.
  assert.equal(await game(() => window.__sockets), 0, 'gösteride sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'gösteride ölçüm olayı gitmez');
  assert.deepEqual(errors, [], 'sayfa hatasız');

  // 7) Telefon: sahne **çökmeden** açılmalı (içerik kaydı masaüstünde yapılır, telefonda yalnız açılsın yeter).
  const mobil = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mSayfa = await mobil.newPage(), mHata = [];
  mSayfa.on('pageerror', e => mHata.push(e.message));
  mSayfa.on('console', e => { if (e.type() === 'error') mHata.push(e.text()); });
  await mSayfa.goto(url + '/?gosteri=mancinik&muzik=0&touch=1');
  await mSayfa.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000 });
  await mSayfa.waitForTimeout(6000);
  const mDurum = await mSayfa.evaluate(() => ({ ...window.__gosteri, kayip: window.__meadow.renderer.getContext().isContextLost() }));
  await mSayfa.screenshot({ path: 'artifacts/mancinik-2-telefon.png' });
  assert.ok(!mDurum.kayip, 'telefonda görüntü bağlamı düşmez');
  assert.ok(['duello', 'yikilis', 'akin', 'darbe'].includes(mDurum.evre), 'telefonda sahne koşar');
  assert.deepEqual(mHata, [], 'telefonda sayfa hatasız');
  await mobil.close();

  console.log('Mancınık düellosu gösterisi dumanı testi geçti.');
  console.log(`  kadro: ${MANCINIK}+${MANCINIK} mancınık · ${K.akin.sayi} atlı · ${K.muhafiz.sayi}+${K.muhafiz.sayi} piyade · yapı ${kadro.yapi} · görünür kahraman yok`);
  console.log(`  müziğe kilit: yıkılış ${son.yikilis} sn (işaret ${K.isaret.yikilis}) · son darbe ${son.carpisma} sn (işaret ${K.isaret.sonDarbe}) · ilk taş ${son.ilkTas} sn`);
  console.log(`  ${son.tas} taş yola çıktı · mavi ${son.mancinik.blue}/${MANCINIK} ayakta · akın ${darbeAni.akin.on} birimde, ${darbeAni.akin.dovusen} atlı dövüşte`);
  console.log(`  kamera: izometrik, yarı kadraj ${kamera.yariKadraj} (oyunun kendi 24/29/24 yönü)`);
} finally {
  await browser.close();
}
