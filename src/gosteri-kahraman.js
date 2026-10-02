import * as T from 'three';
import { addEntity, applyLevelUp, createEntity, makeStats, setLodGoz } from './characters.js';
import { CHARGE, GOSTERI_KAHRAMAN as K } from './config.js';
import { touchDevice } from './touch.js';
import { setupGame, step } from './world.js';

/**
 * **Kahramanların gücü gösterisi** (`?gosteri=kahraman`, yalnız tarayıcıda): içerik videosu için sahnelenmiş tek bir
 * gösteri. `?gosteri=1`den (gosteri.js) farkı: bu bir maç değil, 10-14 sn'de bir sıfırlanıp tekrarlanan bir sahnedir.
 *  - Ortada **1000 düşman, hepsi seviye 1**: beyinleri yoktur (brain = null), yani kıpırdamaz, saldırmaz ve kahraman
 *    gelmeden dağılmazlar. Yalnız fizikleri açıktır: vakum onları merkeze çeker, dalgalar biçer ve savurur.
 *  - **Mızraklı Atlı** kahraman kalabalığın kenarından koşar, **zıplar** (oyunda Boşluk), havada alçalırken **sağ tık**
 *    atar (atılma + vakumlu kazık alanı; bkz. abilities.heroDash) ve **yere iner inmez** sol tıkı basılı tutup bırakır:
 *    mızrakta şarjlı vuruş, art arda gitgide uzayan **3 koridor dalgasıdır** (CHARGE.spear; bkz. abilities.heroCharged).
 *    Dalgalar o anki nişanı izlediği için nişan süpürülür ve koridorlar kalabalığı yelpaze gibi tarar. İkinci bir şarj
 *    daha atılır, yani bir turda **6 dalga** görünür.
 *  - Kamera 3B'dir (izometrik değil): zıplamada kahramanı yakından izler, inişte yarı yükseğe çekilip hem kalabalığın
 *    büyüklüğünü hem dalgaların boyunu kadraja alır ve yavaşça yörüngede döner. İnişte ve ilk dalgada kısa ağır çekim olur.
 *  - Ekranda yalnız bu sahneye özel, büyük bir açıklama yazısı durur (#mg-gosteri-yazi); yazıdaki tuşlar oyundakilerle
 *    birebir aynıdır (Boşluk zıplar, sağ tık atılma + alan, sol tık basılı şarj).
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
  let sahne = null, agir = 0, tur = 0, yapis = true;
  /** Kaç düşman: masaüstünde tam kadro, dokunmatikte azı (telefonda sahne yalnız çökmeden açılsın; bkz. config). */
  const kalabalikSayisi = touchDevice() ? K.kalabalik.telefon : K.kalabalik.sayi;

  /** Bir kez: dünya kurulur, sahne dışında kalan her şey (bot ordusu, haydut, kamp, rakip kahraman) sahadan kalkar. */
  function basla() {
    // 1000 birimle 60 fps için: uzaktaki birimde göz de çizilmez (birim başına iki çizim çağrısı; bkz. characters.js).
    setLodGoz(true);
    setupGame(world, {
      // İki koltuk da "insan": böylece hiçbir bot yapay zekâsı koşmaz (bkz. economy.js updateBots) ve iki kahraman da
      // yalnız girdiyle hareket eder — kahramana girdi verilir, rakibe hiç verilmez, yani o sancağında kıpırdamaz.
      teamSize: 1, humans: [{ name: 'Kahraman' }, { name: 'Rakip', faction: 'red' }],
      loadout: { ...K.kahraman.loadout }, seed: 1000 + Math.floor(Math.random() * 900000),
    });
    world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
    world.onEnd = null;
    // Gösteri birimleri yere ganimet / exp küresi bırakmaz ve karneye yazılmaz: 1000 ölüm sahayı eşyayla doldururdu.
    world.onDeath = () => {};
    // Haydut ve kamp yok: sahnede yalnız kahraman ve kalabalık olsun (ikisi de yapay zekâ koşturur, kadraja girerdi).
    world.camps.length = 0; world.banditTimer = Infinity;
    for (let i = world.entities.length - 1; i >= 0; i--) {
      const e = world.entities[i];
      if (e === world.player) continue;
      world.fx.removeEntity(e); world.entities.splice(i, 1);
    }
    kahramaniKur(world.player);
    arenaReady();
    // Savaş sisi kapalı: kamera nereye giderse gitsin saha görünür (bkz. fog.js, gosteri.js ile aynı).
    world.fog.enabled = false; world.fog.update(0, true);
    yerler = yerleriHesapla();
    tur = 0;
    diz();
  }

  /** Kahraman: Mızraklı Atlı seti ve sahne seviyesi (vuruş alanı, atılma mesafesi ve vakum yarıçapı seviyeyle büyür). */
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
   * doğurulur: her turda 1000 görünüm yeniden kurulmaz, tur geçişi takılmaz). Kahraman kalabalığın dışında, her turda
   * başka bir açıdan durur; kamera o yöne yapışır.
   */
  function diz() {
    const p = world.player;
    tur++;
    merkez.set(0, 0, 0);
    const yon = gelisYonu();

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

    agir = 0; yapis = true;
    sahne = {
      evre: 'hazir', t: 0, yon, sagTikti: false, ziplama: 1,
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

  /** Yeni bir gösteri birimi: seviye 1 düşman, sahibi yok (ayak halkası çizilmez), **beyni yok** (kıpırdamaz). */
  function birimDogur() {
    const C = K.kalabalik, tip = C.turler[Math.floor(Math.random() * C.turler.length)];
    const e = createEntity({ faction: 'red', owner: null, loadout: { weapon: tip, shield: false, horse: false } });
    e.brain = null; e.gosteriBirim = true; e.vision = 0;
    // Fizik yarıçapı küçültülür (görünüm aynı kalır): PHYSICS.unitSpacing ile sıkı bir kalabalık ancak böyle durur.
    e.radius = C.carpismaYaricap;
    addEntity(world, e);
    return e;
  }

  /** Bir gösteri birimini yeni turda ayağa kaldırır: ölüyse dirilir, canı dolar, yerine ve yönüne oturur. */
  function dirilt(e, x, z, facing) {
    e.alive = true; e.hp = e.stats.maxHp; e.deathTimer = 0; e.hitFlash = 0; e.stun = 0;
    e.attackTimer = 0; e.cooldown = 0; e.didHit = false; e.spawnTimer = 0;
    e.pos.set(x, 0, z); e.vel.set(0, 0, 0); e.push.set(0, 0, 0); e.moveDir.set(0, 0, 0);
    e.jumpY = 0; e.vy = 0; e.facing = facing;
  }

  // ---- Sahnenin akışı

  /** Kahramanın bu karedeki girdisi (çözülmüş biçimde, bkz. hero.js applyHeroInput). Evreye göre kurulur. */
  function girdi() {
    const p = world.player, inp = world.me.input, s = sahne;
    // Kenar bayrakları (jq / dq / ar) burada sıfırlanmaz: onları evreler kurar, applyHeroInput okuyunca kendisi düşürür.
    inp.ha = true; inp.dm = false; inp.ly = false;
    const kosuyor = s.evre === 'kosu' || s.evre === 'ucus';
    if (kosuyor) {
      const dx = merkez.x - p.pos.x, dz = merkez.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
      inp.mv[0] = dx / d; inp.mv[1] = dz / d; inp.sp = true;
    } else { inp.mv[0] = 0; inp.mv[1] = 0; inp.sp = false; }

    // Nişan: koşu ve uçuşta kalabalığın merkezi, dalgalarda süpürülen koridorun ucu.
    if (s.evre === 'dalga1' || s.evre === 'dalga2' || s.evre === 'sarj1' || s.evre === 'sarj2') {
      const a = nisanAcisi(s);
      inp.aim[0] = p.pos.x + Math.sin(a) * 24; inp.aim[1] = p.pos.z + Math.cos(a) * 24;
    } else { inp.aim[0] = merkez.x; inp.aim[1] = merkez.z; }

    inp.ah = s.evre === 'sarj1' || s.evre === 'sarj2';
  }

  /**
   * Şarjın / dalganın o anki nişan açısı: koridor `supurme` açısından başlar ve dalgalar boyunca `genislik` kadar
   * süpürülür. İkinci şarj kalabalığın öbür yanını tarasın diye `supurme.ikinci` kadar döndürülmüştür.
   */
  function nisanAcisi(s) {
    const ikinci = s.evre === 'sarj2' || s.evre === 'dalga2';
    const k = s.evre === 'dalga1' || s.evre === 'dalga2' ? Math.min(1, s.t / K.supurme.sure) : 0;
    return supurmeTabani(s, ikinci) + k * K.supurme.genislik * (Math.PI / 180);
  }
  /** Bir şarjın koridorlarının başlangıç açısı (dünya uzayında). */
  function supurmeTabani(s, ikinci) {
    return s.yon + Math.PI + (s.supurme + (ikinci ? K.supurme.ikinci : 0)) * (Math.PI / 180);
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
        // çıkar ve havada kalma süresi uzar, yani kalabalığın üstünden tam ortaya süzülür.
        if (s.ziplama < 2 && p.vy <= 0 && s.t > 0.1) { world.me.input.jq = true; s.ziplama = 2; }
        // İnişin son metresinde sağ tık: atılma imlece (merkeze) doğru fırlatır, kazık alanı + vakum orada açılır.
        else if (!s.sagTikti && s.ziplama >= 2 && p.vy < 0 && p.jumpY > 0 && p.jumpY <= K.sagTikYukseklik) { world.me.input.dq = true; s.sagTikti = true; }
        if ((p.jumpY <= 0 && s.t > 0.2) || s.t >= K.evre.ucusEnCok) { agir = Math.max(agir, K.agir.inis); gec('inis'); }
        break;
      case 'inis':
        if (s.t >= K.evre.inis) { gec('sarj1'); s.yazi = K.yazi.dalga; }
        break;
      case 'sarj1': case 'sarj2':
        // Sol tık basılı: şarj CHARGE.delay sonra başlar, CHARGE.full sn'de dolar. Dolunca bırakılır (ar) ve
        // mızrağın şarjlı vuruşu çıkar: 3 koridor dalgası (bkz. abilities.heroCharged).
        if ((p.charging && p.charge >= 1) || s.t >= K.evre.sarjEnCok) {
          world.me.input.ah = false; world.me.input.ar = true;
          if (s.evre === 'sarj1') { agir = Math.max(agir, K.agir.dalga); gec('dalga1'); } else gec('dalga2');
        }
        break;
      case 'dalga1':
        if (s.t >= K.evre.dalga) gec('sarj2');
        break;
      case 'dalga2':
        if (s.t >= K.evre.dalga) gec('bitis');
        break;
      case 'bitis':
        if (s.t >= K.evre.bitis) diz();
        break;
      default: break;
    }
  }
  function gec(evre) { sahne.evre = evre; sahne.t = 0; }

  /** Her kare: girdi kurulur, simülasyon (ağır çekimde yavaşlamış) bir adım atar, evreler ve yazı güncellenir. */
  function guncelle(dt) {
    if (!sahne || !world.running) return;
    const olcek = agir > 0 ? K.agir.olcek : 1;
    agir = Math.max(0, agir - dt);
    const sdt = dt * olcek;
    girdi();
    step(world, sdt);
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

  /**
   * Kameranın baktığı nokta: zıplamaya kadar kahramanın kendisi, inişten sonra kahramanla kalabalığın merkezi arası
   * (dalgaların boyu ve yığının büyüklüğü birlikte kadraja girsin). Tur kurulurken hedefe yapışır, sonra yumuşak kayar.
   */
  function odak(dt) {
    if (!sahne) return odakNokta;
    const p = world.player, genis = sahne.evre !== 'hazir' && sahne.evre !== 'kosu' && sahne.evre !== 'ucus';
    const k = genis ? 0.45 : 0;
    hedefOdak.set(p.pos.x + (merkez.x - p.pos.x) * k, 0, p.pos.z + (merkez.z - p.pos.z) * k);
    if (yapis) { odakNokta.copy(hedefOdak); yapis = false; }
    else if (dt > 0) odakNokta.lerp(hedefOdak, 1 - Math.exp(-dt * K.kamera.odakYumusatma));
    return odakNokta;
  }

  /**
   * 3B kamerayı yerleştirir (izometrik değil): odağın arkasında, `dist` birim geride ve `pitch` eğimle yukarıda.
   * Zıplamada yakın ve alçak, inişten sonra geniş ve yarı yüksektir; dalgalar boyunca yavaşça yörüngede döner.
   */
  function bakis(dt, camera, look) {
    if (!sahne) return;
    const genis = sahne.evre !== 'hazir' && sahne.evre !== 'kosu' && sahne.evre !== 'ucus';
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
    evre: sahne ? sahne.evre : null, tur, yazi: sahne ? sahne.yazi : '', agir: agir > 0,
    kalabalik: world.entities.filter(e => e.gosteriBirim).length,
    ayakta: world.entities.filter(e => e.gosteriBirim && e.alive).length,
    seviye: world.player ? world.player.level : 0,
    dalga: CHARGE.spear.shots,
  });

  // Sahnenin durumu dünyadan da okunabilir (globalThis.__meadow.gosteriDurum()): dumanı testi buradan bakar.
  world.gosteriDurum = durum;

  return { kamera3b: true, lod: K.lod, kalite: K.kalite, basla, guncelle, odak, bakis, gorus, durum };
}
