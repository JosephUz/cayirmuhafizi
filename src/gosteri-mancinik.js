import * as T from 'three';
import { yawFromDir } from './builders.js';
import { addEntity, createEntity, makeStats } from './characters.js';
import { startAttack } from './combat.js';
import { GOSTERI_MANCINIK as K, SIEGE, SOLDIER_BASE, SOLDIER_TYPES, VISION } from './config.js';
import { t } from './dil.js';
import { removeStructure } from './structures.js';
import { setupGame, step } from './world.js';

/**
 * **Mancınık düellosu gösterisi** (`?gosteri=mancinik`, yalnız tarayıcıda): short videosu için sahnelenmiş, her
 * turda sıfırlanıp tekrarlanan tek bir sahne. `?gosteri=1`, `?gosteri=kahraman`, `?gosteri=savas` ve normal oyun
 * bu dosyadan hiç etkilenmez.
 *
 * Sahnenin akışı (bir tur ~28 sn; saniyeler config GOSTERI_MANCINIK.isaret, müziğin vuruşlarıdır):
 *  1. **duello** (0 - 13.3 sn) — haritanın orta alanında, kulelerin kaldırıldığı bomboş çayırda iki mancınık
 *     sırası karşılıklı dizilidir (aralarında 18 birim) ve birbirini döver. Taşlar 1.9 sn'lik barların başına
 *     inecek şekilde (`atislar` betiği) yola çıkar; isabet eden taş mancınığı yıkar, ıskalayan yanından geçer.
 *     Kızıl sıra 13.3'te tamamen yıkılır — müzikteki **yıkılış** anı budur.
 *  2. **yikilis** (13.3 - 15.2 sn) — toz durur, kamera **yavaşça** kanada doğru kayar ve hafifçe açılır:
 *     atlıların geleceği taraf kadraja girer.
 *  3. **akin** (15.2 - 22.9 sn) — kızılın süvarisi (Kılıçlı Atlı) kadrajın **altından, kanattan** girer ve
 *     mavinin mancınıklarına dörtnala koşar. Kazanan mancınıklar bu sırada sütunun üstüne taş yağdırır.
 *  4. **darbe** (22.9 sn -) — atlılar mancınıklara varır; o andan sonra sahne onları bırakır, dövüşü **oyunun
 *     kendi yapay zekâsı** (ai.js) sürdürür: atlılar mancınıkları ve muhafızları döver.
 *  5. Müzik süresi (25.35 sn) + `tekrar` dolunca sahne baştan kurulur.
 *
 * **Sahnede kahraman yoktur.** setupGame iki koltuğu da "insan" açar (hiçbir bot yapay zekâsı koşmaz), ama iki
 * kahraman da sahanın dışına park edilir ve görünümleri sökülür: ekranda hiç görünmezler, yalnız `world.player`
 * ve `checkVictory` için ayakta dururlar.
 *
 * **Neden betikli atış?** Sahne müziğe kare kare kilitli olmalı: son mancınık 13.3 sn'de yıkılmalı. Oyunun
 * yapay zekâsına bırakılan bir düello bunu tutturamaz. Betik yalnız **kim ne zaman nereye atar**ı söyler;
 * taşın kendisi, uçuşu, isabet denetimi, hasarı ve yıkım efekti oyunun kendi kurallarıdır (combat.js
 * `startAttack` → `shootArrow` → `updateArrows` → `damageEntity`). Mancınık 40 can, taş 40 hasar: sayı da
 * oyunun kendi sayısıdır (bkz. config SIEGE, WEAPONS.catapult).
 *
 * Arayüzün gizlenmesi, girdinin okunmaması, ölçümün gitmemesi ve sunucuya bağlanılmaması öbür gösteri
 * kipleriyle ortaktır (bkz. main.js, style.css `.gosteri`).
 */
