import * as T from 'three';
import { yawFromDir } from './builders.js';
import { addEntity, applyLevelUp, createEntity, makeStats } from './characters.js';
import { damageEntity, startAttack } from './combat.js';
import { ANTI, GOSTERI_HUCUM as K, SIEGE, SOLDIER_TYPES, VISION } from './config.js';
import { t } from './dil.js';
import { removeStructure } from './structures.js';
import { setupGame, step } from './world.js';

/**
 * **"Ya Allah Hücum" gösterisi** (`?gosteri=hucum`, yalnız tarayıcıda): dikey short videosu için sahnelenmiş,
 * her turda sıfırlanıp tekrarlanan tek bir savaş. `?gosteri=1`, `?gosteri=kahraman`, `?gosteri=savas`,
 * `?gosteri=mancinik` ve normal oyun bu dosyadan hiç etkilenmez.
 *
 * Ekranda **Kuzey üstte, Güney altta**; sol ve sağ kanat ekrana göredir. Diziliş Yusuf'un çizimidir
 * (calisma/icerik/short-dizilis-ya-allah-hucum.png, bkz. config GOSTERI_HUCUM.boluk).
 *
 * Sahnenin akışı (bir tur 33.59 sn; saniyeler config `isaret`, müziğin vuruşlarıdır):
 *  1. **dizilis** (0 - 3 sn) — iki ordu dizili bekler, kimse kıpırdamaz. Yalnız Güney'in mancınıkları uzaktan
 *     Kuzey'in okçu hattına taş atar (karamsar açılış).
 *  2. **kanatlar** (3 - 15 sn) — iki kanat harekete geçer: Güney'in solda **Atlı Okçu**, sağda **Okçu**
 *     bölükleri öne çıkar; Kuzey solda **Mızrak Kalkan + Mızraklı Atlı**, sağda **Mızrak Kalkan + Kılıçlı
 *     Atlı** ile karşılık verir. Mızrak Kalkan atlı okçunun, Kılıçlı Atlı okçunun antisidir (ANTI.table), ama
 *     kanatlar **tükenmez** (bkz. config `kanatDayanim`): 11. saniyede (`isaret.menzilliEriyor`) Güney'in
 *     **Kılıçlı** bölükleri ikinci dalga olarak katılır — müziğin karanlığının koyulaştığı an budur.
 *  3. **ezme** (15 - 19 sn, `isaret.enKotu`) — Kuzey kanatları ileri yüklenir: cephe bandının tabanı iner
 *     (config `cephe.ezme`) ve Güney'in kanatları geriye itilir, ama ayakta kalıp dövüşmeyi sürdürür.
 *     Müziğin tek darbesinden sonraki neredeyse sessizlik buraya denk gelir.
 *  4. **hucum** (19 sn, "Ya Allah" nidası) — Güney merkezi kalkar. 19.74'te mehter marşıyla **Mızrak Kalkan
 *     Atlıları** ve **seviye 100 kahraman** mancınıkları geçip Kuzey merkezine dörtnala koşar; Kuzey'in
 *     **seviye 1** kahramanı kendi okçularının arkasına kaçar, atlılar okçuları çiğner, mancınıklar arkadan
 *     yetişip atar.
 *  5. **bozgun** (~27 sn) — Kuzey kahramanı Güney kahramanıyla atlıların arasında kalıp düşer; o an bütün
 *     Kuzey ordusu dönüp kuzeye ve yanlara kaçarak ekran dışına çıkar (marşın bitişi).
 *  6. Müzik süresi (`isaret.son`) + `tekrar` dolunca sahne baştan kurulur.
 *
 * **Kanat disiplini.** Yusuf'un isteği birebir şuydu: "kanatlardaki askerler merkezlere salça olmasınlar."
 * Dikey kadrajda şeritler arası boşluk askerin görüşünden (VISION.soldier 10) küçük kalmak zorunda, bu yüzden
 * disiplin kadrajla değil **hedeflemeyle** sağlanır: her birim bir şeride bağlıdır ve sahne ona yalnız
 * **kendi şeridindeki** düşmanı `attack` emriyle verir (bkz. `hedefleriTazele`). Emri ai.js okur ve gerisini
 * oyunun kendisi yapar: yürüme, menzil, nişan, vuruş, hasar, anti üstünlüğü, itme, ölüm (ai.js `engage` →
 * combat.js `startAttack` → `damageEntity`). Sahne hiçbir sayıyı ezmez; yalnız **kimin kimi hedeflediğini**
 * ve **hangi bölüğün ne zaman uyandığını** söyler.
 *
 * **Neden bölükler uyanana kadar beyinsiz?** Beyni açık bir asker kendisine vuranı 40 birim öteye kadar kovalar
 * (ai.js `retaliator` / ARMY.retaliateRange). Mancınık taşı yiyen Kuzey okçusu böylece mancınıkların üstüne
 * yürür ve merkez daha 5. saniyede dağılırdı. Bölük `uyanma` işaretine kadar beyinsiz durur: sahada vardır,
 * vurulur, ölür — ama kendiliğinden hiçbir yere gitmez.
 */
