import * as T from 'three';
import { addEntity, applyLevelUp, createEntity, makeStats, setLodGoz } from './characters.js';
import { CHARGE, GOSTERI_KAHRAMAN as K } from './config.js';
import { touchDevice } from './touch.js';
import { setupGame, step } from './world.js';

/**
 * **Kahramanların gücü gösterisi** (`?gosteri=kahraman`, yalnız tarayıcıda): içerik videosu için sahnelenmiş tek bir
 * gösteri. `?gosteri=1`den (gosteri.js) farkı: bu bir maç değil, her turda sıfırlanıp tekrarlanan bir sahnedir.
 *  - Ortada sıkı bir kalabalık (K.kalabalik.sayi düşman, **hepsi seviye 1 kalkansız kılıçlı**): tur başında beyinleri
 *    yoktur (brain = null), yani kıpırdamaz, saldırmaz ve kahraman gelmeden dağılmazlar — zıplayış ve ilk vuruş
 *    temiz görünsün diye.
 *  - **Atlı Okçu** kahraman kalabalığın kenarından koşar, **zıplar** (oyunda Boşluk), tepede bir daha zıplar, alçalırken
 *    **sağ tık** atar (atılma + vakumlu **ok yağmuru**; bkz. abilities.heroDash) ve ikinci zıplamadan sonra sol tıkı
 *    **havada** basılı tutar: şarj (CHARGE.delay + full = 0.82 sn) yere değerken dolduğu için **iner inmez** yayın
 *    şarjlı vuruşu çıkar — 5 atışlık **hızlı yaylım** (CHARGE.bow; bkz. abilities.heroCharged). Yaylım o anki nişanı
 *    izlediği için nişan süpürülür ve oklar çevreyi yelpaze gibi tarar.
 *  - **İlk yaylımdan sonra kalabalığın beyni açılır**: askerler kahramana koşup saldırır (hazır bir `attack` emriyle,
 *    bkz. `beyinleriTazele`). Kahramandan K.beyin.yaricap biriminden uzaktakiler yerinde durur: yapay zekâyı kadrajın
 *    dışında koşturmamak için.
 *  - **Çevrim tekrar eder**: zıpla → ok yağmuru → in → yaylım, bir turda K.tekrar kez. Her çevrimde kahraman
 *    kalabalığın o anki **en sık** noktasına (bkz. `yogunNokta`) zıplar, yani tur boyunca yerde oyalanmaz ve tur
 *    sonunda kalabalık neredeyse tamamen ölmüş olur (ölçümde 500 birimden 1-5 tanesi ayakta kalıyor).
 *  - Kamera 3B'dir (izometrik değil): zıplamada kahramanı yakından izler, inişte yarı yükseğe çekilip hem kalabalığın
 *    büyüklüğünü hem ok yağmurunu kadraja alır ve yavaşça yörüngede döner. Ağır çekim turda yalnız bir kez, ilk
 *    yaylımda ve kısadır (Yusuf "daha hareketli" istedi).
 *  - Ekranda yalnız bu sahneye özel, büyük bir açıklama yazısı durur (#mg-gosteri-yazi); yazıdaki tuşlar oyundakilerle
 *    birebir aynıdır (Boşluk zıplar, sağ tık atılma + ok yağmuru, sol tık basılı şarj).
 *  - Her turda açı, kahramanın geliş yönü ve dizilişin tohumu değişir: art arda çekilen turlar birbirinin kopyası olmaz.
 * Arayüzün gizlenmesi, girdinin okunmaması, ölçümün gitmemesi ve sunucuya bağlanılmaması `?gosteri=1` ile ortaktır
 * (bkz. main.js, style.css `.gosteri`). `?gosteri=1` ve normal oyun bu dosyadan hiç etkilenmez.
 */