export function createMancinikGosteri(world, { arenaReady }) {
  world.gosteri = true;
  const { eksen, kanat } = K;
  /** Sahne koordinatından (a: ekranın yatayı, b: ekranın dikeyi) dünya noktası. */
  const noktaX = (a, b) => eksen.x * a + kanat.x * b;
  const noktaZ = (a, b) => eksen.z * a + kanat.z * b;

  const odakNokta = new T.Vector3(), hedefOdak = new T.Vector3(), nisan = new T.Vector3();
  const taraflar = {
    blue: { faction: 'blue', yon: -1, oyuncu: null, mancinik: [], muhafiz: [], akin: [] },
    red: { faction: 'red', yon: 1, oyuncu: null, mancinik: [], muhafiz: [], akin: [] },
  };
  let sahne = null, tur = 0, yapis = true;
  let kadraj = K.kamera.duello, hedefKadraj = K.kamera.duello;

  // ---- Kuruluş

  /** Bir kez: dünya kurulur, sahne dışında kalan her şey (yapı, kamp, haydut, ganimet, kahraman) sahadan kalkar. */
  function basla() {
    setupGame(world, {
      // İki koltuk da "insan": hiçbir bot yapay zekâsı koşmaz (bkz. economy.js updateBots). Kahramanlar da
      // yalnız girdiyle hareket eder; bu sahne onlara hiç girdi vermez, üstelik sahanın dışına park eder.
      teamSize: 1, humans: [{ name: t('oyuncu.mavi') }, { name: t('oyuncu.kizil'), faction: 'red' }],
      seed: Number(new URLSearchParams(location.search).get('tohum')) || K.tohum,
    });
    world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
    world.onEnd = null;
    // Ganimet / exp küresi düşmez: bomboş bir savaş meydanında yıkılan mancınığın altın bırakması anlamsız.
    world.onDeath = () => {};
    world.camps.length = 0; world.banditTimer = Infinity;
    // **Yapılar kalkar**: Yusuf "orta alanda kulelerin olmadığı bir alan" dedi. Kule kadrajdaki mancınığı
    // döverdi (ve mancınık hedefini kuleye çevirirdi, bkz. combat.js nearestEnemyTower); sancak / kışla da
    // sahnenin ortasında görünmez bir yerde durur, sahaya hiçbir şey katmaz.
    for (let i = world.structures.length - 1; i >= 0; i--) removeStructure(world, world.structures[i]);
    // Savaş sisi kapalı: kamera nereye bakarsa baksın saha görünür (öbür gösterilerle ortak).
    world.fog.enabled = false; world.fog.update(0, true);

    for (const t of Object.values(taraflar)) t.oyuncu = world.players.find(p => p.faction === t.faction);
    for (const p of world.players) kahramaniParkEt(p.hero);
    arenaReady();
    tur = 0;
    diz();
  }

  /**
   * Kahramanı sahanın köşesine park eder ve **görünümünü söker** (`e.view` null kalır, main.js onu çizmez):
   * sahnede kahraman yoktur. Silinmez, çünkü `world.player` bir varlık olmalı ve `checkVictory` iki tarafta da
   * ayakta birim görmeli (yoksa maç "yok etme" ile biter ve sahne kesilir).
   */
  function kahramaniParkEt(p) {
    const k = world.half - 8;
    p.pos.set(p.faction === 'blue' ? -k : k, 0, -k);
    p.vel.set(0, 0, 0); p.push.set(0, 0, 0); p.moveDir.set(0, 0, 0);
    p.vision = 0; p.hp = p.stats.maxHp;
    world.fx.removeEntity(p);
  }

  /** Sahnedeki bütün gösteri birimleri ve havadaki taşlar sahadan kalkar (tur sıfırlaması). */
  function sahayiBosalt() {
    for (let i = world.entities.length - 1; i >= 0; i--) {
      const e = world.entities[i];
      if (e.isPlayer) continue;
      world.fx.removeEntity(e); world.entities.splice(i, 1);
    }
    for (const a of world.arrows) world.fx.removeArrow(a);
    world.arrows.length = 0;
    for (const t of Object.values(taraflar)) { t.mancinik.length = 0; t.muhafiz.length = 0; t.akin.length = 0; }
  }

  /**
   * Yeni bir sahne birimi: oyunun kendi asker türünden (SOLDIER_TYPES) kurulur, canı / hızı / yarıçapı oyundaki
   * değerleridir — yalnız kışlada basılmak yerine (sahada bina yok) doğrudan yerine konur.
   * `beyinsiz` birimler (mancınıklar ve akın başlamadan bekleyen atlılar) ai.js'ten geçmez: onları sahne sürer.
   */
  function birimDogur(taraf, turAdi, a, b, { beyinsiz = false } = {}) {
    const tip = SOLDIER_TYPES.find(s => s.key === turAdi);
    const x = noktaX(a, b), z = noktaZ(a, b);
    const e = createEntity({ faction: taraf.faction, owner: taraf.oyuncu, loadout: { weapon: tip.weapon, shield: tip.shield, horse: tip.horse }, x, z });
    e.typeKey = tip.key;
    e.stats.maxHp = SOLDIER_BASE.hp; e.hp = e.stats.maxHp;
    e.vision = VISION.soldier;
    if (tip.siege) {
      e.isSiege = true;
      e.stats.maxHp = SIEGE.hp; e.hp = SIEGE.hp;
      e.stats.speed = SIEGE.speed; e.radius = SIEGE.radius;
      e.vision = Math.max(VISION.siege, e.stats.weapon.range);
    }
    // Rakip sıraya dönük dur: mancınığın fırlatma kolu da, askerin yüzü de karşıya baksın.
    e.facing = yawFromDir(eksen.x * taraf.yon * -1, eksen.z * taraf.yon * -1);
    e.spawnTimer = 0;
    e.brain = beyinsiz ? null : { mode: 'march', timer: 0, target: null, retarget: 0, home: { x, z }, order: null };
    addEntity(world, e);
    return e;
  }

  // ---- Tur dizilişi

  /**
   * Bir turun dizilişi. Mancınıklar `eksen`in iki ucunda karşılıklı, arka hatlar `kanat` ekseninde taş
   * kuşağının dışında (bkz. config muhafiz: rakip sıraya uzaklıkları askerin görüşünden fazla, yani hat
   * kendiliğinden mevzisini korur), süvari ise hedefinin `mesafe` birim gerisinde, kadrajın dışında bekler.
   */
  function diz() {
    tur++;
    sahayiBosalt();
    for (const t of Object.values(taraflar)) {
      const a = K.mancinik.aralik * t.yon;
      for (const b of K.mancinik.yer) t.mancinik.push(birimDogur(t, 'catapult', a, b, { beyinsiz: true }));
      // Arka hat: taş kuşağının ve süvari koridorunun dışında, karşı kanatta, ekranı enine kesen kısa bir sıra.
      const n = K.muhafiz.sayi;
      for (let i = 0; i < n; i++) {
        const ma = (i - (n - 1) / 2) * (K.muhafiz.yayilma / Math.max(1, n - 1));
        t.muhafiz.push(birimDogur(t, K.muhafiz.tur[t.faction], ma, -K.muhafiz.b * t.yon));
      }
    }
    /**
     * Süvari: kaybeden (kızıl) tarafın atlıları, kadrajın **altında**, kanat ekseninde `mesafe` birim geride
     * bekler. Atlının hızı ezilmez — oyunun kendi atlı hızı (3.8 x 1.7 = 6.46) birimin `stats.speed`inden
     * okunur ve **yol ona göre ölçülür**: atlı `akin` ile `sonDarbe` arasında koşar, hedefine `temas` birim
     * kala sahnenin elinden çıkar, fizik de ilk karelerde `pay` kadar yol kaybeder (birim ilk karede tam hıza
     * çıkmaz). Yani sütunun önü **tam `isaret.sonDarbe` saniyesinde** mavi mancınığa varır.
     */
    const n = K.akin.sutun, hedefA = -K.mancinik.aralik, D = K.akin.daginik;
    const hiz = makeStats({ weapon: 'sword', shield: false, horse: true }, false).speed;
    const mesafe = (K.isaret.sonDarbe - K.isaret.akin) * hiz + K.akin.temas - K.akin.pay;
    for (let i = 0; i < K.akin.sayi; i++) {
      // Dağıtma indisten türetilir (rastgele değil): sütun blok gibi değil dalga gibi gelsin, ama çekim
      // kare kare tekrarlanabilir kalsın. `kanat` kaydırması hep **geriye**dir: sütunun önü hiçbir atlıyla
      // öne taşmaz, yani `mesafe` hesabı (ve `isaret.sonDarbe` anı) kaymaz.
      const a = hedefA + ((i % n) - (n - 1) / 2) * (K.akin.yayilma / Math.max(1, n - 1)) + ((i * 7) % 5 - 2) * D.a;
      const b = K.mancinik.yer[0] - mesafe - Math.floor(i / n) * K.akin.derinlik - ((i * 13) % 7) * D.b;
      const e = birimDogur(taraflar.red, 'horsesword', a, b, { beyinsiz: true });
      e.facing = yawFromDir(kanat.x, kanat.z);
      taraflar.red.akin.push(e);
    }

    kadraj = hedefKadraj = K.kamera.duello;
    yapis = true;
    sahne = {
      saniye: 0, evre: 'duello',
      /** Betikteki her atış için "atıldı mı": tur içinde her taş bir kez yola çıkar. */
      atildi: K.atislar.map(() => false),
      /** Ölçülen anlar (sahne saati, sn; 0 = olmadı): dumanı testi ve çekim betiği bunlara bakar. */
      yikilis: 0, carpisma: 0, ilkTas: 0,
      tas: 0, gunluk: [], yikilan: { blue: 0, red: 0 },
    };
    odakTazele();
    odakNokta.copy(hedefOdak);
  }

  // ---- Taş betiği

  const mancinikAl = ([f, i]) => taraflar[f].mancinik[i] || null;

  /**
   * Bir atışın nişan noktası (dünya). Hedef bir mancınıksa onun yeri, `'akin'` ise süvari sütununun o anki
   * **önü**; `sapma` sıfırdan farklıysa taş hedefin yanına gider, yani ıskalar.
   */
  function atisNoktasi(s) {
    if (s.hedef === 'akin') {
      const e = akininOnu();
      if (!e) return null;
      nisan.set(e.pos.x, 0, e.pos.z);
    } else {
      const h = mancinikAl(s.hedef);
      if (!h || !h.alive) return null;
      nisan.set(h.pos.x, 0, h.pos.z);
    }
    const [sa, sb] = s.sapma;
    if (sa || sb) nisan.set(nisan.x + noktaX(sa, sb), 0, nisan.z + noktaZ(sa, sb));
    return nisan;
  }

  /** Dörtnala gelen sütunun en öndeki (kanat ekseninde en ilerideki) ayakta atlısı. */
  function akininOnu() {
    let iyi = null, ileri = -Infinity;
    for (const e of taraflar.red.akin) {
      if (!e.alive) continue;
      const b = e.pos.x * kanat.x + e.pos.z * kanat.z;
      if (b > ileri) { ileri = b; iyi = e; }
    }
    return iyi;
  }

  /**
   * Betikteki atışlar. Her satır taşın **indiği** ana göre yazılmıştır; fırlatma anı uzaklıktan geri sayılır
   * (taş hızı sabit, uçuş düz: `shootArrow` kahraman olmayan mancınığın taşını hedefe kilitlemez). Atanı ya da
   * hedefi düşmüş satır sessizce atlanır — betik sahneyi takmaz.
   */
  function atislariSur() {
    for (let i = 0; i < K.atislar.length; i++) {
      if (sahne.atildi[i]) continue;
      const s = K.atislar[i], e = mancinikAl(s.atan);
      if (!e || !e.alive) { sahne.atildi[i] = true; continue; }
      const hedef = atisNoktasi(s);
      if (!hedef) { if (sahne.saniye > s.iner) sahne.atildi[i] = true; continue; }
      const d = Math.hypot(hedef.x - e.pos.x, hedef.z - e.pos.z);
      const firlat = s.iner - K.ucus.hazirlik - Math.max(0, d - K.ucus.cikis) / e.stats.weapon.arrowSpeed + K.ucus.degme;
      if (sahne.saniye < firlat) continue;
      e.aim.copy(hedef);
      e.facing = yawFromDir(hedef.x - e.pos.x, hedef.z - e.pos.z);
      // `startAttack` oyunun kendi atışıdır: kolu kurar, bekleme süresini yazar ve `windup` dolunca taşı atar.
      // **Beklemesi dolmamışsa atmaz** (canAttack): o zaman satır yanmaz, sonraki karede yeniden denenir —
      // betikteki aralıklar zaten WEAPONS.catapult.cooldown'dan büyüktür, bir karelik üst üste binme kendini
      // toparlar. İnme anı geçtiyse satır bırakılır (sahne takılmasın); dumanı testi atılan taş sayısını
      // saydığı için böyle bir kayıp sessiz kalmaz.
      if (startAttack(e)) {
        sahne.atildi[i] = true;
        sahne.tas++;
        if (!sahne.ilkTas) sahne.ilkTas = sahne.saniye;
        sahne.gunluk.push(`${s.atan.join('')}→${(Array.isArray(s.hedef) ? s.hedef.join('') : s.hedef)}@${s.iner}`);
      } else if (sahne.saniye > s.iner) sahne.atildi[i] = true;
    }
  }

  // ---- Süvari akını

  /**
   * Akın: her atlı kendisine düşen mavi mancınığa dörtnala koşar. Yolu sahne sürer (hız oyunun kendi atlı
   * hızıdır, yön hedefe doğrudur — varış anı bu yüzden `isaret.sonDarbe`e kilitlidir), ama hedefine `temas`
   * birim yaklaşan ya da yanında herhangi bir düşman beliren atlı **oyunun yapay zekâsına devredilir**:
   * beyni takılır, bundan sonra hedef seçimi, vuruş, hasar ve karşılık normal oyundaki gibi işler.
   */
  function akiniSur() {
    const hedefler = taraflar.blue.mancinik.filter(e => e.alive);
    taraflar.red.akin.forEach((e, i) => {
      if (!e.alive || e.brain) return;
      const h = hedefler.length ? hedefler[i % hedefler.length] : null;
      const hx = h ? h.pos.x : e.pos.x + kanat.x, hz = h ? h.pos.z : e.pos.z + kanat.z;
      const dx = hx - e.pos.x, dz = hz - e.pos.z, d = Math.hypot(dx, dz) || 1;
      if (d <= K.akin.temas || yakinDusman(e) <= K.akin.temas) {
        e.brain = { mode: 'march', timer: 0, target: null, retarget: 0, home: { x: e.pos.x, z: e.pos.z }, order: null };
        e.moveDir.set(0, 0, 0);
        return;
      }
      e.moveDir.set(dx / d, 0, dz / d);
      e.facing = yawFromDir(dx / d, dz / d);
    });
  }

  /**
   * Arka hatları yürüyüşe geçirir: her askerin **bağlı olduğu nokta** (ai.js `rallyAnchor` → `brain.home`)
   * yeni mevziye taşınır, asker oraya kendi yürüyüşüyle gider. Emir burada biter — yolu, yolda düşmanla
   * karşılaşmayı ve dövüşü **oyunun kendi yapay zekâsı** yapar.
   *  - Mavi (`savunma`, akın başlarken): piyade mancınıklarını savunmaya iner. 15-23 sn arasındaki dörtnala
   *    bölümünde kadrajda kıpırdamayan asker kalmaz ve son darbede atlıları karşılayan bir hat olur
   *    (muhafızlar **Mızrak Kalkan**, yani atlının antisi, bkz. ANTI.table).
   *  - Kızıl (`takip`, daha geç): süvarinin arkasından gelen ikinci dalga.
   */
  function hattiYurut(liste, { a: ka, b }) {
    for (const e of liste) {
      if (!e.alive || !e.brain) continue;
      const a = e.pos.x * eksen.x + e.pos.z * eksen.z + ka;
      e.brain.home = { x: noktaX(a, b), z: noktaZ(a, b) };
    }
  }

  /** Evre geçişlerine bağlı olmayan, saniyesi yazılı emirler (kaçırılmasın diye kare aralığıyla denetlenir). */
  function hatEmirleri(once) {
    const gecti = (t) => once < t && sahne.saniye >= t;
    if (gecti(K.isaret.akin)) hattiYurut(taraflar.blue.muhafiz, K.savunma);
    if (gecti(K.takip.basla)) hattiYurut(taraflar.red.muhafiz, K.takip);
  }

  /** Birime en yakın yaşayan düşmanın uzaklığı. */
  function yakinDusman(e) {
    let en = Infinity;
    for (const o of world.entities) {
      if (!o.alive || o.faction === e.faction || o.isPlayer) continue;
      const d = Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z);
      if (d < en) en = d;
    }
    return en;
  }

  /**
   * **Son darbe** anı: ilk atlının mavi mancınıklardan birinin dibine vardığı saniye. Ölçüm sahnenin sürüşünden
   * ayrıdır (atlı o sırada oyunun yapay zekâsına çoktan devredilmiş olabilir); müziğin `sonDarbe` vuruşu bununla
   * karşılaştırılır.
   */
  function darbeyiOlc() {
    if (sahne.carpisma) return;
    for (const a of taraflar.red.akin) {
      if (!a.alive) continue;
      for (const m of taraflar.blue.mancinik) {
        if (!m.alive) continue;
        if (Math.hypot(a.pos.x - m.pos.x, a.pos.z - m.pos.z) <= K.akin.temas) { sahne.carpisma = sahne.saniye; return; }
      }
    }
  }

  // ---- Evreler

  /** Yıkılan mancınıklar sayılır; kızıl sıra tükendiği an **yıkılış** anıdır (müzikte 13.3 sn). */
  function yikimlariSay() {
    for (const f of ['blue', 'red']) sahne.yikilan[f] = taraflar[f].mancinik.reduce((n, e) => n + (e.alive ? 0 : 1), 0);
    if (!sahne.yikilis && sahne.yikilan.red >= taraflar.red.mancinik.length) sahne.yikilis = sahne.saniye;
  }

  function evreler() {
    const t = sahne.saniye;
    sahne.evre = t < K.isaret.yikilis ? 'duello'
      : t < K.isaret.akin ? 'yikilis'
        : t < K.isaret.sonDarbe ? 'akin' : 'darbe';
    hedefKadraj = sahne.evre === 'duello' ? K.kamera.duello : sahne.evre === 'darbe' ? K.kamera.darbe : K.kamera.akin;
    if (t >= K.isaret.son + K.tekrar) diz();
  }

  // ---- Kare

  /** Her kare: betikli atışlar, süvari akını, oyunun simülasyonu, evreler ve kamera. */
  function guncelle(dt) {
    // `paused` da denetlenir: görüntü bağlamı düşünce (telefonda görüntü belleği dolunca) oyun durur, sahne de
    // durmalı — yoksa ekran donmuşken simülasyon koşmaya devam eder (bkz. main.js webglcontextlost).
    if (!sahne || !world.running || world.paused) return;
    const once = sahne.saniye;
    sahne.saniye += dt;
    atislariSur();
    hatEmirleri(once);
    if (sahne.saniye >= K.isaret.akin) akiniSur();
    step(world, dt);
    yikimlariSay();
    darbeyiOlc();
    evreler();
    odakTazele();
  }

  // ---- Kamera

  /**
   * Kameranın bakacağı yer: `eksen` üstünde hep iki sıranın tam ortası (0), `kanat` üstünde evreye göre
   * (bkz. config kamera.odak). Akın boyunca bakış `akin`den `darbe`ye **doğrusal** döner, yani kamera
   * atlılarla birlikte yavaşça yukarı kayar; üstüne `odakYumusatma` yumuşatması biner, kamera hiç kesmez.
   */
  function odakTazele() {
    const O = K.kamera.odak, t = sahne.saniye;
    let a, b;
    if (sahne.evre === 'duello') ({ a, b } = O.duello);
    else if (sahne.evre === 'yikilis') ({ a, b } = O.akin);
    else if (sahne.evre === 'akin') {
      const k = (t - K.isaret.akin) / (K.isaret.sonDarbe - K.isaret.akin);
      a = O.akin.a + (O.darbe.a - O.akin.a) * k;
      b = O.akin.b + (O.darbe.b - O.akin.b) * k;
    } else ({ a, b } = O.darbe);
    hedefOdak.set(noktaX(a, b), 0, noktaZ(a, b));
  }

  function odak(dt) {
    if (!sahne) return odakNokta;
    if (yapis) { odakNokta.copy(hedefOdak); yapis = false; }
    else if (dt > 0) odakNokta.lerp(hedefOdak, 1 - Math.exp(-dt * K.kamera.odakYumusatma));
    return odakNokta;
  }

  /**
   * İzometrik kamerayı yerleştirir: oyunun kendi 45° bakışı ve kahraman kamerasının uzaklığı (`uzaklik` 1)
   * korunur, yalnız dikey yarı kadraj (`kadraj`) sahneden gelir.
   */
  function bakisIzo(dt, camera, look, en) {
    const k = dt > 0 ? 1 - Math.exp(-dt * K.kamera.yumusatma) : 1;
    kadraj += (hedefKadraj - kadraj) * k;
    camera.left = -kadraj * en; camera.right = kadraj * en; camera.top = kadraj; camera.bottom = -kadraj;
    const u = K.kamera.uzaklik;
    camera.near = 1; camera.far = Math.hypot(24, 29, 24) * u + 400;
    camera.updateProjectionMatrix();
    camera.position.set(look.x + 24 * u, 29 * u, look.z + 24 * u);
    camera.lookAt(look.x, 0, look.z);
  }

  /** Kadraj elemesi (main.js görüş sınırı yerine): odaktan `gorus` birimden uzaktaki ağaç / eşya çizilmez. */
  const gorus = () => (x, z, pad = 0) => (x - odakNokta.x) ** 2 + (z - odakNokta.z) ** 2 <= (K.gorus + pad) ** 2;

  /** Sahnenin durumu (yalnız okuma; dumanı testi, çekim betiği ve hata ayıklama için). */
  const durum = () => (!sahne ? { evre: null, tur: 0, saniye: 0 } : {
    evre: sahne.evre, tur, saniye: +sahne.saniye.toFixed(2), kadraj: Math.round(kadraj),
    mancinik: { blue: taraflar.blue.mancinik.filter(e => e.alive).length, red: taraflar.red.mancinik.filter(e => e.alive).length },
    muhafiz: { blue: taraflar.blue.muhafiz.filter(e => e.alive).length, red: taraflar.red.muhafiz.filter(e => e.alive).length },
    akin: {
      ayakta: taraflar.red.akin.filter(e => e.alive).length,
      dovusen: taraflar.red.akin.filter(e => e.alive && e.brain).length,
      // Sütunun önünün `kanat` üstündeki yeri: akın başlamadan eksi (kadrajın altında), mancınıklara varınca ~0.
      on: +(() => { const e = akininOnu(); return e ? e.pos.x * kanat.x + e.pos.z * kanat.z : 0; })().toFixed(1),
    },
    /** Havadaki taş sayısı ve tur boyunca atılan toplam taş. */
    ucanTas: world.arrows.length, tas: sahne.tas, gunluk: sahne.gunluk,
    sag: { blue: taraflar.blue.mancinik.map(e => e.alive), red: taraflar.red.mancinik.map(e => e.alive) },
    /** Ölçülen anlar (sahne saati, sn): video kesiti ve müziğin vuruşları bunlara göre denetlenir. */
    ilkTas: +sahne.ilkTas.toFixed(2), yikilis: +sahne.yikilis.toFixed(2), carpisma: +sahne.carpisma.toFixed(2),
    kahramanGorunur: world.entities.some(e => e.isPlayer && e.view),
  });
  world.gosteriDurum = durum;
  // Çekim betiği (ajanlar/icerik/short-uret.mjs) sahnenin saatini buradan okur: her kare hangi saniyede
  // olduğumuz bilinir, yani görüntü müziğin vuruşlarıyla kare kare eşleşir.
  if (typeof window !== 'undefined') Object.defineProperty(window, '__gosteri', { configurable: true, get: durum });

  return { izometrik: true, kalite: K.kalite, basla, guncelle, odak, bakisIzo, gorus, durum };
}
