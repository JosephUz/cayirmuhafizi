// "Ya Allah Hücum" gösterisi dumanı testi (?gosteri=hucum): dikey short için sahnelenmiş iki ordulu savaş
// çalışıyor mu? Denetlenenler: menü atlanır, Yusuf'un çizdiği **diziliş** birebir kurulur (iki kahraman, altı
// Kuzey bölüğü, altı Güney bölüğü, kule yok), kamera **uzaktan** izometrik bakar, arayüz gizlidir, sunucuya
// WebSocket açılmaz ve ölçüm gitmez.
// Asıl iki denetim şunlar:
//  1. **Müziğe kilit** — sahne kare kare (sahte saatle) ilerletilir; Güney'in menzilli kanat bölüklerinin
//     eridiği an, Kılıçlı bölüklerinin tükendiği an ve hücumun Kuzey okçu hattına vardığı an müziğin
//     işaretlerine (config isaret) oturmalı. Kuzey kahramanının ölüm anını sahne kendisi müziğe oturtur
//     (config kahramanKalkani), bu yüzden o bir ölçüm değil **kalkan kuralının** denetimidir; kahramanla
//     ilgili gerçek ölçüm, Güney kahramanının ona vuruş erimine girdiği andır (kahramanYetisti).
//  2. **Kanat disiplini** — Yusuf'un isteği: "kanatlardaki askerler merkezlere salça olmasınlar". Tur boyunca
//     hiçbir kanat birimi merkez şeridine girmemeli ve merkez bölükleri nidaya (19 sn) kadar yerinde durmalı.
// Sonda bozgun (Kuzey kahramanı ölünce bütün Kuzey ordusunun kaçması), tur sıfırlaması ve telefonda çökmeden
// açılma denetlenir.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5173). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
// Kadro, işaretler ve eşikler sahnenin ayarından okunur: config değişince test iki yerde güncellenmesin.
import { GOSTERI_HUCUM as K } from '../src/config.js';

/** Bölük sayıları config'ten türetilir: diziliş değişirse test kendiliğinden yeni kadroyu bekler. */
const kadroSay = (taraf, serit) => K.boluk.filter(B => B.taraf === taraf && (!serit || B.serit === serit))
  .reduce((n, B) => n + B.sayi, 0);