export function createHucumGosteri(world, { arenaReady }) {
  world.gosteri = true;
  const { eksen, kanat } = K;
  /** Sahne koordinatından (a: ekranın yatayı, b: ekranın dikeyi, + = kuzey) dünya noktası. */
  const noktaX = (a, b) => eksen.x * a + kanat.x * b;
  const noktaZ = (a, b) => eksen.z * a + kanat.z * b;
  /** Dünya noktasının sahne koordinatları (eksenler birim ve dik olduğu için iç çarpım yeter). */
  const aOf = (p) => p.x * eksen.x + p.z * eksen.z;
  const bOf = (p) => p.x * kanat.x + p.z * kanat.z;
  /** Kuzey'in merkez okçu hattının ön safı: hücumun "vardı" sayıldığı çizgi (bkz. `hucumuSur`). */
  const OKCU_HATTI = Math.min(...K.boluk.filter(B => B.taraf === 'kuzey' && B.serit === 'merkez').map(B => B.b));
  /**
   * Saate bakan `uyanma` işaretleri, erkenden geçe sıralı (bkz. `uyanmalar`). Liste config `boluk`tan
   * türetilir ki diziliş değişince burada unutulmuş bir işaret adı kalmasın. `hucumda` dışarıda: o bölükler
   * saate değil **mesafeye** bakar, `null` olanlar (mancınıklar) hiç uyumaz.
   */
  const UYANMA_ISARETLERI = [...new Set(K.boluk.map(B => B.uyanma))]
    .filter(ad => ad && ad !== 'hucumda').sort((a, b) => K.isaret[a] - K.isaret[b]);
  /**
   * Kadrajın üst kenarının `kanat` üstündeki yeri (bozgun ölçüsü): dikey yarı kadraj ekran birimidir, dünya
   * karşılığı izometrik kısalmayla (0.6496) bölünür; üstüne bozgun evresinin bakış noktası eklenir.
   */
  const KADRAJ_UST = K.kamera.odak.bozgun.b + K.kamera.hucum / 0.6496;

  const odakNokta = new T.Vector3(), hedefOdak = new T.Vector3();
  const taraflar = {
    // `yon` tarafın **kendi arkası**: Kuzey'in arka safları +, Güney'inkiler - yönünde dizilir.
    kuzey: { ad: 'kuzey', faction: 'blue', yon: 1, oyuncu: null, kahraman: null, birimler: [] },
    guney: { ad: 'guney', faction: 'red', yon: -1, oyuncu: null, kahraman: null, birimler: [] },
  };
  let sahne = null, tur = 0, yapis = true;
  let kadraj = K.kamera.genis, hedefKadraj = K.kamera.genis;

  // ---- Kuruluş

  /** Bir kez: dünya kurulur, sahne dışında kalan her şey (yapı, kamp, haydut, ganimet) sahadan kalkar. */
  function basla() {
    setupGame(world, {
      // İki koltuk da "insan": hiçbir bot yapay zekâsı koşmaz (bkz. economy.js updateBots) ve kahramanlar
      // yalnız girdiyle hareket eder — girdiyi bu sahne verir (bkz. `kahramanGirdisi`).
      teamSize: 1, humans: [{ name: t('oyuncu.kuzey') }, { name: t('oyuncu.guney'), faction: 'red' }],
      seed: Number(new URLSearchParams(location.search).get('tohum')) || K.tohum,
    });
    world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
    world.onEnd = null;
    // Ganimet / exp küresi düşmez: 150 askerin öldüğü bir sahada altın ve küre yağmuru olurdu.
    world.onDeath = () => {};
    world.camps.length = 0; world.banditTimer = Infinity;
    // **Yapılar kalkar**: sahnede kule, sancak, kışla yok (Yusuf: "kule yok"). Kule kadrajdaki birimi döverdi
    // ve mancınık hedefini kuleye çevirirdi (bkz. combat.js nearestEnemyTower).
    for (let i = world.structures.length - 1; i >= 0; i--) removeStructure(world, world.structures[i]);
    // Savaş sisi kapalı: kamera nereye bakarsa baksın iki ordu da görünür (öbür gösterilerle ortak).
    world.fog.enabled = false; world.fog.update(0, true);
    // Sahne pusu: bu kadraj normal oyunun iki katı geniş, varsayılan pus ordunun yarısını yutardı.
    if (world.scene && world.scene.fog) {
      const d = kameraUzakligi();
      world.scene.fog.near = d * K.sis.yakin; world.scene.fog.far = d * K.sis.uzak;
    }

    for (const t of Object.values(taraflar)) {
      t.oyuncu = world.players.find(p => p.faction === t.faction);
      t.kahraman = t.oyuncu.hero;
      // Toplanma bayrağı olmamalı: olsaydı emirsiz kalan her asker (ai.js rallyAnchor) şeridini bırakıp
      // oraya yürürdü. Emirsiz askerin bağlı olduğu nokta kendi `brain.home`u, yani bölüğündeki yeridir.
      t.oyuncu.rally = null;
      kahramaniKur(t);
    }
    madenleriKaldir();
    arenaReady();
    tur = 0;
    diz();
  }

  /**
   * **Altın madenlerini söker** (Yusuf: "orta alandaki altın madenleri olmasın"). Oyunun haritasının ortasında
   * tarafsız üç maden vardır (bkz. environment.js: `kind: 'gold'` engeli + `nodes` girdisi + `decor.mines`
   * çizimi) ve ikisi tam kadrajın ortasına, iki ordunun arasına düşüyordu.
   *
   * Üç listeden birden çıkarılır — yalnız engeli silmek yetmez, maden yine çizilir ve kahraman yine vurabilir:
   *  - `world.obstacles`: birimler artık oraya çarpmaz (`obstacleVersion` artırılır, çarpışma önbelleği tazelensin),
   *  - `world.nodes`: kahramanın kaynak çıkarabileceği düğüm kalmaz,
   *  - `world.env.decor.mines`: **çizim listesi**; `arenaReady`den (buildEnvironmentView) **önce** temizlenmeli,
   *    yoksa maden sahnede görünmeye devam eder.
   * Yalnız sahanın içindekiler kaldırılır: üslerin arkasındaki madenler kadrajın çok dışında, onlara dokunulmaz.
   */
  function madenleriKaldir() {
    const icerde = (p) => !sahaDisi(p, K.maden.pay);
    const d = world.env && world.env.decor;
    if (d && d.mines) d.mines = d.mines.filter(m => !icerde({ x: m.x, z: m.z }));
    if (world.nodes) for (let i = world.nodes.length - 1; i >= 0; i--) {
      const n = world.nodes[i];
      if (n.kind === 'gold' && icerde(n.pos)) world.nodes.splice(i, 1);
    }
    let silindi = 0;
    for (let i = world.obstacles.length - 1; i >= 0; i--) {
      const o = world.obstacles[i];
      if (o.kind === 'gold' && icerde(o.pos)) { world.obstacles.splice(i, 1); silindi++; }
    }
    if (silindi) world.obstacleVersion = (world.obstacleVersion || 0) + 1;
  }

  /**
   * Sahanın içinde **ekranda duran** maden kayası sayısı (tarayıcı dışında 0). Çizim listesini değil kurulmuş
   * görünümü (`world.envView.root`) gezer: maden kayaları sahnedeki tek `DodecahedronGeometry`dir
   * (environment.js), her madende üç tane. Bir maden sayılır, kaya değil.
   */
  function madenKayalari() {
    const kok = world.envView && world.envView.root;
    if (!kok) return 0;
    const yerler = new Set();
    kok.traverse((n) => {
      if (!n.isMesh || !n.geometry || n.geometry.type !== 'DodecahedronGeometry') return;
      const p = n.parent ? n.parent.position : n.position;
      if (!sahaDisi({ x: p.x, z: p.z }, K.maden.pay)) yerler.add(`${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    });
    return yerler.size;
  }

  /**
   * Kahraman: tarafının seti ve sahne seviyesi (Kuzey sv 1 okçu, Güney sv 100 Mızrak Kalkan Atlısı).
   * Seviye oyunun kendi seviye sistemidir (characters.js applyLevelUp): her seviye +10 can, +%8 vuruş gücü ve
   * daha geniş vuruş alanı verir. Seviye 100 kahramanın 1090 canı ve en geniş vuruş alanı vardır.
   */
  function kahramaniKur(t) {
    const C = K.kahraman[t.ad], p = t.kahraman;
    p.loadout = { ...C.loadout };
    p.stats = makeStats(p.loadout, true);
    p.radius = p.stats.radius; p.invMass = p.stats.invMass;
    p.level = 1;
    for (let i = 1; i < C.seviye; i++) applyLevelUp(p);
    p.hp = p.stats.maxHp;
    world.fx.refreshEntity(p);
  }

  /** Sahnedeki bütün gösteri birimleri, havadaki oklar ve alanlar sahadan kalkar (tur sıfırlaması). */
  function sahayiBosalt() {
    for (let i = world.entities.length - 1; i >= 0; i--) {
      const e = world.entities[i];
      if (e.isPlayer) continue;
      world.fx.removeEntity(e); world.entities.splice(i, 1);
    }
    for (const a of world.arrows) world.fx.removeArrow(a);
    world.arrows.length = 0;
    for (const z of world.zones) world.fx.removeZone(z);
    world.zones.length = 0;
    for (const t of Object.values(taraflar)) t.birimler.length = 0;
  }

  /**
   * Yeni bir sahne birimi: oyunun kendi asker türünden (SOLDIER_TYPES) kurulur — canı, hızı, yarıçapı, görüşü
   * ve silahı oyundaki değerleridir, yalnız kışlada basılmak yerine (sahada bina yok) doğrudan yerine konur.
   * Beyni `null` doğar: bölüğü `uyanma` işaretine gelene kadar sahne onu yerinde tutar.
   */
  function birimDogur(t, B, a, b) {
    const tip = SOLDIER_TYPES.find(s => s.key === B.tur);
    const x = noktaX(a, b), z = noktaZ(a, b);
    const e = createEntity({ faction: t.faction, owner: t.oyuncu, loadout: { weapon: tip.weapon, shield: tip.shield, horse: tip.horse }, x, z });
    e.typeKey = tip.key;
    // Can / hız / yarıçap `createEntity` içinde oyunun kendi makeStats'ından gelir (at +50 can, kalkan +30 can,
    // kalkan x0.8 hız): sahne hiçbirini ezmez. Yalnız mancınık ayrı bir kuşatma birimidir.
    e.vision = VISION.soldier;
    if (tip.siege) {
      e.isSiege = true;
      e.stats.maxHp = SIEGE.hp; e.hp = SIEGE.hp;
      e.stats.speed = SIEGE.speed; e.radius = SIEGE.radius;
      e.vision = Math.max(VISION.siege, e.stats.weapon.range);
    }
    // Rakip orduya dönük dur: iki saf da karşıya bakar.
    e.facing = yawFromDir(-kanat.x * t.yon, -kanat.z * t.yon);
    e.spawnTimer = 0;
    e.brain = null;
    // Sahnenin birime iliştirdiği alanlar: şeridi, bölüğü, uyanma işareti, hedef menzili ve yuvası (emirsiz
    // kalınca döneceği yer). `hucumGosteri` bu birimin sahneye ait olduğunu söyler.
    e.hucumGosteri = true;
    e.serit = B.serit; e.taraf = t.ad;
    e.uyanma = B.uyanma;
    e.akinci = Boolean(B.akinci);
    e.hedefMenzil = B.uyanma === 'hucumda' ? K.hedef.okcuMenzil : K.hedef.menzil;
    /**
     * **Kanat dayanımı** (Yusuf: "kanatlardaki askerler henüz tükenmemiş olsun savaşıyor olsunlar ... canları
     * uzun sürsün, 100 vuruşluk canları olsun"). Kanat bölükleri aldıkları hasarın yalnız `hasarOrani` katını
     * yer (bkz. combat.js `hitDamage`); oran `kanat.vurusDayanimi`den türetilir: oyunun en sert vuruşu olan
     * **anti** vuruş normalde azami canın %34'ünü götürür (üç vuruşta ölüm), bu oranla `vurusDayanimi`
     * vuruşta götürür. Merkez bölükleri ve kahramanlar dokunulmaz kalır: hücumun Kuzey okçu hattını
     * çiğnemesi ve kahramanın düşmesi oyunun kendi hızında olmalı.
     */
    if (B.serit !== 'merkez') e.hasarOrani = 1 / (ANTI.soldierMult * K.kanatDayanim.vurusDayanimi);
    e.yuva = { x, z };
    addEntity(world, e);
    t.birimler.push(e);
    return e;
  }

  // ---- Tur dizilişi

  /** Bir bölüğün saf düzeni: `sutun` kadar yan yana, kalanı arkaya; arka saflar hep düşmandan uzağa. */
  function boluguDiz(B) {
    const t = taraflar[B.taraf], merkezA = K.serit[B.serit];
    for (let i = 0; i < B.sayi; i++) {
      const saf = Math.floor(i / B.sutun), yer = i % B.sutun;
      const genis = Math.min(B.sutun, B.sayi - saf * B.sutun);
      const a = merkezA + (yer - (genis - 1) / 2) * B.aralik;
      const b = B.b + saf * B.sira * t.yon;
      birimDogur(t, B, a, b);
    }
  }

  /** Kahramanı tur başındaki yerine koyar ve bütün sayaçlarını sıfırlar. */
  function kahramaniDiz(t) {
    const C = K.kahraman[t.ad], p = t.kahraman;
    const x = noktaX(0, C.b), z = noktaZ(0, C.b);
    p.pos.set(x, 0, z); p.vel.set(0, 0, 0); p.push.set(0, 0, 0); p.moveDir.set(0, 0, 0);
    p.hp = p.stats.maxHp; p.alive = true; p.deathTimer = 0; p.jumpY = 0; p.vy = 0; p.airJumps = 0;
    p.dodgeCd = 0; p.dodgeTimer = 0; p.invuln = 0; p.stun = 0; p.attackTimer = 0; p.cooldown = 0;
    p.charging = false; p.charge = 0; p.aimLocked = false; p.sprinting = false;
    p.facing = yawFromDir(-kanat.x * t.yon, -kanat.z * t.yon);
    p.serit = 'merkez';
    p.aim.set(noktaX(0, C.b - 6 * t.yon), 0, noktaZ(0, C.b - 6 * t.yon));
    Object.assign(t.oyuncu.input, { mv: [0, 0], aim: [p.aim.x, p.aim.z], ha: true, sp: false, aq: false, ah: false, ar: false, dq: false, jq: false, heldAt: -1 });
  }

  /** Bir turun dizilişi: bütün bölükler ve iki kahraman yerine konur, sahne saati sıfırlanır. */
  function diz() {
    tur++;
    sahayiBosalt();
    for (const B of K.boluk) boluguDiz(B);
    for (const t of Object.values(taraflar)) kahramaniDiz(t);

    kadraj = hedefKadraj = K.kamera.genis;
    yapis = true;
    sahne = {
      saniye: 0, evre: 'dizilis', tazele: 0,
      /** Mancınıkların kendi hızıyla kuzeye yürüdüğü yol (hücumda; bkz. `mancinikSur`). */
      mancinikYol: 0,
      /** Ölçülen anlar (sahne saati, sn; 0 = olmadı): dumanı testi ve çekim betiği bunlara bakar. */
      carpisma: 0, kahramanYetisti: 0, kahramanAra: 99, kahramanOlum: 0,
      kanatEnAz: { kuzey: 1e9, guney: 1e9 }, guneyCepheEnAz: 1e9, nidaKanat: null,
      kuzeyKalan: -1, kuzeyMerkez: -1, hepsiKaciyor: false,
      /** Tur boyunca atılan mancınık taşı ve şeridinden çıkan birim sayısı (disiplin ölçüsü). */
      tas: 0, seritKacagi: 0, enIcerdeki: 99,
      kacis: false,
    };
    odakTazele();
    odakNokta.copy(hedefOdak);
  }

  // ---- Şerit disiplini ve hedefleme

  /** Sahnenin bütün yaşayan birimleri (kahramanlar hariç: onları girdi sürer). */
  function* birimler() {
    for (const t of Object.values(taraflar)) for (const e of t.birimler) if (e.alive) yield e;
  }

  /** Bir noktanın hangi şeride düştüğü (sol / merkez / sağ); şerit sınırı `serit.yari`dir. */
  function seridi(a) {
    return a < -K.serit.yari ? 'sol' : a > K.serit.yari ? 'sag' : 'merkez';
  }

  /** Nokta sahnenin sahasının dışında mı (bkz. config `saha`)? */
  const sahaDisi = (p, pay = 0) => Math.abs(aOf(p)) > K.saha.a + pay || bOf(p) > K.saha.kuzey + pay || bOf(p) < K.saha.guney - pay;

  /**
   * Bir kanat biriminin o anki **cephe bandı** (bkz. config `cephe`): iki taraf da `taban`ın güneyine inemez,
   * Güney birimleri ayrıca `tavan`ın kuzeyine çıkamaz. Merkez birimleri için sınır yoktur (hücum zaten sahanın
   * boyunu kat eder). Sınır yalnız **beyni açık** birimlere uygulanır (bkz. `sahayaSigdir`): henüz uyanmamış
   * bölükler dizilişteki yerlerinde durur, bandın dışında olsalar bile.
   */
  function cepheSiniri(e) {
    if (e.serit === 'merkez') return null;
    const C = sahne.saniye >= K.isaret.enKotu ? K.cephe.ezme : K.cephe.kanatlar;
    return { alt: C.taban, ust: e.taraf === 'kuzey' ? K.saha.kuzey : C.tavan };
  }

  /**
   * **Saha duvarı**: oyunun yapay zekâsına bırakılmış birimler (beyni açık olanlar) ve kahramanlar sahanın
   * dışına itilemez. Her kareden sonra, sahanın dışına taşan birim sınıra geri alınır ve dışa giden itmesi
   * (`push` / `vel`) sıfırlanır.
   *
   * Duvar neden gerekli: oyunun kendi itmesi (kılıç 12, mızrak 9) vuruşu yiyen piyadeyi geri savurur; kovalayan
   * atlı her vuruşta onu biraz daha iter. Sahneyi ikisi birlikte kadrajın dışına sürüklüyor ve ne biri
   * ölüyordu ne öbürü vazgeçiyordu (normal oyunda ARMY.chase vazgeçirir; burada hedefi sahne veriyor). Duvara
   * sıkışan piyade artık geri savrulamaz, vuruşlar üst üste iner ve dövüş sahnenin içinde biter.
   *
   * Sahne kendi sürdüğü birimlere (dörtnala gelen atlılar, bozgunda kaçan Kuzey ordusu — ikisinin de beyni
   * kapalıdır) dokunmaz: biri sahaya girmek, öbürü sahadan çıkmak zorundadır.
   */
  function sahayaSigdir() {
    const sinirla = (e) => {
      const a = aOf(e.pos), b = bOf(e.pos), c = cepheSiniri(e);
      let na = Math.max(-K.saha.a, Math.min(K.saha.a, a));
      let nb = Math.max(c ? c.alt : K.saha.guney, Math.min(c ? c.ust : K.saha.kuzey, b));
      // **Şerit koridoru**: kanat birimi merkez bandına, merkez birimi kanat bandına geçemez. Hedefleme zaten
      // şeritle sınırlı ama dövüşün itmesi ve kalabalığın basıncı bölükleri yana yayıyordu; koridor duvarı
      // Yusuf'un istediğini görüntüde de garanti eder: kanattaki asker merkezdeki çatışmanın içine girmez.
      if (e.serit === 'sol') na = Math.min(na, -K.serit.yari);
      else if (e.serit === 'sag') na = Math.max(na, K.serit.yari);
      else na = Math.max(-K.serit.yari, Math.min(K.serit.yari, na));
      if (na === a && nb === b) return;
      e.pos.set(noktaX(na, nb), e.pos.y, noktaZ(na, nb));
      // Birikmiş hız ve itme sıfırlanır: yoksa birim her karede duvara yeniden yaslanır. Bir sonraki karede
      // kendi `moveDir`inden yeniden hızlanır, yani duvar yalnız dışa doğru çalışır.
      e.vel.set(0, 0, 0); e.push.set(0, 0, 0);
    };
    for (const e of birimler()) if (e.brain) sinirla(e);
    for (const t of Object.values(taraflar)) if (t.kahraman.alive) sinirla(t.kahraman);
  }

  /**
   * Birimin **şeridine ve sahaya çekilmiş** o anki yeri: `kanat` üstündeki ilerlemesi korunur (boşuna geri
   * çekilmez), yalnız şeridinin ya da sahanın dışına taşmışsa sınıra geri alınır.
   */
  function seridePark(e) {
    let a = aOf(e.pos), b = bOf(e.pos);
    const ic = K.serit.yari + K.serit.pay;
    if (e.serit === 'sol') a = Math.min(a, -ic);
    else if (e.serit === 'sag') a = Math.max(a, ic);
    else a = Math.max(-K.serit.yari, Math.min(K.serit.yari, a));
    a = Math.max(-K.saha.a, Math.min(K.saha.a, a));
    b = Math.max(K.saha.guney, Math.min(K.saha.kuzey, b));
    return { x: noktaX(a, b), z: noktaZ(a, b) };
  }

  /**
   * Birimin **kendi şeridindeki** en yakın yaşayan düşmanı (`menzil` içinde). Kahraman da sayılır: hücumda
   * Kuzey'in okçuları Güney kahramanını da hedefler. Başka şeritteki düşman hiç bakılmaz — "salça olmama"
   * kuralı tam burada işler.
   */
  function seritDusmani(e, menzil) {
    let iyi = null, en = menzil;
    const cephe = cepheSiniri(e);
    for (const o of world.entities) {
      if (!o.alive || o.faction === e.faction) continue;
      // Şerit birimin **bölüğünden** gelir, o anki yerinden değil: dövüşün itmesiyle şeridinin dışına savrulan
      // bir asker hedeflenemez hâle gelseydi (önceki sürümde olduğu gibi) sahada ölmeyen artıklar kalırdı.
      if (o.serit !== e.serit) continue;
      // Sahanın dışına savrulmuş düşman kovalanmaz (bkz. config `saha`): kovalamaca sahneyi haritanın ucuna
      // kadar sürüklerdi.
      if (sahaDisi(o.pos)) continue;
      // Cephe sınırının ötesindeki düşman hedeflenmez: birim duvara dayanıp ulaşamayacağı bir hedefe
      // kilitlenmesin (bkz. config `cephe`).
      if (cephe && (bOf(o.pos) < cephe.alt - K.hedef.cephePayi || bOf(o.pos) > cephe.ust + K.hedef.cephePayi)) continue;
      const d = Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z);
      if (d < en) { en = d; iyi = o; }
    }
    return iyi;
  }

  /**
   * Hedefleri tazeler (her `hedef.tazele` saniyede bir). Uyanmış her birime kendi şeridindeki en yakın düşman
   * `attack` emri olarak verilir; şeridinde düşman kalmayan birim emirsiz bırakılır ve yuvasına döner.
   *
   * Emirsiz birim ai.js'te `updateAggressive`e düşer: görüşündeki (10 birim) düşmanla savaşır, yoksa yuvasına
   * yürür. O yolda şeridini terk etmemesi için **karşılık belleği de silinir** (`lastHitBy` / `alarmBy`):
   * yoksa uzaktan vurulan bir asker ARMY.retaliateRange (40 birim) ötesindeki okçunun üstüne yürürdü.
   */
  function hedefleriTazele() {
    for (const e of birimler()) {
      if (!e.brain || e.isSiege) continue;
      // Sahanın dışına savrulmuş birim önce sahaya döner: dövüşü sahnenin içinde sürdürsün.
      const h = sahaDisi(e.pos) ? null : seritDusmani(e, e.hedefMenzil);
      if (h) {
        const o = e.brain.order;
        if (!(o && o.kind === 'attack' && o.target === h)) {
          e.brain.order = { kind: 'attack', target: h };
          e.brain.target = h; e.brain.retarget = 0;
        }
      } else {
        // Şeridinde hedef kalmayan birim **durduğu yeri tutar** (yuvasına geri yürümez): 11-15 sn arasındaki
        // soluklanmada Kuzey kanatları geri çekilseydi, 15'teki darbeyle kılıçlıların üstüne yürümeye baştan
        // başlar ve müziğin 19. saniyesine yetişemezlerdi. Tutulan yer yine de **şeride çekilir**: dövüşün
        // itmesiyle merkeze doğru kaymış asker, boşlukta öylece merkezde kalmasın.
        e.brain.order = null; e.brain.target = null; e.brain.fightAt = null;
        e.brain.home = seridePark(e);
        e.lastHitBy = null; e.alarmBy = null;
      }
    }
  }

  /** Bölükleri `uyanma` işaretine gelince uyandırır: beyin takılır, birim oyunun yapay zekâsına girer. */
  function uyandir(e) {
    if (e.brain) return;
    e.brain = { mode: 'march', timer: 0, target: null, retarget: 0, home: e.yuva, order: null };
  }

  function uyanmalar(once) {
    const gecti = (t) => once < t && sahne.saniye >= t;
    for (const ad of UYANMA_ISARETLERI) {
      if (!gecti(K.isaret[ad])) continue;
      for (const e of birimler()) if (e.uyanma === ad && !e.akinci) uyandir(e);
    }
    // Kuzey'in okçuları saniyeye değil **mesafeye** bakar: hücum `hucum.okcuUyan` birime yaklaşınca uyanırlar
    // ve dörtnala gelen atlılara ok yağdırırlar. Daha erken uyansalardı (mancınık taşı yiyerek) mancınıkların
    // üstüne yürür, merkez daha nida gelmeden dağılırdı.
    if (sahne.saniye >= K.isaret.nida) {
      const on = akininOnu();
      if (on) for (const e of birimler()) {
        if (e.uyanma !== 'hucumda' || e.brain) continue;
        if (Math.hypot(on.pos.x - e.pos.x, on.pos.z - e.pos.z) <= K.hucum.okcuUyan) uyandir(e);
      }
    }
  }

  /**
   * Şeridinden çıkan birim sayısı (disiplin ölçüsü; yalnız ölçüm, davranışa karışmaz). Bozgunda ölçülmez:
   * kaçan ordunun dağılarak yanlara açılması zaten istenen davranıştır.
   */
  function disiplinOlc() {
    if (sahne.kacis) return;
    let n = 0;
    for (const e of birimler()) {
      if (e.serit === 'merkez') continue;
      const a = Math.abs(aOf(e.pos));
      if (a < sahne.enIcerdeki) sahne.enIcerdeki = a;
      // Koridor duvarı birimi tam sınıra (|a| = serit.yari) yaslayabilir; sınırda durmak kaçak değildir,
      // bu yüzden yarım birimlik pay bırakılır.
      if (a < K.serit.yari - 0.5) n++;
    }
    if (n > sahne.seritKacagi) sahne.seritKacagi = n;
  }

  // ---- Mancınıklar

  const mancinikListesi = () => taraflar.guney.birimler.filter(e => e.alive && e.isSiege);

  /**
   * Güney mancınıkları. Sahne yalnız **ne zaman ve kime** nişan alındığını söyler: taşın kendisi, uçuşu,
   * isabeti ve hasarı oyunun kendi kurallarıdır (combat.js `startAttack` → `shootArrow` → `updateArrows` →
   * `damageEntity`; mancınık menzili 36, hasarı 40, beklemesi 2.2 sn).
   *
   * İki pencerede atarlar (bkz. config `mancinik.pencere`): açılışta uzaktan (karamsar giriş) ve hücumda
   * arkadan yetişerek. Arada susarlar — kanat savaşı boyunca durmadan atsalardı Kuzey'in okçu hattını
   * 19. saniyeden önce eritirlerdi ve hücumun çiğneyeceği bir hedef kalmazdı.
   * Hücumda kendi hızlarıyla (SIEGE.speed 2.4) kuzeye yürürler: "arkadan yetişen mancınıklar".
   */
  function mancinikSur(dt) {
    const acik = K.mancinik.pencere.some(([a, b]) => sahne.saniye >= a && sahne.saniye <= b);
    const yuruyor = sahne.saniye >= K.isaret.marsBaslar && sahne.mancinikYol < K.mancinik.ilerleme;
    if (yuruyor) sahne.mancinikYol += SIEGE.speed * dt;
    for (const e of mancinikListesi()) {
      if (yuruyor) {
        e.moveDir.set(kanat.x, 0, kanat.z);
        e.facing = yawFromDir(kanat.x, kanat.z);
      } else e.moveDir.set(0, 0, 0);
      if (!acik) continue;
      const h = seritDusmani(e, e.stats.weapon.range);
      if (!h) continue;
      e.aim.copy(h.pos);
      e.facing = yawFromDir(h.pos.x - e.pos.x, h.pos.z - e.pos.z);
      // `startAttack` beklemesi dolmamışsa atmaz (canAttack): sayaç oyunun kendi sayacıdır.
      if (startAttack(e)) sahne.tas++;
    }
  }

  // ---- Hücum

  /** Hücumun en önündeki (en kuzeydeki) yaşayan atlı. */
  function akininOnu() {
    let iyi = null, ileri = -Infinity;
    for (const e of taraflar.guney.birimler) {
      if (!e.alive || !e.akinci) continue;
      const b = bOf(e.pos);
      if (b > ileri) { ileri = b; iyi = e; }
    }
    return iyi;
  }

  /**
   * Hücum: Güney'in Mızrak Kalkan Atlıları mancınıkları geçip Kuzey merkezine dörtnala koşar. Yolu sahne
   * sürer — yön **dümdüz kuzeydir** (`kanat`), hız **oyunun kendi koşusudur** (`e.sprinting` ile SPRINT_MULT
   * 1.65: 3.8 x 1.7 x 0.8 x 1.65 = 8.53 birim/sn, bkz. physics.js). Düz koşu bilinçli: atlılar tek bir hedefe
   * yönlendirildiğinde sütun bir noktada sıkışıp birbirini kilitliyor ve hücum yarı hıza düşüyordu; düz hat
   * hem cepheyi geniş tutar hem de varış anını `isaret.carpisma`ya kilitlenebilir kılar.
   * Kendi şeridinde `hucum.temas` birim yakınında düşman beliren atlı **oyunun yapay zekâsına devredilir**:
   * beyni takılır, bundan sonra hedef seçimi (şeridiyle sınırlı), vuruş, hasar ve karşılık normal oyundaki gibi
   * işler — okçuları çiğneyip geçen atlıların dövüşü oyunun kendi dövüşüdür.
   */
  function hucumuSur() {
    for (const e of taraflar.guney.birimler) {
      if (!e.alive || !e.akinci || e.brain) continue;
      const h = seritDusmani(e, K.hucum.temas);
      if (h) { uyandir(e); e.moveDir.set(0, 0, 0); e.sprinting = false; continue; }
      e.sprinting = K.hucum.sprint;
      e.moveDir.set(kanat.x, 0, kanat.z);
      e.facing = yawFromDir(kanat.x, kanat.z);
    }
    if (!sahne.carpisma) {
      const on = akininOnu();
      if (on && bOf(on.pos) >= OKCU_HATTI - K.hucum.temas) sahne.carpisma = sahne.saniye;
    }
  }

  // ---- Kahraman girdileri

  /**
   * Kahramanların bu karedeki girdisi. İkisi de **oyunun kendi kahraman sistemidir** (hero.js
   * `applyHeroInput`): yürüme, nişan, vuruş, bekleme süresi, seviye etkileri hep oyunun kuralları — sahne
   * yalnız "nereye git, nereye nişan al, ne zaman vur" der.
   *  - **Güney** (sv 100, Mızrak Kalkan Atlısı): nidaya kadar bekler, sonra hücumun önünde Kuzey kahramanına
   *    koşar ve menzile girince durmadan vurur.
   *  - **Kuzey** (sv 1, okçu): nidaya kadar okçularının arasında durur, nidayla birlikte kendi okçularının
   *    **arkasına kaçar** (`kahraman.kuzey.kacis`) ve orada sıkışır; kaçarken Güney kahramanına nişan alıp
   *    ok atar — kaçarken arkasına ok atan bir okçu.
   */
  function kahramanGirdisi() {
    const kz = taraflar.kuzey, gy = taraflar.guney;
    const K1 = kz.kahraman, G1 = gy.kahraman;
    const ik = kz.oyuncu.input, ig = gy.oyuncu.input;
    const basladi = sahne.saniye >= K.isaret.nida;

    // Güney kahramanı
    ig.ha = true; ig.dm = false; ig.ly = false;
    ig.aim[0] = K1.pos.x; ig.aim[1] = K1.pos.z;
    if (!basladi || !K1.alive) { ig.mv[0] = 0; ig.mv[1] = 0; ig.sp = false; } else {
      const dx = K1.pos.x - G1.pos.x, dz = K1.pos.z - G1.pos.z, d = Math.hypot(dx, dz) || 1;
      const yakin = d <= K.hucum.temas + G1.radius + K1.radius;
      ig.mv[0] = yakin ? 0 : dx / d; ig.mv[1] = yakin ? 0 : dz / d;
      // Koşu (`sp`, SPRINT_MULT 1.65) hücum **Kuzey okçu hattına varana kadar kapalıdır**: kahramanın kendi
      // hızı (6.2 x 1.7 x 0.8 = 8.43) atlılarınkine (koşuyla 8.53) zaten denktir, koşsaydı sütunu 4 saniye
      // geride bırakıp okçuların arasına tek başına dalardı. Atlılar hatta varınca koşuyu açar ve kalan
      // mesafeyi kapatarak Kuzey kahramanına yetişir — "atlılarla kahramanın arasında kalıp ölür".
      ig.sp = !yakin && Boolean(sahne.carpisma);
      ig.aq = true;
    }

    // Kuzey kahramanı
    ik.ha = true; ik.dm = false; ik.ly = false; ik.sp = false;
    ik.aim[0] = G1.pos.x; ik.aim[1] = G1.pos.z;
    const kacis = K.kahraman.kuzey.kacis;
    const b = bOf(K1.pos);
    if (basladi && b < kacis) {
      // Kuzeye kaç: okçu hattının arkasına. Varınca durur (sıkışır) ve ok atmaya devam eder.
      ik.mv[0] = kanat.x; ik.mv[1] = kanat.z; ik.sp = true;
    } else { ik.mv[0] = 0; ik.mv[1] = 0; }
    if (basladi) ik.aq = true;
  }

  /**
   * Kuzey kahramanının **ölüm anı müziğe kilitlidir**. Atlıların ve seviye 100 kahramanın arasında kalan
   * seviye 1 kahraman kendi hâline bırakılsa 24. saniyede düşerdi: marş daha yeni başlamışken bozgun kopar
   * ve videonun en güçlü üç saniyesi boşa giderdi. Bu yüzden canı `isaret.kahramanOlur`a kadar her karede
   * tazelenir (`?gosteri=savas` kahramanlarında da aynı kural var) — vurulur, kanar, sendeler ama düşmez.
   * İşaret gelince tazeleme biter ve sahne onu Güney kahramanının vuruşuyla düşürür: öldüren yine oyunun
   * kendi `damageEntity`sidir, yalnız **anı** müziğe oturtulmuştur. Dövüşün başka hiçbir sayısına karışılmaz.
   */
  function kahramanKalkani() {
    if (!K.kahramanKalkani) return;
    const p = taraflar.kuzey.kahraman, g = taraflar.guney.kahraman;
    if (sahne.saniye < K.isaret.kahramanOlur) {
      // Ölmüş olsa bile ayağa kalkar: `world.onDeath` boş olduğu için ölümün başka bir yan etkisi yoktur.
      if (!p.alive) { p.alive = true; p.deathTimer = 0; p.stun = 0; world.fx.refreshEntity(p); }
      p.hp = p.stats.maxHp;
      return;
    }
    if (!p.alive || p.hp <= 0) return;
    const dx = p.pos.x - g.pos.x, dz = p.pos.z - g.pos.z, d = Math.hypot(dx, dz) || 1;
    damageEntity(world, p, p.hp, dx / d, dz / d, 0, g);
  }

  // ---- Bozgun

  /**
   * **Bozgun** (oyunda yoktur, sahneye özeldir): Kuzey kahramanı düşünce bütün Kuzey ordusu beynini bırakır,
   * dönüp kuzeye ve dışa kaçar. Yön `kanat` artı birimin kendi `eksen` yerine göre dışa açılan bir paydır:
   * ordu tek sütun hâlinde değil **dağılarak** boşalır. Koşu oyunun kendi koşusudur (`sprinting`, SPRINT_MULT
   * 1.65) ve üstüne bir kez `bozgun.hiz` çarpanı biner — can havliyle kaçan bir ordu düzenli yürüyüşten
   * hızlıdır, üstelik videoda bozguna yalnız 2.6 saniye vardır (27 → `isaret.kapanis`). Kadrajın üstünü
   * (`bozgun.sil`) geçen birim sahadan kaldırılır.
   */
  function bozgunuSur() {
    const kz = taraflar.kuzey;
    for (let i = kz.birimler.length - 1; i >= 0; i--) {
      const e = kz.birimler[i];
      if (!e.alive) continue;
      e.brain = null;
      if (!e.kaciyor) { e.kaciyor = true; e.stats.speed *= K.bozgun.hiz; }
      const a = aOf(e.pos), b = bOf(e.pos);
      if (b > K.bozgun.sil) {
        world.fx.removeEntity(e);
        const j = world.entities.indexOf(e);
        if (j >= 0) world.entities.splice(j, 1);
        kz.birimler.splice(i, 1);
        continue;
      }
      const yan = Math.sign(a || 1) * K.bozgun.yan;
      const dx = kanat.x + eksen.x * yan, dz = kanat.z + eksen.z * yan, l = Math.hypot(dx, dz) || 1;
      e.moveDir.set(dx / l, 0, dz / l);
      e.sprinting = true;
      e.facing = yawFromDir(dx / l, dz / l);
    }
  }

  /**
   * Kapanış karesinin (oyun görüntüsünün son karesi, `isaret.kapanis`) bozgun ölçüsü: kadrajda kalan Kuzey
   * birimi sayısı ve **hepsinin kuzeye kaçıp kaçmadığı**. Kanat bölükleri 19. saniyede Güney'in kılıçlılarını
   * ezmek için sahanın ta güneyine inmiş olur (b ≈ -20); kahraman 27'de düştüğünde kadrajın üstüne 50 birim
   * yolları kalır, yani 2.6 saniyede hepsinin ekranı terk etmesi fizik olarak mümkün değildir. İstenen şey
   * **bozgunun kendisidir**: o karede sahada dövüşen tek bir Kuzey birimi kalmaz, hepsi sırtını dönüp kuzeye
   * koşar ve merkez tamamen boşalır.
   */
  function kapanisOlc() {
    if (sahne.kuzeyKalan >= 0 || sahne.saniye < K.isaret.kapanis) return;
    const sag = taraflar.kuzey.birimler.filter(e => e.alive);
    sahne.kuzeyKalan = sag.filter(e => bOf(e.pos) < KADRAJ_UST).length;
    sahne.kuzeyMerkez = sag.filter(e => e.serit === 'merkez').length;
    sahne.hepsiKaciyor = sag.every(e => e.moveDir.x * kanat.x + e.moveDir.z * kanat.z > 0.5);
  }

  // ---- Evreler

  /**
   * Kanat savaşının durumu. Yusuf'un isteği gereği (bkz. config `kanatDayanim`) **burada kimse tükenmemeli**: ölçüler
   * "kaç kişi kaldı"yı değil "savaş sürüyor mu"yu söyler.
   *  `kuzey` / `guney` iki tarafın ayakta kanat askeri · `emirli` saldırı emri almış kanat askeri ·
   *  `dovusen` **gerçekten vuruşabilecek** kadar yakın olanlar (bkz. `temasta`) · `guneyCephe` Güney'in kanat
   *  askerlerinin **ortalama** `kanat` yeri: Kuzey bastırdıkça güneye kayar, "kanatları baskı altına almış"
   *  görüntüsünün sayısal karşılığı budur.
   */
  const kanatSavasi = () => {
    let kuzey = 0, guney = 0, emirli = 0, dovusen = 0, gb = 0;
    for (const t of Object.values(taraflar)) for (const e of t.birimler) {
      if (!e.alive || e.serit === 'merkez') continue;
      if (t.ad === 'kuzey') kuzey++; else { guney++; gb += bOf(e.pos); }
      if (e.brain && e.brain.order && e.brain.order.kind === 'attack') { emirli++; if (temasta(e)) dovusen++; }
    }
    return { kuzey, guney, emirli, dovusen, guneyCephe: guney ? +(gb / guney).toFixed(1) : 0 };
  };

  /**
   * Birim hedefiyle **temasta** mı: saldırı emrinin hedefi yaşıyor ve ai.js'in vuruş açtığı mesafenin
   * (`engage`: menzilli için yay erimi, piyade için `range` + hedefin yarıçapı) içinde. "Emir aldı" demek
   * dövüşüyor demek değildir — emri yeni almış, hedefine daha yürüyen bir asker de emirlidir; bu ölçü
   * kanatların nida anında gerçekten birbirine değdiğini söyler.
   */
  function temasta(e) {
    const h = e.brain && e.brain.order && e.brain.order.target;
    if (!h || !h.alive) return false;
    const w = e.stats.weapon, d = Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z);
    return d <= (w.ranged ? w.range : w.range + (h.radius || 0));
  }

  function olcumler() {
    const k = kanatSavasi();
    // Kanat savaşının **en zayıf anı**: iki taraftan hangisi en aza düştüyse o. Kabul ölçütü buna bakar —
    // kanatların tükenmediğini kanıtlayan sayı budur. Yalnız **bozgundan önce** ölçülür: bozgunda Kuzey'in
    // kanat bölükleri dağılıp kadrajın dışına koşar ve sahadan kaldırılır (bkz. `bozgunuSur`), o azalma
    // senaryonun kendisidir — kanat savaşının tükenmesi değil.
    if (!sahne.kacis) {
      if (k.kuzey < sahne.kanatEnAz.kuzey) sahne.kanatEnAz.kuzey = k.kuzey;
      if (k.guney < sahne.kanatEnAz.guney) sahne.kanatEnAz.guney = k.guney;
    }
    // Güney kanadının en güneye itildiği yer: Kuzey'in baskısının ölçüsü.
    if (k.guney && k.guneyCephe < sahne.guneyCepheEnAz) sahne.guneyCepheEnAz = k.guneyCephe;
    // Nida anında (hücum kalkarken) kanatlarda hâlâ dövüşen asker var mı: senaryonun can alıcı noktası.
    if (!sahne.nidaKanat && sahne.saniye >= K.isaret.nida) sahne.nidaKanat = { ...k };
    // Güney kahramanının Kuzey kahramanına **gerçekten yetiştiği** an ve tur boyunca aralarındaki en kısa
    // mesafe. `kahramanOlum` kalkan yüzünden (bkz. `kahramanKalkani`) hep işaretine oturur; bu iki ölçü
    // kalkandan bağımsızdır: hücum merkezi gerçekten kat etti mi, onu söyler.
    const p = taraflar.kuzey.kahraman, g2 = taraflar.guney.kahraman;
    if (p.alive && g2.alive) {
      const d = Math.hypot(p.pos.x - g2.pos.x, p.pos.z - g2.pos.z);
      if (d < sahne.kahramanAra) sahne.kahramanAra = d;
      if (!sahne.kahramanYetisti && d <= K.kahramanYetisme) sahne.kahramanYetisti = sahne.saniye;
    }
    if (!sahne.kahramanOlum && !taraflar.kuzey.kahraman.alive) { sahne.kahramanOlum = sahne.saniye; sahne.kacis = true; }
  }

  function evreler() {
    const t = sahne.saniye;
    sahne.evre = sahne.kacis ? 'bozgun'
      : t < K.isaret.kanatlar ? 'dizilis'
        : t < K.isaret.enKotu ? 'kanatlar'
          : t < K.isaret.nida ? 'ezme' : 'hucum';
    hedefKadraj = sahne.evre === 'hucum' || sahne.evre === 'bozgun' ? K.kamera.hucum : K.kamera.genis;
    if (t >= K.isaret.son + K.tekrar) diz();
  }

  // ---- Kare

  /** Her kare: uyanmalar, şerit hedefleri, mancınıklar, hücum, kahraman girdileri, simülasyon, evreler, kamera. */
  function guncelle(dt) {
    // `paused` da denetlenir: görüntü bağlamı düşünce (telefonda görüntü belleği dolunca) oyun durur, sahne de
    // durmalı — yoksa ekran donmuşken simülasyon koşmaya devam eder (bkz. main.js webglcontextlost).
    if (!sahne || !world.running || world.paused) return;
    const once = sahne.saniye;
    sahne.saniye += dt;

    uyanmalar(once);
    sahne.tazele -= dt;
    if (sahne.tazele <= 0) { sahne.tazele = K.hedef.tazele; hedefleriTazele(); }
    mancinikSur(dt);
    // Hücum **nidayla** kalkar (19.0), marşla değil: "Ya Allah!" nidası Güney merkezinin ayağa kalktığı
    // andır, marş (19.74) o sırada çoktan dörtnala geçmiş sütunun üstüne biner.
    if (sahne.saniye >= K.isaret.nida) hucumuSur();
    kahramanGirdisi();
    if (sahne.kacis) bozgunuSur();

    step(world, dt);

    sahayaSigdir();
    kahramanKalkani();
    olcumler();
    disiplinOlc();
    kapanisOlc();
    evreler();
    odakTazele();
  }

  // ---- Kamera

  /**
   * Kameranın bakacağı yer (`a` ekranın yatayı, `b` dikeyi): evreye göre config `kamera.odak`tan okunur ve
   * `odakYumusatma` ile çok yavaş kayar. Kamera **kahramanı izlemez**: diziliş ve kanat savaşı boyunca sahnenin
   * ortasına bakar, hücumda merkeze doğru hafifçe kuzeye kayar, bozgunda biraz daha kuzeye.
   */
  function odakTazele() {
    const O = K.kamera.odak;
    const { a, b } = O[sahne.evre] || O.kanatlar;
    hedefOdak.set(noktaX(a, b), 0, noktaZ(a, b));
  }

  function odak(dt) {
    if (!sahne) return odakNokta;
    if (yapis) { odakNokta.copy(hedefOdak); yapis = false; }
    else if (dt > 0) odakNokta.lerp(hedefOdak, 1 - Math.exp(-dt * K.kamera.odakYumusatma));
    return odakNokta;
  }

  /** Kameranın odağa uzaklığı: oyunun izometrik yönü (24, 29, 24) `uzaklik` ile ölçeklenir. */
  const kameraUzakligi = () => Math.hypot(24, 29, 24) * K.kamera.uzaklik;

  /**
   * İzometrik kamerayı yerleştirir: oyunun kendi 45° bakışı korunur, yalnız geriye çekilir ve dikey yarı
   * kadraj (`kadraj`) sahneden gelir. 1080x1920'de dikeyde ±`kadraj`/0.6496, yatayda ±0.5625x`kadraj` birim
   * görünür — iki ordu da, iki kanat da aynı anda kadrajdadır.
   */
  function bakisIzo(dt, camera, look, en) {
    const k = dt > 0 ? 1 - Math.exp(-dt * K.kamera.yumusatma) : 1;
    kadraj += (hedefKadraj - kadraj) * k;
    camera.left = -kadraj * en; camera.right = kadraj * en; camera.top = kadraj; camera.bottom = -kadraj;
    const u = K.kamera.uzaklik;
    camera.near = 1; camera.far = kameraUzakligi() + 400;
    camera.updateProjectionMatrix();
    camera.position.set(look.x + 24 * u, 29 * u, look.z + 24 * u);
    camera.lookAt(look.x, 0, look.z);
  }

  /** Kadraj elemesi (main.js görüş sınırı yerine): odaktan `gorus` birimden uzaktaki ağaç / eşya çizilmez. */
  const gorus = () => (x, z, pad = 0) => (x - odakNokta.x) ** 2 + (z - odakNokta.z) ** 2 <= (K.gorus + pad) ** 2;

  /** Bir tarafın ayakta birim sayısı, şerit şerit. */
  const sayim = (ad) => {
    const out = { sol: 0, merkez: 0, sag: 0 };
    for (const e of taraflar[ad].birimler) if (e.alive) out[e.serit]++;
    return out;
  };

  /** Sahnenin durumu (yalnız okuma; dumanı testi, çekim betiği ve hata ayıklama için). */
  const durum = () => (!sahne ? { evre: null, tur: 0, saniye: 0 } : {
    evre: sahne.evre, tur, saniye: +sahne.saniye.toFixed(2), kadraj: Math.round(kadraj),
    kuzey: sayim('kuzey'), guney: sayim('guney'), kanatSavasi: kanatSavasi(),
    kahraman: {
      kuzey: { sv: taraflar.kuzey.kahraman.level, can: Math.round(taraflar.kuzey.kahraman.hp), sag: taraflar.kuzey.kahraman.alive, b: +bOf(taraflar.kuzey.kahraman.pos).toFixed(1) },
      guney: { sv: taraflar.guney.kahraman.level, can: Math.round(taraflar.guney.kahraman.hp), sag: taraflar.guney.kahraman.alive, b: +bOf(taraflar.guney.kahraman.pos).toFixed(1) },
    },
    /** Hücumun önündeki atlının `kanat` üstündeki yeri (başta -23, Kuzey okçularına varınca ~+12). */
    akinOn: +(() => { const e = akininOnu(); return e ? bOf(e.pos) : 0; })().toFixed(1),
    akinDovusen: taraflar.guney.birimler.filter(e => e.alive && e.akinci && e.brain).length,
    /** Şeridinden çıkan birimlerin tur boyunca görülen en yükseği: "kanatlar merkeze salça olmasın" ölçüsü. */
    seritKacagi: sahne.seritKacagi, enIcerdeki: +sahne.enIcerdeki.toFixed(1),
    mancinik: taraflar.guney.birimler.filter(e => e.alive && e.isSiege).length,
    ucanOk: world.arrows.length, tas: sahne.tas,
    /** Ölçülen anlar (sahne saati, sn): video kesiti ve müziğin vuruşları bunlara göre denetlenir. */
    /** Kanat savaşı: tur boyunca iki tarafın en aza düştüğü sayı, Güney'in en güneye itildiği yer ve nida anındaki durum. */
    kanatEnAz: sahne.kanatEnAz.kuzey > 1e8 ? null : sahne.kanatEnAz,
    guneyCepheEnAz: sahne.guneyCepheEnAz > 1e8 ? null : +sahne.guneyCepheEnAz.toFixed(1),
    nidaKanat: sahne.nidaKanat,
    carpisma: +sahne.carpisma.toFixed(2), kahramanOlum: +sahne.kahramanOlum.toFixed(2),
    /** Güney kahramanının Kuzey kahramanına vuruş erimine girdiği an ve tur boyunca aralarındaki en kısa
     *  mesafe: kalkandan bağımsız, gerçek ölçüler. */
    kahramanYetisti: +sahne.kahramanYetisti.toFixed(2), kahramanAra: +sahne.kahramanAra.toFixed(2),
    /** Kapanış karesinde kadrajda kalan Kuzey birimi (-1 = kapanışa gelinmedi): bozgunun ölçüsü. */
    kuzeyKalan: sahne.kuzeyKalan, kuzeyMerkezKalan: sahne.kuzeyMerkez, hepsiKaciyor: sahne.hepsiKaciyor,
    yapi: world.structures.length,
    /**
     * Sahanın içinde kalan altın madeni: hepsi sıfır olmalı (Yusuf: "altın madenleri olmasın"). `engel` ve
     * `dugum` dünyanın verisi, `cizim` çizim listesi, `sahnede` ise **gerçekten ekrandaki** sahne: liste
     * temizlendiği hâlde eski görünüm ayakta kalsaydı (bkz. main.js envView yeniden kurulumu) yalnız liste
     * sayan bir ölçü bunu kaçırırdı. Maden kayaları sahnedeki tek `DodecahedronGeometry`dir (environment.js).
     */
    maden: {
      engel: world.obstacles.filter(o => o.kind === 'gold' && !sahaDisi(o.pos, K.maden.pay)).length,
      dugum: (world.nodes || []).filter(n => n.kind === 'gold' && !sahaDisi(n.pos, K.maden.pay)).length,
      cizim: ((world.env && world.env.decor && world.env.decor.mines) || []).filter(m => !sahaDisi(m, K.maden.pay)).length,
      sahnede: madenKayalari(),
    },
  });
  world.gosteriDurum = durum;
  // Çekim betiği (ajanlar/icerik/short-uret.mjs) sahnenin saatini buradan okur: her kare hangi saniyede
  // olduğumuz bilinir, yani görüntü müziğin vuruşlarıyla kare kare eşleşir.
  if (typeof window !== 'undefined') Object.defineProperty(window, '__gosteri', { configurable: true, get: durum });

  return { izometrik: true, kalite: K.kalite, basla, guncelle, odak, bakisIzo, gorus, durum };
}