export function createKahramanGosteri(world, { arenaReady, root }) {
  world.gosteri = true;
  const yaziEl = root.querySelector('#mg-gosteri-yazi');
  const merkez = new T.Vector3(), hedefOdak = new T.Vector3(), odakNokta = new T.Vector3();
  const kam = { dist: K.kamera.genis.dist, pitch: K.kamera.genis.pitch, bakisY: K.kamera.genis.bakisY, yaw: 0 };
  /** Kalabalığın yerleri: tur başında bir kez hesaplanır (engele düşenler atlanır), her turda yeniden karılır. */
  let yerler = [];
  let sahne = null, agir = 0, tur = 0, yapis = true, beyinAcik = false, uyanma = 0;
  /**
   * Bütün askerlerin paylaştığı tek saldırı emri: hedefi kahramandır. Tek nesne olması bilinçli — ai.js emri yalnız
   * okur, her askere ayrı nesne kurmak yüzlerce birimde boşa çöp üretirdi.
   */
  const emir = { kind: 'attack', target: null };
  /** Kaç düşman: masaüstünde tam kadro, dokunmatikte azı (telefonda sahne yalnız çökmeden açılsın; bkz. config). */
  const kalabalikSayisi = touchDevice() ? K.kalabalik.telefon : K.kalabalik.sayi;

  /** Bir kez: dünya kurulur, sahne dışında kalan her şey (bot ordusu, haydut, kamp, rakip kahraman) sahadan kalkar. */
  function basla() {
    // Kalabalıkla 60 fps için: uzaktaki birimde göz de çizilmez (birim başına iki çizim çağrısı; bkz. characters.js).
    setLodGoz(true);
    setupGame(world, {
      // İki koltuk da "insan": böylece hiçbir bot yapay zekâsı koşmaz (bkz. economy.js updateBots) ve iki kahraman da
      // yalnız girdiyle hareket eder — kahramana girdi verilir, rakibe hiç verilmez, yani o sancağında kıpırdamaz.
      teamSize: 1, humans: [{ name: 'Kahraman' }, { name: 'Rakip', faction: 'red' }],
      loadout: { ...K.kahraman.loadout }, seed: 1000 + Math.floor(Math.random() * 900000),
    });
    world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
    world.onEnd = null;
    // Gösteri birimleri yere ganimet / exp küresi bırakmaz ve karneye yazılmaz: yüzlerce ölüm sahayı eşyayla doldururdu.
    world.onDeath = () => {};
    // Haydut ve kamp yok: sahnede yalnız kahraman ve kalabalık olsun (ikisi de yapay zekâ koşturur, kadraja girerdi).
    world.camps.length = 0; world.banditTimer = Infinity;
    for (let i = world.entities.length - 1; i >= 0; i--) {
      const e = world.entities[i];
      if (e === world.player) continue;
      world.fx.removeEntity(e); world.entities.splice(i, 1);
    }
    kahramaniKur(world.player);
    emir.target = world.player;
    arenaReady();
    // Savaş sisi kapalı: kamera nereye giderse gitsin saha görünür (bkz. fog.js, gosteri.js ile aynı).
    world.fog.enabled = false; world.fog.update(0, true);
    yerler = yerleriHesapla();
    tur = 0;
    diz();
  }

  /** Kahraman: Atlı Okçu seti ve sahne seviyesi (yağmur alanı, atılma mesafesi, vakum yarıçapı ve ok sayısı seviyeyle büyür). */
  function kahramaniKur(p) {
    p.loadout = { ...K.kahraman.loadout };
    p.stats = makeStats(p.loadout, true);
    p.radius = p.stats.radius; p.invMass = p.stats.invMass;
    for (let i = 1; i < K.kahraman.seviye; i++) applyLevelUp(p);
    p.hp = p.stats.maxHp;
    world.fx.refreshEntity(p);
  }

  /**
   * Kalabalığın duracağı yerler: merkezde altıgen ızgara (satırlar yarım aralık kaydırılır, yani gerçek bir paket olur),
   * engele (ağaç, kaya, ev) düşen yerler atlanır ve merkeze en yakın olanlar başa alınır. Ağaçların yeri sahne boyunca
   * değişmediği için bu bir kez hesaplanır; kalabalık her turda bu listenin ilk `sayi` tanesine dizilir.
   */
  function yerleriHesapla() {
    const C = K.kalabalik, a = C.aralik, satir = a * 0.866, pay = C.carpismaYaricap;
    const out = [];
    for (let j = -Math.ceil(C.yaricap / satir); j <= Math.ceil(C.yaricap / satir); j++) {
      const z = j * satir, kaydir = (j & 1) ? a / 2 : 0;
      for (let i = -Math.ceil(C.yaricap / a); i <= Math.ceil(C.yaricap / a); i++) {
        const x = i * a + kaydir, d2 = x * x + z * z;
        if (d2 > C.yaricap * C.yaricap) continue;
        if (world.obstacles.some(o => (o.pos.x - x) ** 2 + (o.pos.z - z) ** 2 < (o.radius + pay) ** 2)) continue;
        out.push({ x, z, d2 });
      }
    }
    out.sort((p, q) => p.d2 - q.d2);
    return out;
  }

  /**
   * Bir turun dizilişi. Kalabalık merkezden dışa doğru doldurulur (sağ kalanlar yerinden oynatılır, eksik kalanlar
   * doğurulur: her turda yüzlerce görünüm yeniden kurulmaz, tur geçişi takılmaz). Kahraman kalabalığın dışında, her turda
   * başka bir açıdan durur; kamera o yöne yapışır. Beyinler yeniden kapatılır: tur ilk zıplamaya kadar hareketsizdir.
   */
  function diz() {
    const p = world.player;
    tur++;
    merkez.set(0, 0, 0);
    const yon = gelisYonu();
    beyinAcik = false; uyanma = 0;

    // Sahadaki gösteri birimleri: ölüler de dirilir (görünümleri duruyor), eksik kalan kadarı doğurulur.
    const liste = world.entities.filter(e => e.gosteriBirim);
    for (let i = liste.length; i < kalabalikSayisi; i++) liste.push(birimDogur());
    liste.forEach((e, i) => {
      const y = yerler[i % yerler.length];
      dirilt(e, y.x, y.z, Math.atan2(-y.x, -y.z));
    });

    // Kahraman: kalabalığın dışında, merkeze bakar; sayaçları ve girdisi sıfırlanır.
    const hx = Math.sin(yon) * K.baslangic, hz = Math.cos(yon) * K.baslangic;
    p.pos.set(hx, 0, hz); p.vel.set(0, 0, 0); p.push.set(0, 0, 0); p.moveDir.set(0, 0, 0);
    p.hp = p.stats.maxHp; p.alive = true; p.deathTimer = 0; p.jumpY = 0; p.vy = 0; p.airJumps = 0;
    p.dodgeCd = 0; p.dodgeTimer = 0; p.invuln = 0; p.stun = 0; p.attackTimer = 0; p.cooldown = 0;
    p.charging = false; p.charge = 0; p.aimLocked = false;
    p.facing = Math.atan2(-hx, -hz); p.aim.set(0, 0, 0);
    Object.assign(world.me.input, { mv: [0, 0], aim: [0, 0], ha: false, sp: false, aq: false, ah: false, ar: false, dq: false, jq: false, heldAt: -1 });
    for (const z of world.zones) world.fx.removeZone(z);
    world.zones.length = 0;
    // Havadaki oklar da silinir: yaylımda yüzlerce ok uçuyor, tur geçişinde ekranda asılı kalmasınlar.
    for (const a of world.arrows) world.fx.removeArrow(a);
    world.arrows.length = 0;

    agir = 0; yapis = true;
    sahne = {
      evre: 'hazir', t: 0, yon, sagTikti: false, ziplama: 1, sarjTutuyor: false, cevrim: 1,
      // Kamera açısı her turda hafif değişir: art arda çekilen turlar birbirinin kopyası olmasın.
      yaw0: yon + Math.PI + (Math.random() - 0.5) * 2 * K.kamera.sapma,
      supurme: K.supurme.ilk + (Math.random() - 0.5) * 30,
      yazi: K.yazi.zipla,
    };
    kam.yaw = sahne.yaw0;
    hedefOdak.set(p.pos.x, 0, p.pos.z);
    odakNokta.copy(hedefOdak);
    yaz();
  }

  /**
   * Kahramanın bu turdaki geliş yönü: rastgele bir açı denenir ve koşu hattı (başlangıçtan merkeze doğru ilk birkaç
   * birim) ağaçsız olana kadar yeniden seçilir — kahraman koşarken bir ağaca takılıp zıplamayı kaçırmasın.
   */
  function gelisYonu() {
    for (let deneme = 0; deneme < 40; deneme++) {
      const a = Math.random() * Math.PI * 2;
      let temiz = true;
      for (let d = K.baslangic; d >= K.baslangic - 10 && temiz; d -= 2) {
        const x = Math.sin(a) * d, z = Math.cos(a) * d;
        if (world.obstacles.some(o => (o.pos.x - x) ** 2 + (o.pos.z - z) ** 2 < (o.radius + 2.2) ** 2)) temiz = false;
      }
      if (temiz) return a;
    }
    return Math.random() * Math.PI * 2;
  }

  /**
   * Yeni bir gösteri birimi: **seviye 1 kalkansız kılıçlı**, sahibi yok (ayak halkası çizilmez), tur başında **beyni
   * kapalı** (kıpırdamaz). Beyni hazır kurulur ama takılmaz: ilk yaylımdan sonra `beyinleriTazele` takar.
   */
  function birimDogur() {
    const C = K.kalabalik, tip = C.turler[Math.floor(Math.random() * C.turler.length)];
    const e = createEntity({ faction: 'red', owner: null, loadout: { weapon: tip, shield: false, horse: false } });
    e.gosteriBirim = true; e.vision = 0;
    e.gosteriBeyin = { mode: 'hold', timer: 0, target: null, retarget: 0, home: { x: 0, z: 0 }, order: null };
    e.brain = null;
    // Fizik yarıçapı küçültülür (görünüm aynı kalır): PHYSICS.unitSpacing ile sıkı bir kalabalık ancak böyle durur.
    e.radius = C.carpismaYaricap;
    addEntity(world, e);
    return e;
  }

  /** Bir gösteri birimini yeni turda ayağa kaldırır: ölüyse dirilir, canı dolar, yerine ve yönüne oturur, beyni kapanır. */
  function dirilt(e, x, z, facing) {
    e.alive = true; e.hp = e.stats.maxHp; e.deathTimer = 0; e.hitFlash = 0; e.stun = 0;
    e.attackTimer = 0; e.cooldown = 0; e.didHit = false; e.spawnTimer = 0;
    e.pos.set(x, 0, z); e.vel.set(0, 0, 0); e.push.set(0, 0, 0); e.moveDir.set(0, 0, 0);
    e.jumpY = 0; e.vy = 0; e.facing = facing;
    e.lastHitBy = null; e.alarmBy = null;
    e.brain = null;
    const b = e.gosteriBeyin;
    b.timer = 0; b.target = null; b.retarget = 0; b.order = null; b.home.x = x; b.home.z = z;
  }

  // ---- Sahnenin akışı

  /**
   * Askerlerin beyni (yalnız `beyinAcik` olduğunda). Kahramana yarıçap kadar yakın olana hazır `attack` emri takılır —
   * ai.js o dalda hedef **aramaz**, doğrudan kahramana yürüyüp menzile girince vurur, yani birim başına maliyet
   * sabittir. Uzaktakinin beyni sökülür (yerinde durur): kadrajın dışındaki yapay zekâ boşa yüktür.
   * Yarıçap ilk yaylımda sıfırdan K.beyin.yaricap'a K.beyin.uyanma saniyede büyür: bütün kalabalık aynı karede
   * hareket etmeye başlarsa (yüzlerce birim birden yürümeye ve ölmeye başlar) kare hızı o anda çöküyordu. Yavaş
   * büyüyen yarıçap hem yükü yayar hem de kahramandan dışa doğru yayılan bir "uyanma dalgası" gibi görünür.
   */
  function beyinleriTazele(dt) {
    if (!beyinAcik) return;
    uyanma = Math.min(K.beyin.uyanma, uyanma + dt);
    const p = world.player, r = K.beyin.yaricap * (uyanma / K.beyin.uyanma), r2 = r * r;
    for (const e of world.entities) {
      if (!e.gosteriBirim) continue;
      const yakin = e.alive && (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2 <= r2;
      if (yakin) { const b = e.gosteriBeyin; b.order = emir; e.brain = b; }
      else if (e.brain) { e.brain = null; e.moveDir.set(0, 0, 0); }
    }
  }

  /**
   * Kalabalığın o anki **en sık** noktası: yaşayan birimler kaba bir ızgaraya (6 birimlik göz) atılır ve en kalabalık
   * gözün ağırlık merkezi döner. Bir çevrimde bir kez çağrılır, maliyeti O(n)'dir. Kahraman her çevrimde buraya
   * zıplar, yani ok yağmuru hep dolu bir yere iner ve kadrajda hep çarpışma olur.
   */
  function yogunNokta() {
    const goz = 6, kutular = new Map();
    for (const e of world.entities) {
      if (!e.gosteriBirim || !e.alive) continue;
      const anahtar = Math.floor(e.pos.x / goz) * 1009 + Math.floor(e.pos.z / goz);
      const c = kutular.get(anahtar);
      if (c) { c.n++; c.x += e.pos.x; c.z += e.pos.z; } else kutular.set(anahtar, { n: 1, x: e.pos.x, z: e.pos.z });
    }
    let iyi = null;
    for (const c of kutular.values()) if (!iyi || c.n > iyi.n) iyi = c;
    return iyi ? { x: iyi.x / iyi.n, z: iyi.z / iyi.n } : { x: 0, z: 0 };
  }

  /** Kahramanın bu karedeki girdisi (çözülmüş biçimde, bkz. hero.js applyHeroInput). Evreye göre kurulur. */
  function girdi() {
    const p = world.player, inp = world.me.input, s = sahne;
    // Kenar bayrakları (jq / dq / ar) burada sıfırlanmaz: onları evreler kurar, applyHeroInput okuyunca kendisi düşürür.
    inp.ha = true; inp.dm = false; inp.ly = false;
    // Koşu: kalabalığın hedef noktasına. Uçuşta da sürer (havada yön verilir), iki çevrim arasında da (yerde oyalanma yok).
    const kosuyor = s.evre === 'kosu' || s.evre === 'ucus' || s.evre === 'ara';
    if (kosuyor) {
      const dx = merkez.x - p.pos.x, dz = merkez.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
      inp.mv[0] = dx / d; inp.mv[1] = dz / d; inp.sp = true;
    } else { inp.mv[0] = 0; inp.mv[1] = 0; inp.sp = false; }

    // Nişan: koşu ve uçuşta hedef nokta (sağ tık oraya atılır), iniş ve yaylımda süpürülen yelpazenin ucu.
    if (s.evre === 'inis' || s.evre === 'yaylim') {
      const a = nisanAcisi(s);
      inp.aim[0] = p.pos.x + Math.sin(a) * 12; inp.aim[1] = p.pos.z + Math.cos(a) * 12;
    } else { inp.aim[0] = merkez.x; inp.aim[1] = merkez.z; }

    inp.ah = s.sarjTutuyor;
  }

  /**
   * Yaylımın o anki nişan açısı: yelpaze `supurme` açısından başlar ve beş atış boyunca `genislik` kadar süpürülür.
   * Süpürme `sure` saniyede biter (CHARGE.bow: 5 x 0.12 sn), yani beş yaylım üst üste binmez, çevreyi tarar.
   */
  function nisanAcisi(s) {
    const k = s.evre === 'yaylim' ? Math.min(1, s.t / K.supurme.sure) : 0;
    return s.yon + Math.PI + (s.supurme + k * K.supurme.genislik) * (Math.PI / 180);
  }

  /** Evre geçişleri (simülasyon saniyesiyle). Üst sınırlar güvenliktir: beklenen olay gelmezse sahne takılı kalmaz. */
  function evreler(dt) {
    const p = world.player, s = sahne;
    s.t += dt;
    switch (s.evre) {
      case 'hazir':
        if (s.t >= K.evre.hazir) gec('kosu');
        break;
      case 'kosu':
        // Koşunun sonunda zıplama (oyunda Boşluk): havada çarpışma yoktur, kahraman kalabalığın üstünden içeri süzülür.
        if (s.t >= K.evre.kosu) { world.me.input.jq = true; gec('ucus'); }
        break;
      case 'ucus':
        // Tepe noktasında **ikinci zıplama** (oyunda Boşluk'a bir daha basmak, bkz. JUMP_AIR): kahraman daha yükseğe
        // çıkar ve havada kalma süresi uzar. Aynı anda sol tık basılı tutulmaya başlar: şarj (0.82 sn) iniş anında
        // dolsun ki yaylım yere değer değmez çıksın, kahraman şarj için yerde beklemesin.
        if (s.ziplama < 2 && p.vy <= 0 && s.t > 0.1) { world.me.input.jq = true; s.ziplama = 2; s.sarjTutuyor = true; }
        // İnişin son metresinde sağ tık: atılma imlece (hedef noktaya) doğru fırlatır, ok yağmuru + vakum orada açılır.
        else if (!s.sagTikti && s.ziplama >= 2 && p.vy < 0 && p.jumpY > 0 && p.jumpY <= K.sagTikYukseklik) { world.me.input.dq = true; s.sagTikti = true; }
        if ((p.jumpY <= 0 && s.t > 0.2) || s.t >= K.evre.ucusEnCok) gec('inis');
        break;
      case 'inis':
        // Şarj dolar dolmaz (çoğu zaman iniş karesinde) sol tık bırakılır: yayın şarjlı vuruşu, 5 atışlık hızlı yaylım.
        if ((p.charging && p.charge >= 0.98) || s.t >= K.evre.inisEnCok) {
          world.me.input.ah = false; world.me.input.ar = true; s.sarjTutuyor = false;
          // Askerler ilk saldırıdan **sonra** canlanır: ilk yaylımda beyinler açılır ve kahramana koşarlar.
          if (s.cevrim === 1) { agir = Math.max(agir, K.agir.ilkYaylim); beyinAcik = true; }
          s.yazi = K.yazi.dalga;
          gec('yaylim');
        }
        break;
      case 'yaylim':
        if (s.t >= K.evre.yaylim) {
          if (s.cevrim >= K.tekrar) gec('bitis');
          else { yeniCevrim(); gec('ara'); }
        }
        break;
      case 'ara':
        // Yerde oyalanma yok: kısa bir koşu, hemen yeniden zıplama.
        if (s.t >= K.evre.ara) { world.me.input.jq = true; gec('ucus'); }
        break;
      case 'bitis':
        if (s.t >= K.evre.bitis) diz();
        break;
      default: break;
    }
  }
  function gec(evre) { sahne.evre = evre; sahne.t = 0; }

  /** Bir sonraki zıpla → ok yağmuru → in → yaylım çevrimi: hedef kalabalığın en sık noktası, yelpaze bir adım döner. */
  function yeniCevrim() {
    const s = sahne;
    s.cevrim++;
    s.sagTikti = false; s.ziplama = 1; s.sarjTutuyor = false;
    s.supurme += K.supurme.adim;
    const n = yogunNokta();
    merkez.set(n.x, 0, n.z);
  }

  /** Her kare: beyinler tazelenir, girdi kurulur, simülasyon (ağır çekimde yavaşlamış) bir adım atar, evreler ve yazı güncellenir. */
  function guncelle(dt) {
    // `paused` da denetlenir: görüntü bağlamı düşünce (telefonda görüntü belleği dolunca) oyun durur, sahne de
    // durmalı — yoksa ekran donmuşken simülasyon koşmaya devam eder (bkz. main.js webglcontextlost).
    if (!sahne || !world.running || world.paused) return;
    const olcek = agir > 0 ? K.agir.olcek : 1;
    agir = Math.max(0, agir - dt);
    const sdt = dt * olcek;
    beyinleriTazele(sdt);
    girdi();
    step(world, sdt);
    // Kahraman düşmez: askerler artık ona saldırıyor ama "DÜŞTÜN!" ekranı içerik kurallarında yasak ve sahne tur
    // ortasında kesilirdi. Can her karede doldurulur; vuruş parlaması kalır, yani dövüş görünür.
    const p = world.player;
    if (!p.alive) { p.alive = true; p.deathTimer = 0; }
    if (p.hp < p.stats.maxHp) p.hp = p.stats.maxHp;
    evreler(sdt);
    yaz();
  }

  /** Ekrandaki açıklama yazısı (yalnız bu sahnede; yeri için bkz. style.css `#mg-gosteri-yazi`). */
  function yaz() {
    if (!yaziEl) return;
    const metin = sahne ? sahne.yazi : '';
    if (yaziEl.textContent !== metin) yaziEl.textContent = metin;
    yaziEl.hidden = !metin;
  }

  /** Kamera geniş kadrajda mı: yerdeyken (iniş, yaylım, bitiş) geniş, koşu ve uçuşta kahramanın yanında. */
  const genisKadraj = s => s.evre === 'inis' || s.evre === 'yaylim' || s.evre === 'bitis';

  /**
   * Kameranın baktığı nokta: koşu ve uçuşta kahramanın kendisi, inişten sonra kahramanla hedef noktanın arası
   * (okların yağışı ve yığının büyüklüğü birlikte kadraja girsin). Tur kurulurken hedefe yapışır, sonra yumuşak kayar.
   */
  function odak(dt) {
    if (!sahne) return odakNokta;
    const p = world.player, k = genisKadraj(sahne) ? 0.3 : 0;
    hedefOdak.set(p.pos.x + (merkez.x - p.pos.x) * k, 0, p.pos.z + (merkez.z - p.pos.z) * k);
    if (yapis) { odakNokta.copy(hedefOdak); yapis = false; }
    else if (dt > 0) odakNokta.lerp(hedefOdak, 1 - Math.exp(-dt * K.kamera.odakYumusatma));
    return odakNokta;
  }

  /**
   * 3B kamerayı yerleştirir (izometrik değil): odağın arkasında, `dist` birim geride ve `pitch` eğimle yukarıda.
   * Zıplamada yakın ve alçak, inişten sonra geniş ve yarı yüksektir; yaylım boyunca yavaşça yörüngede döner.
   */
  function bakis(dt, camera, look) {
    if (!sahne) return;
    const genis = genisKadraj(sahne);
    const hedef = genis ? K.kamera.genis : K.kamera.yaklasma;
    const k = dt > 0 ? 1 - Math.exp(-dt * K.kamera.yumusatma) : 1;
    kam.dist += (hedef.dist - kam.dist) * k;
    kam.pitch += (hedef.pitch - kam.pitch) * k;
    kam.bakisY += (hedef.bakisY - kam.bakisY) * k;
    if (genis) kam.yaw += K.kamera.donus * dt;
    const yatay = Math.cos(kam.pitch) * kam.dist;
    camera.position.set(look.x - Math.sin(kam.yaw) * yatay, Math.sin(kam.pitch) * kam.dist + kam.bakisY, look.z - Math.cos(kam.yaw) * yatay);
    camera.lookAt(look.x, kam.bakisY, look.z);
  }

  /** Kadraj elemesi (main.js görüş sınırı yerine): odaktan `gorus` birimden uzaktaki hiçbir şey çizilmez. */
  const gorus = () => (x, z, pad = 0) => (x - odakNokta.x) ** 2 + (z - odakNokta.z) ** 2 <= (K.gorus + pad) ** 2;

  /** Sahnenin durumu (yalnız okuma; dumanı testi ve hata ayıklama için). */
  const durum = () => ({
    evre: sahne ? sahne.evre : null, tur, cevrim: sahne ? sahne.cevrim : 0, yazi: sahne ? sahne.yazi : '', agir: agir > 0,
    beyin: beyinAcik,
    kalabalik: world.entities.filter(e => e.gosteriBirim).length,
    ayakta: world.entities.filter(e => e.gosteriBirim && e.alive).length,
    kosan: world.entities.filter(e => e.gosteriBirim && e.alive && e.brain).length,
    seviye: world.player ? world.player.level : 0,
    yaylim: CHARGE.bow.shots, tekrar: K.tekrar,
  });

  // Sahnenin durumu dünyadan da okunabilir (globalThis.__meadow.gosteriDurum()): dumanı testi buradan bakar.
  world.gosteriDurum = durum;

  return { kamera3b: true, lod: K.lod, kalite: K.kalite, basla, guncelle, odak, bakis, gorus, durum };
}
