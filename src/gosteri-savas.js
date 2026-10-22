import * as T from 'three';
import { yawFromDir } from './builders.js';
import { applyLevelUp, createEntity, makeStats } from './characters.js';
import { COMBAT, GOSTERI_SAVAS as K } from './config.js';
import { t } from './dil.js';
import { applyImpulse } from './physics.js';
import { removeStructure } from './structures.js';
import { touchDevice } from './touch.js';
import { createOrduCizim } from './view/ordu.js';
import { setupGame, step } from './world.js';

/**
 * **İki ordu gösterisi** (`?gosteri=savas`, yalnız tarayıcıda): içerik videosu için sahnelenmiş, her turda sıfırlanıp
 * tekrarlanan tek bir sahne. `?gosteri=1` (bot-bot maç) ve `?gosteri=kahraman` (tek kahraman + kalabalık) bu
 * dosyadan hiç etkilenmez; normal oyun da öyle.
 *
 * Sahnenin akışı (bir tur ~14 sn, bkz. config GOSTERI_SAVAS.evre):
 *  1. **hazir** — 1000'er kişilik iki ordu haritanın iki ucunda, 50 sütunluk (100 birimlik) geniş cephe hâlinde
 *     karşılıklı dizilidir. Kamera tepeden izometrik ve geniştir: cephe ekranın dikeyinde baştan başa taşar.
 *  2. **hucum** — iki ordu birbirine koşar. Her asker tek tek sürülür ama **ai.js değil**, bu dosyadaki ucuz ordu
 *     beyni (bkz. `orduBeyni`): hedef arama ızgaralıdır ve her karede ordunun yalnız dörtte biri yeni hedef arar.
 *  3. **ziplama** — cepheler `evre.temas` birime yaklaşınca iki tarafın **Kılıçlı Atlı** kahramanı kendi ordusunun
 *     içinden zıplar (oyunda Boşluk), tepede bir daha zıplar ve alçalırken rakibine doğru **atılır** (sağ tık:
 *     atılma + kılıç fırtınası + vakum). Bu an kısa bir ağır çekimdir.
 *  4. **dovus** — kahramanlar ortada buluşur ve `betik`teki sırayla peş peşe vurur: iki kılıç vuruşu (360°), bir
 *     şarjlı **şok dalgası** (üç dalga, son dalga üç kat iter), yeni bir atılma, iki vuruş daha, bir dalga daha.
 *     Kamera hafifçe yaklaşır ama ordular kadrajda kalır.
 *  5. **savas** — kamera geri çekilir, iki ordu cepheyi doldurur, kahramanlar dövüşmeyi sürdürür.
 *  6. **bitis** — sahne yeniden kurulur; her turda diziliş, ordu merkezlerinin yan kayması ve askerlerin boyu
 *     değişir, yani art arda çekilen turlar birbirinin kopyası olmaz.
 *
 * **1000'er birim nasıl 60 fps koşuyor?** İki yerden:
 *  - **Çizim**: askerlerin oyundaki normal görünümü (asker başına ~15 mesh) hiç kurulmaz — `e.view` null kalır ve
 *    main.js o birimleri atlar. Ordular taraf başına **tek bir InstancedMesh** ile çizilir (bkz. view/ordu.js),
 *    yani 2000 asker toplam 2 çizim çağrısıdır.
 *  - **Simülasyon**: askerlerin `brain`i yoktur, yani ai.js hiç koşmaz (findTarget her birim için bütün sahayı
 *    tarar). Hedef arama ızgaralı ve dilimlidir, vuruş çözümü de bu dosyadadır: combat.js'in `resolveSwing`i
 *    (vuruş başına bütün sahayı tarar) yerine doğrudan hedefe hasar yazılır.
 * Kahramanlar ise **oyunun kendi sistemleridir**: girdileri hero.js applyHeroInput'tan geçer, zıplama, atılma,
 * kılıç fırtınası, vakum ve şok dalgası oyundakinin birebir aynısıdır.
 *
 * Ölen asker cesedi yere gömülünce ordusunun gerisinde yeniden doğar (bkz. `takviye`): cephe incelmez ve
 * **varlık sayısı sabit kalır** — hiçbir karede yüzlerce görünüm kurulup yıkılmaz, tur geçişi de takılmaz.
 *
 * Arayüzün gizlenmesi, girdinin okunmaması, ölçümün gitmemesi ve sunucuya bağlanılmaması `?gosteri=1` ile
 * ortaktır (bkz. main.js, style.css `.gosteri`).
 */