const BEKLENEN = {
  kuzey: { sol: kadroSay('kuzey', 'sol'), merkez: kadroSay('kuzey', 'merkez'), sag: kadroSay('kuzey', 'sag') },
  guney: { sol: kadroSay('guney', 'sol'), merkez: kadroSay('guney', 'merkez'), sag: kadroSay('guney', 'sag') },
};

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
 * Sahte saat: oyunun kare döngüsü `requestAnimationFrame` + `performance.now()` üstünde koşar, ikisi de burada
 * ele alınır. Çekim betiğinin (ajanlar/icerik/short-uret.mjs) yaptığının aynısı — test de sahneyi **videonun
 * göreceği kare temposuyla** (30 fps) ilerletir, yani ölçülen saniyeler videodakilerle birebirdir.
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

  await page.goto(url + '/?gosteri=hucum&muzik=0');
  await page.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000, polling: 100 });
  // Isınma kareleri sıfır süreyle: sahne kurulur ama saati ilerlemez (çekim betiğiyle aynı kalıp).
  for (let i = 0; i < 4; i++) { await game(() => window.__kare(0)); await page.waitForTimeout(120); }

  // 1) Menü atlanır, Yusuf'un çizdiği diziliş kurulur: iki ordu, üçer şerit, iki kahraman, **kule yok**.
  assert.ok(await page.locator('#mg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('meadow-game').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  const ilk = await game(() => window.__gosteri);
  assert.deepEqual(ilk.kuzey, BEKLENEN.kuzey, 'Kuzey ordusu bölükleriyle dizilir (sol / merkez / sağ)');
  assert.deepEqual(ilk.guney, BEKLENEN.guney, 'Güney ordusu bölükleriyle dizilir (sol / merkez / sağ)');
  assert.equal(ilk.yapi, 0, 'sahada yapı yok: kule / sancak / kışla görünmez (Yusuf: "kule yok")');
  assert.equal(ilk.evre, 'dizilis', 'tur diziliş evresiyle başlar');

  // Kadro oyunun kendi birimlerinden kurulur: tür, can, hız ve silah config'ten (SOLDIER_TYPES) gelir.
  const kadro = await game(() => {
    const e = window.__meadow.entities.filter(x => x.hucumGosteri);
    const grup = {};
    for (const x of e) {
      const k = `${x.faction}|${x.serit}|${x.typeKey}`;
      grup[k] = grup[k] || { n: 0, can: Math.round(x.stats.maxHp), hiz: +x.stats.speed.toFixed(2), menzil: x.stats.weapon.range };
      grup[k].n++;
    }
    const k = window.__meadow.players.map(p => ({ f: p.faction, sv: p.hero.level, silah: p.hero.loadout.weapon, at: Boolean(p.hero.loadout.horse), can: Math.round(p.hero.stats.maxHp) }));
    return { grup, kahraman: k, toplam: e.length, beyinsiz: e.filter(x => !x.brain).length };
  });
  // Diziliş: Kuzey merkezde okçu, kanatlarda Mızrak Kalkan + atlı; Güney merkezde mancınık + Mızrak Kalkan
  // Atlısı, kanatlarda menzilli + Kılıçlı (bkz. config boluk ve Yusuf'un çizimi).
  for (const B of K.boluk) {
    const f = B.taraf === 'kuzey' ? 'blue' : 'red';
    const g = kadro.grup[`${f}|${B.serit}|${B.tur}`];
    assert.ok(g, `${B.taraf} ${B.serit} ${B.tur} bölüğü kurulur`);
  }
  assert.equal(kadro.grup['red|merkez|catapult'].can, 40, 'mancınık canı oyunun kendi değeri (SIEGE.hp 40)');
  assert.equal(kadro.grup['red|merkez|catapult'].menzil, 36, 'mancınık menzili oyunun kendi değeri (36)');
  assert.equal(kadro.grup['blue|sol|horsespear'].hiz, 6.46, 'atlılar oyunun kendi atlı hızında (3.8 x 1.7)');
  assert.equal(kadro.grup['blue|sol|spearshield'].hiz, 3.04, 'kalkanlı piyade oyunun kendi hızında (3.8 x 0.8)');
  assert.equal(kadro.toplam, Object.values(BEKLENEN.kuzey).reduce((a, b) => a + b, 0)
    + Object.values(BEKLENEN.guney).reduce((a, b) => a + b, 0), 'sahadaki birim sayısı dizilişin toplamı');
  assert.equal(kadro.beyinsiz, kadro.toplam,
    `tur başında **hiçbir** birimin beyni açık değil: bölükler uyanana kadar yerinde durur (${kadro.beyinsiz} / ${kadro.toplam})`);
  // Kahramanlar: Kuzey seviye 1 okçu, Güney seviye 100 Mızrak Kalkan Atlısı.
  const kz = kadro.kahraman.find(x => x.f === 'blue'), gy = kadro.kahraman.find(x => x.f === 'red');
  assert.equal(kz.sv, K.kahraman.kuzey.seviye, 'Kuzey kahramanı seviye 1');
  assert.equal(kz.silah, 'bow', 'Kuzey kahramanı okçu (okçu bölüklerinin arasında durur)');
  assert.equal(gy.sv, K.kahraman.guney.seviye, 'Güney kahramanı seviye 100');
  assert.equal(gy.silah, 'spear', 'Güney kahramanı mızraklı');
  assert.ok(gy.at, 'Güney kahramanı atlı (Mızrak Kalkan Atlısı)');
  assert.ok(gy.can > kz.can * 5, `seviye 100 kahraman seviye 1'den çok daha dayanıklı (${gy.can} / ${kz.can} can)`);

  // 2) Kamera: dik izdüşüm (izometrik), oyunun kendi bakış açısı (24, 29, 24) ve **uzak** kadraj.
  const kamera = await game(() => {
    const c = window.__meadow.camera, p = c.position, t = window.__meadow.camTarget;
    const d = { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z };
    return { izometrik: c.isOrthographicCamera === true, yon: [+(d.x / d.y).toFixed(3), +(d.z / d.y).toFixed(3)], yariKadraj: +c.top.toFixed(1) };
  });
  assert.ok(kamera.izometrik, 'kamera izometrik (dik izdüşüm)');
  assert.deepEqual(kamera.yon, [+(24 / 29).toFixed(3), +(24 / 29).toFixed(3)], 'bakış açısı oyunun kendi izometrik yönü (24, 29, 24)');
  assert.equal(kamera.yariKadraj, K.kamera.genis, `dikey yarı kadraj ${K.kamera.genis} (normal oyunun 17'sinin iki katı: "kamera biraz uzaktan bakmalı")`);

  // 3) Arayüz gizli.
  for (const sel of ['#mg-bar', '#mg-hud', '#mg-score', '#mg-minimap']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }

  /**
   * 4) **Müziğe kilit ve kanat disiplini.** Sahne 30 fps'lik sahte saatle bir tur boyunca ilerletilir; yol
   * boyunca evreler, bölük sayıları, hücumun önü ve şeritten çıkan birim sayısı izlenir.
   * PAY: ölçülen anın müziğin işaretinden sapma payı (sn). Sahne oyunun kendi dövüşüyle koştuğu için
   * (vuruş sıraları, itme, ölüm anları) saniyesi saniyesine aynı olamaz; bir müzik barının yarısı kadar
   * (yaklaşık 1 sn) pay bırakıldı.
   */
  const PAY = 1.2;
  const izleme = [];
  const toplam = Math.round(K.isaret.son * 30);
  const fotolar = { 10: 'hucum-1-kanatlar', 18: 'hucum-2-ezme', 25: 'hucum-3-hucum', 28: 'hucum-4-bozgun' };
  for (let i = 1; i <= toplam; i++) {
    await game(() => window.__kare(1000 / 30));
    const d = await game(() => window.__gosteri);
    izleme.push(d);
    for (const [sn, ad] of Object.entries(fotolar)) {
      if (d.saniye >= Number(sn)) { delete fotolar[sn]; await page.screenshot({ path: `artifacts/${ad}.png` }); }
    }
  }
  const evreler = [...new Set(izleme.map(d => d.evre))];
  for (const e of ['dizilis', 'kanatlar', 'ezme', 'hucum', 'bozgun']) {
    assert.ok(evreler.includes(e), `${e} evresi koşar (görülenler: ${evreler.join(', ')})`);
  }
  const son = izleme[izleme.length - 1];

  // Açılış: 0-3 sn kimse kıpırdamaz, yalnız Güney mancınıkları taş atar.
  const ucuncu = izleme.find(d => d.saniye >= K.isaret.kanatlar);
  assert.ok(ucuncu.tas > 0, `Güney mancınıkları daha açılışta taş atar (${ucuncu.tas} taş)`);
  assert.deepEqual(ucuncu.guney, BEKLENEN.guney, 'diziliş evresinde Güney hiç kayıp vermez (kimse kıpırdamaz)');

  // **Müziğe kilit**: üç ölçülen an da işaretine oturur. Hepsi oyunun kendi dövüşünün sonucudur — sahne
  // yalnız hedefi ve uyanma anını söyler, bu saniyeleri kimse dayatmaz.
  const kilit = [
    ['Güney menzilli kanatları erir', son.menzilliBitti, K.isaret.menzilliEriyor],
    ['Güney kılıçlı kanatları ezilir', son.kilicliBitti, K.isaret.nida],
    ['hücum Kuzey okçu hattına varır', son.carpisma, K.isaret.carpisma],
  ];
  for (const [ad, olculen, isaret] of kilit) {
    assert.ok(olculen > 0, `${ad}: gerçekleşir`);
    assert.ok(Math.abs(olculen - isaret) <= PAY, `${ad}: müziğin işaretine oturur (ölçülen ${olculen} sn, beklenen ${isaret} ± ${PAY})`);
  }
  /**
   * Kuzey kahramanının ölüm **anı** sahne tarafından müziğe oturtulur (config `kahramanKalkani`: canı
   * `kahramanOlur`a kadar tazelenir, işaret gelince sahne onu Güney kahramanının vuruşuyla düşürür). Bu yüzden
   * `kahramanOlum ≈ 27` denetimi bir ölçüm değil, kalkan kuralının kendisinin denetimidir — onu öyle de
   * adlandırıyoruz. Asıl ölçüm `kahramanYetisti` / `kahramanAra`: Güney kahramanının Kuzey kahramanına
   * `kahramanYetisme` birim kadar **gerçekten sokulduğu** an ve tur boyunca aralarındaki en kısa mesafe.
   * Hücum takılsa, kaçan Kuzey kahramanı uzaklaşsa ya da atlılar okçu hattını aşamasa bu ölçüm düşer
   * (iki kahraman turun başında 46 birim uzaktadır); kalkan onu kurtaramaz.
   */
  assert.ok(son.kahramanAra <= K.kahramanYetisme,
    `Güney kahramanı Kuzey kahramanının dibine varır (en kısa mesafe ${son.kahramanAra}, sınır ${K.kahramanYetisme} birim)`);
  // İki ölçü de Kuzey kahramanı **yaşarken** alınır (ölünce ölçüm durur), yani "ölüm işareti geldiğinde
  // Güney kahramanı dibindeydi" bilgisi bunların içindedir. Buradaki asıl denetim yetişmenin **hücumla**
  // olması: marştan önce bir yakınlaşma varsa diziliş ya da kaçış yanlış kurulmuş demektir.
  assert.ok(son.kahramanYetisti >= K.isaret.marsBaslar,
    `Kuzey kahramanına yetişme hücumla olur, öncesinde değil (ölçülen ${son.kahramanYetisti} sn, marş ${K.isaret.marsBaslar})`);
  // Kalkan kuralı: işaretten önce Kuzey kahramanı ayakta kalır, işaretle birlikte düşer.
  assert.ok(izleme.filter(d => d.saniye < K.isaret.kahramanOlur).every(d => !d.kahramanOlum),
    'kahraman kalkanı: Kuzey kahramanı işaretten önce düşmez (vurulur, kanar, ama ayakta kalır)');
  assert.ok(Math.abs(son.kahramanOlum - K.isaret.kahramanOlur) <= PAY,
    `kahraman kalkanı: ölüm anı işarete oturur (ölçülen ${son.kahramanOlum} sn, beklenen ${K.isaret.kahramanOlur} ± ${PAY})`);

  // **Kanat disiplini**: hiçbir kanat birimi merkez şeridine girmez (Yusuf: "merkezlere salça olmasınlar").
  assert.equal(son.seritKacagi, 0, `hiçbir kanat birimi merkez şeridine girmez (en çok ${son.seritKacagi} birim girdi)`);
  assert.ok(son.enIcerdeki >= K.serit.yari - 0.5,
    `kanat birimleri merkez bandının dışında kalır (merkeze en çok |a| = ${son.enIcerdeki}, sınır ${K.serit.yari})`);

  // **Merkez disiplini**: Kuzey'in okçu hattı nidaya kadar hiç kayıp vermez ve yerinden kıpırdamaz; merkezin
  // çatışmaya girmesi yalnız 4. aşamadadır.
  const nidaOnce = izleme.filter(d => d.saniye < K.isaret.nida);
  const merkezEnAz = Math.min(...nidaOnce.map(d => d.kuzey.merkez));
  assert.ok(merkezEnAz >= BEKLENEN.kuzey.merkez - 6,
    `Kuzey merkezi nidaya kadar ayakta kalır (en az ${merkezEnAz} / ${BEKLENEN.kuzey.merkez}; yalnız mancınık taşı eksiltir)`);
  assert.ok(nidaOnce.every(d => d.akinOn < -15),
    'nidadan önce Güney merkezi yerinden kıpırdamaz (hücumun önü dizilişteki yerinde)');

  // **Hücum**: atlılar dörtnala gelir, okçu hattına varınca oyunun yapay zekâsına devredilir.
  const marsAni = izleme.find(d => d.saniye >= K.isaret.marsBaslar);
  const varis = izleme.find(d => d.saniye >= son.carpisma);
  assert.ok(marsAni.akinDovusen === 0, 'marş başlarken hiçbir atlı dövüşte değil: sahne onları yola koyar');
  assert.ok(varis.akinOn > marsAni.akinOn + 25, `hücum sahayı boydan boya kat eder (${marsAni.akinOn} → ${varis.akinOn} birim)`);
  const sonrasi = izleme.filter(d => d.saniye > son.carpisma + 1);
  assert.ok(sonrasi.some(d => d.akinDovusen > 0), 'okçu hattına varan atlılar oyunun yapay zekâsına devredilir ve dövüşür');

  // **Bozgun**: Kuzey kahramanı ölünce bütün Kuzey ordusu dağılıp kaçar; kapanış karesinde merkez boşalmıştır.
  assert.ok(son.kuzeyKalan >= 0, 'kapanış karesi ölçülür');
  assert.ok(son.hepsiKaciyor, 'kapanış karesinde ayakta kalan her Kuzey birimi kuzeye kaçıyor (dövüşen kalmaz)');
  // Kuzey merkezi hücumda ağır kayıp verir: atlılar okçu hattını çiğneyip geçer. Kalanların hepsi kaçmakta
  // olduğu için (üstteki denetim) sahada dövüşen Kuzey birimi kalmaz.
  assert.ok(son.kuzeyMerkezKalan <= BEKLENEN.kuzey.merkez * 0.7,
    `hücum Kuzey okçu hattını çiğner: merkezin en az üçte biri düşer (kalan ${son.kuzeyMerkezKalan} / ${BEKLENEN.kuzey.merkez})`);
  assert.ok(son.guney.merkez > 0, 'Güney merkezi sahada kalır: savaşı Güney kazanır');

  // 5) Döngü: müzik bittikten `tekrar` saniye sonra sahne sıfırlanır ve kadro yeniden tam kurulur.
  for (let i = 0; i < Math.round((K.tekrar + 1) * 30); i++) await game(() => window.__kare(1000 / 30));
  const yeni = await game(() => window.__gosteri);
  assert.equal(yeni.tur, 2, `sahne tur başına sıfırlanır (${K.isaret.son} + ${K.tekrar} sn)`);
  assert.deepEqual(yeni.kuzey, BEKLENEN.kuzey, 'yeni turda Kuzey yeniden tam kadro');
  assert.deepEqual(yeni.guney, BEKLENEN.guney, 'yeni turda Güney yeniden tam kadro');

  // 6) Ne ağ ne ölçüm, ne de sayfa hatası.
  assert.equal(await game(() => window.__sockets), 0, 'gösteride sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'gösteride ölçüm olayı gitmez');
  assert.deepEqual(errors, [], 'sayfa hatasız');

  // 7) Telefon: sahne **çökmeden** açılmalı (içerik kaydı masaüstünde yapılır, telefonda yalnız açılsın yeter).
  const mobil = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mSayfa = await mobil.newPage(), mHata = [];
  mSayfa.on('pageerror', e => mHata.push(e.message));
  mSayfa.on('console', e => { if (e.type() === 'error') mHata.push(e.text()); });
  await mSayfa.goto(url + '/?gosteri=hucum&muzik=0&touch=1');
  await mSayfa.waitForFunction(() => window.__gosteri && window.__gosteri.evre, null, { timeout: 30000 });
  await mSayfa.waitForTimeout(6000);
  const mDurum = await mSayfa.evaluate(() => ({ ...window.__gosteri, kayip: window.__meadow.renderer.getContext().isContextLost() }));
  await mSayfa.screenshot({ path: 'artifacts/hucum-5-telefon.png' });
  assert.ok(!mDurum.kayip, 'telefonda görüntü bağlamı düşmez');
  assert.ok(['dizilis', 'kanatlar', 'ezme', 'hucum', 'bozgun'].includes(mDurum.evre), 'telefonda sahne koşar');
  assert.deepEqual(mHata, [], 'telefonda sayfa hatasız');
  await mobil.close();

  console.log('"Ya Allah Hücum" gösterisi dumanı testi geçti.');
  console.log(`  kadro: Kuzey ${JSON.stringify(BEKLENEN.kuzey)} · Güney ${JSON.stringify(BEKLENEN.guney)} · kahramanlar sv ${kz.sv} / ${gy.sv} · yapı 0`);
  console.log(`  müziğe kilit: menzilli ${son.menzilliBitti} (${K.isaret.menzilliEriyor}) · kılıçlı ${son.kilicliBitti} (${K.isaret.nida}) · hücum ${son.carpisma} (${K.isaret.carpisma})`);
  console.log(`  kahraman: Güney kahramanı ${son.kahramanYetisti} sn'de dibine varır, en kısa mesafe ${son.kahramanAra} (sınır ${K.kahramanYetisme}) · kalkan ölümü ${son.kahramanOlum} sn'ye oturtur (${K.isaret.kahramanOlur})`);
  console.log(`  disiplin: merkez şeridine giren kanat birimi ${son.seritKacagi} · merkeze en çok yaklaşma |a| = ${son.enIcerdeki} (sınır ${K.serit.yari})`);
  console.log(`  kapanış: kadrajda ${son.kuzeyKalan} Kuzey birimi, merkezde ${son.kuzeyMerkezKalan}, hepsi kaçıyor · ${son.tas} mancınık taşı atıldı`);
  console.log(`  kamera: izometrik, yarı kadraj ${kamera.yariKadraj} (oyunun kendi 24/29/24 yönü)`);
} finally {
  await browser.close();
}