export function createSavasGosteri(world, { arenaReady }) {
  world.gosteri = true;
  const odakNokta = new T.Vector3(), hedefOdak = new T.Vector3();
  /** Hücum ekseni (ekranın yatayı) ve ona dik cephe ekseni. */
  const eksen = { x: K.eksen.x, z: K.eksen.z }, dik = { x: -K.eksen.z, z: K.eksen.x };
  /**
   * Taraflar. `yon` ordunun hücum yönüdür (eksen çarpanı): mavi eksende ileri (+1), kızıl geri (-1) koşar, yani
   * mavi ekranın solundan, kızıl sağından gelir. `merkez` ordunun eksen üstündeki ağırlık merkezi (her karede
   * yeniden hesaplanır), `kayma` turun rastgele yan kaymasıdır.
   */
  const taraflar = [
    { faction: 'blue', yon: 1, liste: [], cizim: null, merkez: -K.baslangic, kayma: 0, kahraman: null, oyuncu: null },
    { faction: 'red', yon: -1, liste: [], cizim: null, merkez: K.baslangic, kayma: 0, kahraman: null, oyuncu: null },
  ];
  /** Taraf başına asker: masaüstünde tam kadro, dokunmatikte azı (telefonda sahne yalnız çökmeden açılsın). */
  const orduSayisi = touchDevice() ? K.ordu.telefon : K.ordu.sayi;
  const sira = Math.ceil(orduSayisi / K.ordu.sutun);
  const derinlik = sira * K.ordu.sira;
  let sahne = null, agir = 0, tur = 0, yapis = true, kadraj = K.kamera.genis, hedefKadraj = K.kamera.genis;
  /** Hedef arama ızgarası: havuzdan hücre alınır, kare başına yeni dizi yaratılmaz (bkz. physics.js aynı kalıp). */
  const gozHavuz = [], gozHarita = new Map();
  let gozSayi = 0, dilim = 0;

  // ---- Kuruluş

  /** Bir kez: dünya kurulur, sahne dışında kalan her şey (yapı, kamp, haydut, ganimet) sahadan kalkar. */
  function basla() {
    setupGame(world, {
      // İki koltuk da "insan": hiçbir bot yapay zekâsı koşmaz (bkz. economy.js updateBots) ve iki kahraman da
      // yalnız girdiyle hareket eder — ikisinin de girdisini bu sahne kurar.
      teamSize: 1, humans: [{ name: t('oyuncu.mavi') }, { name: t('oyuncu.kizil'), faction: 'red' }],
      loadout: { ...K.kahraman.loadout }, seed: 1000 + Math.floor(Math.random() * 900000),
    });
    world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
    world.onEnd = null;
    // Gösteri birimleri yere ganimet / exp küresi bırakmaz ve karneye yazılmaz: binlerce ölüm sahayı doldururdu.
    world.onDeath = () => {};
    // Haydut ve kamp yok; yapılar da yok: kuleler kadrajdaki orduyu ok yağmuruna tutardı (ve her kule her tikte
    // bütün sahayı tarar), sancak / kışla da bomboş bir savaş meydanında gereksiz.
    world.camps.length = 0; world.banditTimer = Infinity;
    for (let i = world.structures.length - 1; i >= 0; i--) removeStructure(world, world.structures[i]);
    // Kamp yaratıkları (initCamps) ve başka ne doğduysa sahadan kalkar: ikisi de yapay zekâ koşturur ve
    // `findTarget` her tikte bütün sahayı — yani 2000 askeri — tarardı. Sahada yalnız iki kahraman kalır.
    for (let i = world.entities.length - 1; i >= 0; i--) {
      const e = world.entities[i];
      if (e.isPlayer) continue;
      world.fx.removeEntity(e); world.entities.splice(i, 1);
    }
    // Savaş sisi kapalı: kamera nereye bakarsa baksın iki ordu da görünür (bkz. fog.js, öbür gösterilerle aynı).
    world.fog.enabled = false; world.fog.update(0, true);
    // Sahne pusu: varsayılan 70-125 birim bu genişlikte kadrajda ordunun yarısını yutardı (bkz. config sis).
    if (world.scene && world.scene.fog) {
      const d = kameraUzakligi();
      world.scene.fog.near = d * K.sis.yakin; world.scene.fog.far = d * K.sis.uzak;
    }

    for (const t of taraflar) {
      t.oyuncu = world.players.find(p => p.faction === t.faction);
      t.kahraman = t.oyuncu.hero;
      kahramaniKur(t.kahraman);
      t.cizim = createOrduCizim(world.scene, K.renk[t.faction], orduSayisi);
      for (let i = 0; i < orduSayisi; i++) t.liste.push(askerDogur(t));
    }
    arenaReady();
    tur = 0;
    diz();
  }

  /** Kahraman: Kılıçlı Atlı seti, sahne seviyesi ve ordusunun hücum hızı (bkz. config kahraman). */
  function kahramaniKur(p) {
    p.loadout = { ...K.kahraman.loadout };
    p.stats = makeStats(p.loadout, true);
    for (let i = 1; i < K.kahraman.seviye; i++) applyLevelUp(p);
    p.stats.speed = K.kahraman.hiz;
    p.radius = p.stats.radius; p.invMass = p.stats.invMass;
    p.hp = p.stats.maxHp;
    p.vision = 0;
    // Çizim boyu (bkz. characters.js animateView): askerler bu sahnede 1.5 kat çizildiği için kahraman da büyür.
    p.viewOlcek = K.kahraman.olcek;
    world.fx.refreshEntity(p);
  }

  /**
   * Yeni bir gösteri askeri: seviye 1 kalkansız kılıçlı, sahibi yok, **beyni yok** (ai.js hiç koşmaz) ve
   * **görünümü yok** — `addEntity` yerine listeye elle eklenir, yani `world.fx.addEntity` çağrılmaz ve `e.view`
   * null kalır. main.js görünümsüz birimi atlar; askerleri view/ordu.js örnekli çizer.
   */
  function askerDogur(t) {
    const e = createEntity({ faction: t.faction, owner: null, loadout: { weapon: 'sword', shield: false, horse: false } });
    e.brain = null; e.vision = 0;
    e.stats.speed = K.ordu.hiz;
    // Fizik yarıçapı küçültülür (görünüm değişmez): PHYSICS.unitSpacing ile sıkı bir cephe ancak böyle durur.
    e.radius = K.ordu.carpismaYaricap;
    e.gosteriAsker = { taraf: t, hedef: null, sapma: 0, hat: 0, yan: 0, faz: Math.random() * 6, sekme: 0, boy: K.ordu.olcek };
    e.id = world.ids.entity++;
    world.entities.push(e);
    return e;
  }

  // ---- Tur dizilişi

  /** Eksen üstündeki (ileri, yan) koordinattan dünya noktası. */
  const noktaX = (ileri, yan) => eksen.x * ileri + dik.x * yan;
  const noktaZ = (ileri, yan) => eksen.z * ileri + dik.z * yan;

  /**
   * Bir turun dizilişi: iki ordu başlangıç hatlarına, kahramanlar cephe ortasında ön safın `oncu` birim
   * gerisine (eksi değer: ordunun **içinde**). Hiçbir birim doğurulmaz ya da silinmez; her şey yerine oturtulur,
   * yani tur geçişinde tek bir görünüm bile kurulup yıkılmaz ve kare hızı düşmez.
   */
  function diz() {
    tur++;
    const [bo, bs] = K.ordu.boy;
    for (const t of taraflar) {
      // Her turda ordunun yan kayması ve sütun sırası değişir: art arda çekilen turlar birbirinin kopyası olmaz.
      t.kayma = (Math.random() - 0.5) * K.ordu.aralik * 6;
      t.merkez = -t.yon * K.baslangic;
      t.liste.forEach((e, i) => {
        const sut = i % K.ordu.sutun, sr = Math.floor(i / K.ordu.sutun);
        const yan = t.kayma + (sut - (K.ordu.sutun - 1) / 2) * K.ordu.aralik + (Math.random() - 0.5) * 0.7;
        const ileri = t.merkez - t.yon * ((sr - (sira - 1) / 2) * K.ordu.sira + (Math.random() - 0.5) * 0.7);
        dirilt(e, noktaX(ileri, yan), noktaZ(ileri, yan));
        const s = e.gosteriAsker;
        s.yan = yan;
        s.boy = (bo + Math.random() * (bs - bo)) * K.ordu.olcek;
        s.sapma = (Math.random() - 0.5) * 2 * K.dovus.sapma;
        s.hat = (Math.random() - 0.5) * 5;
      });
      // Kahraman: cephe ortasında, ön safın `oncu` birim gerisinde (ordunun içinde); sayaçları ve girdisi sıfırlanır.
      const ileri = t.merkez + t.yon * (derinlik / 2 + K.kahraman.oncu);
      kahramaniDiz(t, noktaX(ileri, t.kayma), noktaZ(ileri, t.kayma));
    }
    // Havada kalan ok / alan / çember olmasın: tur geçişinde ekranda asılı kalmasınlar.
    for (const z of world.zones) world.fx.removeZone(z);
    world.zones.length = 0;
    for (const z of world.spins) world.fx.removeZone(z);
    world.spins.length = 0;
    for (const z of world.tornadoes) world.fx.removeZone(z);
    world.tornadoes.length = 0;
    for (const a of world.arrows) world.fx.removeArrow(a);
    world.arrows.length = 0;

    agir = 0; yapis = true;
    kadraj = hedefKadraj = K.kamera.genis;
    sahne = {
      evre: 'hazir', t: 0, carpisma: 0,
      /** Cephe hattı (eksen üstünde): hücum bitince hesaplanır, hedefi olmayan asker bu hattı geçmez. */
      cizgi: null,
      /** Kahraman başına zıplama adımı: 0 zıplamadı, 1 zıpladı, 2 havada bir daha zıpladı, 3 atıldı. */
      zip: [0, 0],
      /** Kahraman başına dövüş betiğinin zamanı ve sıradaki komutun indeksi, sol tıkın basılı tutulup tutulmadığı. */
      adim: [0, 0], indeks: [0, 0], tutuyor: [false, false],
    };
    odakTazele();
    odakNokta.copy(hedefOdak);
  }

  /** Bir askeri yeni turda ayağa kaldırır: dirilir, canı dolar, yerine ve rakibine dönük oturur. */
  function dirilt(e, x, z) {
    const t = e.gosteriAsker.taraf;
    e.alive = true; e.hp = e.stats.maxHp; e.deathTimer = 0; e.hitFlash = 0; e.stun = 0;
    e.attackTimer = 0; e.cooldown = Math.random() * 0.4; e.didHit = true; e.spawnTimer = 0;
    e.pos.set(x, 0, z); e.vel.set(0, 0, 0); e.push.set(0, 0, 0); e.moveDir.set(0, 0, 0);
    e.jumpY = 0; e.vy = 0;
    e.facing = yawFromDir(eksen.x * t.yon, eksen.z * t.yon);
    e.lastHitBy = null; e.alarmBy = null;
    e.gosteriAsker.hedef = null;
  }

  /** Kahramanı yerine oturtur: sayaçları, girdisi ve canı sıfırlanır. */
  function kahramaniDiz(t, x, z) {
    const p = t.kahraman;
    p.pos.set(x, 0, z); p.vel.set(0, 0, 0); p.push.set(0, 0, 0); p.moveDir.set(0, 0, 0);
    p.hp = p.stats.maxHp; p.alive = true; p.deathTimer = 0; p.jumpY = 0; p.vy = 0; p.airJumps = 0;
    p.dodgeCd = 0; p.dodgeTimer = 0; p.invuln = 0; p.stun = 0; p.attackTimer = 0; p.cooldown = 0;
    p.charging = false; p.charge = 0; p.aimLocked = false;
    p.facing = yawFromDir(eksen.x * t.yon, eksen.z * t.yon);
    p.aim.set(x + eksen.x * t.yon * 10, 0, z + eksen.z * t.yon * 10);
    Object.assign(t.oyuncu.input, { mv: [0, 0], aim: [p.aim.x, p.aim.z], ha: true, sp: false, aq: false, ah: false, ar: false, dq: false, jq: false, heldAt: -1 });
  }

  // ---- Ordu beyni (ai.js değil)

  const gozAnahtar = (i, j) => i * 100003 + j;
  function gozAl() {
    let c = gozHavuz[gozSayi];
    if (!c) { c = { list: [] }; gozHavuz[gozSayi] = c; }
    gozSayi++;
    c.list.length = 0;
    return c;
  }
  /** Yaşayan bütün askerlerin ızgarası: hedef arama yalnız kendi ve komşu gözlere bakar (maliyet birim başına sabit). */
  function izgaraKur() {
    gozHarita.clear(); gozSayi = 0;
    const h = K.dovus.tara;
    for (const t of taraflar) for (const e of t.liste) {
      if (!e.alive) continue;
      const k = gozAnahtar(Math.floor(e.pos.x / h), Math.floor(e.pos.z / h));
      let c = gozHarita.get(k);
      if (!c) { c = gozAl(); gozHarita.set(k, c); }
      c.list.push(e);
    }
  }
  /** Komşu gözlerdeki en yakın düşman (yoksa null). */
  function dusmanAra(e) {
    const h = K.dovus.tara, ci = Math.floor(e.pos.x / h), cj = Math.floor(e.pos.z / h);
    let iyi = null, id = Infinity;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const c = gozHarita.get(gozAnahtar(i, j));
      if (!c) continue;
      for (const o of c.list) {
        if (o.faction === e.faction) continue;
        const d = (o.pos.x - e.pos.x) ** 2 + (o.pos.z - e.pos.z) ** 2;
        if (d < id) { id = d; iyi = o; }
      }
    }
    return iyi;
  }

  /**
   * Bir askerin vuruşu. combat.js'in `startAttack` + `resolveSwing`i yerine: `didHit` baştan doluya alındığı için
   * updateCombat yalnız zamanlayıcıyı ilerletir (vuruş başına bütün sahayı taramaz), hasar doğrudan hedefe yazılır
   * ve savurma oyunun kendi itmesiyle (applyImpulse) verilir. Hasar vuruşun **başında** iner: bu ölçekte (asker
   * ekranda ~18 piksel) 0.13 sn'lik hazırlık farkı görünmez, taranan birim sayısı ise binde bire düşer.
   */
  function vur(e, hedef, nx, nz) {
    const w = e.stats.weapon;
    e.attackTimer = w.duration; e.cooldown = w.cooldown; e.didHit = true;
    e.facing = yawFromDir(nx, nz);
    if (hedef.invuln > 0 || hedef.dodgeTimer > 0) return;
    hedef.hp -= K.dovus.hasar;
    hedef.hitFlash = COMBAT.hitFlash;
    applyImpulse(hedef, nx, nz, K.dovus.itme);
    if (hedef.hp <= 0) {
      hedef.hp = 0; hedef.alive = false; hedef.deathTimer = 0;
      hedef.moveDir.set(0, 0, 0); hedef.vel.set(0, 0, 0);
      hedef.gosteriAsker.hedef = null;
      applyImpulse(hedef, nx, nz, K.dovus.itme * 0.8);
    }
  }

  /**
   * Ordu beyni: her karede bütün askerler yürütülür (ucuz: önbellekteki hedefe bir uzaklık denetimi), ama
   * **hedef arama** ordunun yalnız `dilim`de birinde koşar. Hedefi olmayan / hedefi uzaklaşan asker hücum
   * ekseninde ilerler, hedefi menzilindeyse durup vurur. Ölen asker cesedi gömülünce ordusunun gerisinde
   * yeniden doğar (bkz. config takviye).
   */
  function orduBeyni(dt) {
    izgaraKur();
    dilim = (dilim + 1) % K.dovus.dilim;
    const kopma2 = K.dovus.kopma * K.dovus.kopma;
    const hucum = sahne.evre !== 'hazir';
    for (const t of taraflar) {
      let toplam = 0, n = 0;
      const liste = t.liste;
      for (let i = 0; i < liste.length; i++) {
        const e = liste[i], s = e.gosteriAsker;
        if (!e.alive) {
          if (e.deathTimer >= K.takviye.bekle) takviyeEt(e, t);
          continue;
        }
        toplam += e.pos.x * eksen.x + e.pos.z * eksen.z; n++;
        // Hedef arama: her karede ordunun dilimde biri. Önce elindeki hedefin hâlâ geçerli olduğuna bakılır.
        const h = s.hedef;
        if (h && (!h.alive || (h.pos.x - e.pos.x) ** 2 + (h.pos.z - e.pos.z) ** 2 > kopma2)) s.hedef = null;
        if (!s.hedef && hucum && (i % K.dovus.dilim) === dilim) s.hedef = dusmanAra(e);
        yurut(e, s, t, dt, hucum);
      }
      if (n) t.merkez = toplam / n;
    }
  }

  /** Bir askerin bu karedeki hareketi, yönü ve vuruşu. */
  function yurut(e, s, t, dt, hucum) {
    const hedef = s.hedef;
    if (hedef) {
      const dx = hedef.pos.x - e.pos.x, dz = hedef.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
      if (d <= K.dovus.menzil + hedef.radius) {
        e.moveDir.set(0, 0, 0); e.sprinting = false;
        e.facing = yawFromDir(dx / d, dz / d);
        if (e.cooldown <= 0 && e.attackTimer <= 0 && e.stun <= 0) vur(e, hedef, dx / d, dz / d);
      } else {
        e.moveDir.set(dx / d, 0, dz / d); e.sprinting = true;
      }
    } else if (hucum && !hattiGecti(e, s, t)) {
      // Hücum: eksende ileri, askere özel küçük bir sapmayla (cephe tek sıra gibi değil, dalga gibi görünsün).
      const a = s.sapma, c = Math.cos(a), sn = Math.sin(a);
      const ux = eksen.x * t.yon, uz = eksen.z * t.yon;
      e.moveDir.set(ux * c - uz * sn, 0, ux * sn + uz * c);
      e.sprinting = true;
      e.facing = yawFromDir(e.moveDir.x, e.moveDir.z);
    } else {
      // Hattı tutar: cepheye varmış ama hedefi olmayan asker ilerlemez, rakip orduya döner.
      e.moveDir.set(0, 0, 0); e.sprinting = false;
      if (hucum) e.facing = yawFromDir(eksen.x * t.yon, eksen.z * t.yon);
    }
    // Yürüyüş sekmesi (örnekli çizici uzuv canlandırmaz; bkz. view/ordu.js): hareket ettikçe hafif zıplama.
    if (e.moveDir.x || e.moveDir.z) { s.faz += dt * 11; s.sekme = Math.abs(Math.sin(s.faz)) * 0.09; }
    else if (s.sekme > 0.001) s.sekme *= 0.9;
  }

  /**
   * **Cephe hattı**: hücum başladıktan sonra iki ordunun buluştuğu nokta (eksen üstünde). Hedefi olmayan asker bu
   * hattı geçmez. Hat olmasaydı hedef bulamayan askerler birbirinin içinden geçip gider ve iki ordu ekranda
   * karışırdı; hatla birlikte iki taraf ortada kalın bir duvar hâlinde sıkışır — istenen "cephe" görüntüsü budur.
   * `hat` askere özel küçük bir kaydırmadır: hattın kendisi cetvelle çizilmiş gibi düz görünmesin.
   */
  function hattiGecti(e, s, t) {
    if (sahne.cizgi === null) return false;
    const ileri = e.pos.x * eksen.x + e.pos.z * eksen.z;
    return t.yon > 0 ? ileri >= sahne.cizgi + s.hat : ileri <= sahne.cizgi + s.hat;
  }

  /**
   * Ölen asker ordusunun gerisinde, **kendi sütununda** yeniden doğar: cephe hiçbir yerinden incelmez (ortadan
   * besleyip kenarları boşaltmak orduya haç biçimi bir delik açıyordu) ve varlık sayısı sabit kalır — hiçbir
   * karede yüzlerce görünüm kurulup yıkılmaz.
   */
  function takviyeEt(e, t) {
    const s = e.gosteriAsker;
    const ileri = t.merkez - t.yon * K.takviye.geri;
    const yan = s.yan + (Math.random() - 0.5) * K.takviye.yayilma;
    dirilt(e, noktaX(ileri, yan), noktaZ(ileri, yan));
  }

  // ---- Kahramanlar

  /** İki ordunun cepheleri arasındaki boşluk (birim): hücum bu değer `evre.temas`a inince biter. */
  const cepheAraligi = () => (taraflar[1].merkez - taraflar[0].merkez) - derinlik;

  /** `i` numaralı kahramanın bu karedeki girdisi. Kenar bayraklarını (jq / dq / aq / ar) evreler ve betik kurar. */
  function kahramanGirdisi(i) {
    const t = taraflar[i], rakip = taraflar[1 - i].kahraman;
    const p = t.kahraman, inp = t.oyuncu.input;
    inp.ha = true; inp.dm = false; inp.ly = false; inp.sp = false;
    // Nişan hep rakip kahramandır: vuruşlar, atılma ve şok dalgası ona doğru çıkar.
    inp.aim[0] = rakip.pos.x; inp.aim[1] = rakip.pos.z;
    const dx = rakip.pos.x - p.pos.x, dz = rakip.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    if (sahne.evre === 'hazir') { inp.mv[0] = 0; inp.mv[1] = 0; }
    else if (sahne.evre === 'hucum') {
      // Hücumda kahraman ordusuyla birlikte ilerler (hızı ordunun hücum hızına eşittir, bkz. config kahraman.hiz).
      inp.mv[0] = eksen.x * t.yon; inp.mv[1] = eksen.z * t.yon;
    } else if (d > K.dovusMesafe) { inp.mv[0] = dx / d; inp.mv[1] = dz / d; }
    else if (d < K.dovusMesafe * K.yakinOran) { inp.mv[0] = -dx / d; inp.mv[1] = -dz / d; }
    else {
      // Vuruş menzilindeyken (kılıçlı kahramanın menzili 360° ve 6.6 birim) birbirinin çevresinde dönerler:
      // atılmadan sonra üst üste binip tek bir yumru gibi görünmesinler, iki kılıç yayı da ayrı ayrı okunsun.
      inp.mv[0] = -dz / d; inp.mv[1] = dx / d;
    }
    inp.ah = sahne.tutuyor[i];
  }

  /**
   * Zıplama evresi: zıpla (Boşluk) → tepede bir daha zıpla (JUMP_AIR) → alçalırken rakibe **atıl** (sağ tık:
   * atılma + kılıç fırtınası + vakum). Ağır çekim atılma anında başlar: Yusuf "atılma ve ilk çarpışma" dedi.
   */
  function ziplamaEvresi() {
    const s = sahne;
    for (let i = 0; i < 2; i++) {
      const t = taraflar[i], p = t.kahraman, inp = t.oyuncu.input;
      if (s.zip[i] === 0) { inp.jq = true; s.zip[i] = 1; }
      else if (s.zip[i] === 1 && p.vy <= 0 && s.t > 0.12) { inp.jq = true; s.zip[i] = 2; }
      else if (s.zip[i] === 2 && p.vy < 0 && p.jumpY > 0 && p.jumpY <= K.sagTikYukseklik) {
        inp.dq = true; s.zip[i] = 3;
        agir = Math.max(agir, K.agir.atilma);
        if (!s.carpisma) s.carpisma = world.clock;
      }
    }
  }

  /**
   * Dövüş betiği: `betik`teki komutlar sırayla verilir, `betikSure` dolunca başa sarar (bkz. config betik).
   * Her kahramanın kendi zamanı ve sıradaki komut indeksi vardır; indeks sayesinde ağır çekimde de, kare
   * atlandığında da hiçbir komut kaçmaz ya da iki kez verilmez.
   */
  function betikEvresi(dt) {
    const s = sahne;
    for (let i = 0; i < 2; i++) {
      const inp = taraflar[i].oyuncu.input;
      s.adim[i] += dt;
      while (s.indeks[i] < K.betik.length && K.betik[s.indeks[i]].t <= s.adim[i]) {
        const komut = K.betik[s.indeks[i]++];
        if (komut.k === 'aq') inp.aq = true;
        else if (komut.k === 'dq') inp.dq = true;
        else if (komut.k === 'tut') s.tutuyor[i] = true;
        else if (komut.k === 'birak') { s.tutuyor[i] = false; inp.ar = true; }
      }
      if (s.adim[i] >= K.betikSure) { s.adim[i] -= K.betikSure; s.indeks[i] = 0; }
    }
  }

  // ---- Evreler

  function gec(evre) {
    sahne.evre = evre; sahne.t = 0;
    // Kamera kahraman evrelerinde hafifçe yaklaşır; ordular yine kadrajda kalır (bkz. config kamera.yakin).
    hedefKadraj = evre === 'ziplama' || evre === 'dovus' ? K.kamera.yakin : K.kamera.genis;
  }
  function evreler(dt) {
    const s = sahne;
    s.t += dt;
    switch (s.evre) {
      case 'hazir':
        if (s.t >= K.evre.hazir) gec('hucum');
        break;
      case 'hucum':
        // Cepheler birleşmek üzereyken kahramanlar fırlar (üst sınır güvenliktir: beklenen an gelmezse takılmaz).
        if (cepheAraligi() <= K.evre.temas || s.t >= K.evre.hucumEnCok) {
          s.cizgi = (taraflar[0].merkez + taraflar[1].merkez) / 2;
          gec('ziplama');
        }
        break;
      case 'ziplama':
        if (s.t >= K.evre.ziplama) { s.adim[0] = s.adim[1] = 0; s.indeks[0] = s.indeks[1] = 0; gec('dovus'); }
        break;
      case 'dovus':
        if (s.t >= K.evre.dovus) gec('savas');
        break;
      case 'savas':
        if (s.t >= K.evre.savas) gec('bitis');
        break;
      case 'bitis':
        if (s.t >= K.evre.bitis) diz();
        break;
      default: break;
    }
  }

  // ---- Kare

  /** Her kare: ordu beyni, kahraman girdileri, simülasyon (ağır çekimde yavaşlamış), evreler ve ordu çizimi. */
  function guncelle(dt) {
    // `paused` da denetlenir: görüntü bağlamı düşünce (telefonda görüntü belleği dolunca) oyun durur, sahne de
    // durmalı — yoksa ekran donmuşken simülasyon koşmaya devam eder (bkz. main.js webglcontextlost).
    if (!sahne || !world.running || world.paused) return;
    const olcek = agir > 0 ? K.agir.olcek : 1;
    agir = Math.max(0, agir - dt);
    const sdt = dt * olcek;

    orduBeyni(sdt);
    kahramanGirdisi(0); kahramanGirdisi(1);
    if (sahne.evre === 'ziplama') ziplamaEvresi();
    else if (sahne.evre === 'dovus' || sahne.evre === 'savas') betikEvresi(sdt);

    step(world, sdt);

    // Kahramanlar düşmez: "DÜŞTÜN!" ekranı içerik kurallarında yasak ve sahne tur ortasında kesilirdi. Can her
    // karede doldurulur; vuruş parlaması kalır, yani dövüş görünür.
    for (const t of taraflar) {
      const p = t.kahraman;
      if (!p.alive) { p.alive = true; p.deathTimer = 0; }
      if (p.hp < p.stats.maxHp) p.hp = p.stats.maxHp;
    }
    evreler(sdt);
    odakTazele();
    for (const t of taraflar) t.cizim.guncelle(t.liste, K.parlama);
  }

  // ---- Kamera

  /** Kameranın bakacağı yer: iki ordu merkezinin ortası; kahraman evrelerinde iki kahramanın ortası. */
  function odakTazele() {
    const kahramanda = sahne.evre === 'ziplama' || sahne.evre === 'dovus';
    if (kahramanda) {
      const a = taraflar[0].kahraman.pos, b = taraflar[1].kahraman.pos;
      hedefOdak.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    } else {
      const ileri = (taraflar[0].merkez + taraflar[1].merkez) / 2;
      const yan = (taraflar[0].kayma + taraflar[1].kayma) / 2;
      hedefOdak.set(noktaX(ileri, yan), 0, noktaZ(ileri, yan));
    }
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
   * İzometrik kamerayı yerleştirir: oyunun kendi 45° bakış açısı korunur, yalnız geriye çekilir ve dikey yarı
   * kadraj (`kadraj`) sahneden gelir. Kahraman düellosunda hafifçe yaklaşır, sonra geri açılır.
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

  /** Sahnenin durumu (yalnız okuma; dumanı testi ve hata ayıklama için). Sahne kurulmadan çağrılırsa boş döner. */
  const durum = () => (!sahne ? { evre: null, tur: 0, ordu: orduSayisi, ayakta: [0, 0], dovusen: [0, 0], alanlar: [] } : {
    evre: sahne.evre, tur, agir: agir > 0, kadraj: Math.round(kadraj),
    ordu: orduSayisi, sutun: K.ordu.sutun, sira,
    ayakta: taraflar.map(t => t.liste.reduce((n, e) => n + (e.alive ? 1 : 0), 0)),
    dovusen: taraflar.map(t => t.liste.reduce((n, e) => n + (e.alive && e.gosteriAsker.hedef ? 1 : 0), 0)),
    aralik: +cepheAraligi().toFixed(1),
    kahramanArasi: +Math.hypot(taraflar[0].kahraman.pos.x - taraflar[1].kahraman.pos.x, taraflar[0].kahraman.pos.z - taraflar[1].kahraman.pos.z).toFixed(1),
    kahramanY: taraflar.map(t => +t.kahraman.jumpY.toFixed(2)),
    kahramanSeviye: taraflar[0].kahraman.level,
    alanlar: world.zones.map(z => z.kind),
    /** Kahramanların fırlayıp çarpıştığı an (sahne saati, sn): video kesiti bu saniyeye göre ayarlanır. */
    carpisma: sahne.carpisma,
  });
  world.gosteriDurum = durum;

  return { izometrik: true, kalite: K.kalite, basla, guncelle, odak, bakisIzo, gorus, durum };
}
