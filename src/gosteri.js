import * as T from 'three';
import { giveOrder } from './ai.js';
import { yawFromDir } from './builders.js';
import { GOSTERI } from './config.js';
import { spawnUnit } from './economy.js';
import { nearestEnemyBanner } from './players.js';
import { isApp } from './platform.js';
import { setupGame, step } from './world.js';

/**
 * **Gösteri kipi** (`?gosteri=1`): içerik klipleri için "kendi kendine oynayan" maç. Yalnız tarayıcıda açılır, oyunun
 * normal davranışına hiç dokunmaz.
 *  - Menü atlanır, doğrudan bot-bot maç başlar: hiç insan oyuncu yoktur, iki tarafı da mevcut bot yapay zekâsı yönetir
 *    (bkz. players.js createPlayers — humans boş, economy.js updateBots iki takımı da sürer).
 *  - İki tarafa bol kaynak ve hazır birlik verilir, birlikler iki üssün arasındaki cephe hattına dizilir ve oyun iki kat
 *    hızda koşar: ilk saniyelerde ekranda çatışma olur.
 *  - Kamera en kalabalık çatışmayı yumuşak geçişle takip eder (kadraj biraz daha yakın).
 *  - Arayüz gizlidir (bkz. style.css `.gosteri`), savaş sisi kapalıdır: kamera nereye giderse gitsin saha görünür.
 *  - Ölçüm (olcum.js) ve ağ bağlantısı yoktur; maç biterse kısa bir bekleyişten sonra yenisi başlar.
 * Uygulamada (isApp) açılmaz: Play Store sürümüne yeni bir kip girmez.
 */
export function gosteriAcik() {
  if (isApp()) return false;
  const v = new URLSearchParams(location.search).get('gosteri');
  return v !== null && v !== '0';
}

/** dt'siz (0) çağrıda kamera hedefe yapışır; sonraki karelerde yumuşak kayar. */
export function createGosteri(world, { arenaReady }) {
  world.gosteri = true;
  const hedef = new T.Vector3(), kamera = new T.Vector3();
  let taraTimer = 0, tutTimer = 0, bitisTimer = 0, bulusmaTimer = 0, sonPuan = 0;

  /** Yeni maç: bot-bot kadro, bol kasa, cephedeki hazır birlikler, açık sis. */
  function basla() {
    setupGame(world, {
      teamSize: GOSTERI.teamSize, difficulty: GOSTERI.difficulty, humans: [],
      seed: 1000 + Math.floor(Math.random() * 900000),
    });
    // world.me / world.player istemci tarafının baktığı oyuncudur: gösteride ilk bot ve onun kahramanı.
    world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
    world.onEnd = () => { bitisTimer = GOSTERI.yenidenBasla; };
    for (const p of world.players) {
      Object.assign(p.eco, GOSTERI.kasa);
      // Botlar gösteride hep saldırıdadır (bkz. economy.js updateBotStance): aksiyon çekilmeyle kesilmesin.
      p.ai.attacking = true; p.ai.launchSize = GOSTERI.birlikler.length;
      cepheyeDiz(p);
    }
    arenaReady();
    // Savaş sisi kapalı: karartma düzlemi boşalır, bütün yapılar bilinir olur (bkz. fog.js).
    world.fog.enabled = false; world.fog.update(0, true);
    bitisTimer = 0; taraTimer = 0; tutTimer = 0; bulusmaTimer = GOSTERI.bulusma; sonPuan = 0;
    odak(0);
  }

  /** Oyuncunun hazır birlikleri: kışlasında basılır, sancağıyla en yakın rakip sancak arasındaki hatta dizilir. */
  function cepheyeDiz(p) {
    const bina = world.structures.find(s => s.alive && s.owner === p && s.kind === 'barracks') || p.banner;
    const foe = nearestEnemyBanner(world, p.faction, p.banner.pos);
    const at = foe ? foe.pos : { x: 0, z: 0 };
    const cx = p.banner.pos.x + (at.x - p.banner.pos.x) * GOSTERI.hat;
    const cz = p.banner.pos.z + (at.z - p.banner.pos.z) * GOSTERI.hat;
    const n = GOSTERI.birlikler.length;
    GOSTERI.birlikler.forEach((key, i) => {
      const e = spawnUnit(world, key, p, bina);
      if (!e) return;
      // Altın oran açısıyla dağıt: üst üste binmeden düzgün bir cephe olur.
      const a = i * 2.39996, r = GOSTERI.hatYayilma * Math.sqrt((i + 0.5) / n);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      e.pos.set(x, 0, z); e.spawnTimer = 0;
      e.facing = yawFromDir(at.x - x, at.z - z);
      e.brain.order = null; e.brain.home = { x, z };
    });
  }

  /**
   * Kamera odağı: ızgara hücrelerinde (hücre + komşuları) iki tarafın birlikte bulunduğu en kalabalık yer aranır.
   * Seçilen çatışmada en az `tut` saniye kalınır; çatışma biterse ya da belirgin daha büyüğü çıkarsa oraya geçilir.
   */
  function odak(dt) {
    taraTimer -= dt; tutTimer -= dt;
    if (taraTimer <= 0) {
      taraTimer = GOSTERI.kamera.tara;
      const H = GOSTERI.kamera.hucre, cells = izgara();
      const y = enKalabalik(cells);
      // Elindeki çatışmanın güncel puanı: sıfıra düştüyse (dövüş bitti) yeni yere hemen geçilir.
      const bura = puanla(cells, Math.floor(hedef.x / H), Math.floor(hedef.z / H));
      const surada = bura ? bura.puan : 0;
      if (y && (surada <= 0 || tutTimer <= 0 || y.puan > surada * GOSTERI.kamera.ustunluk)) {
        hedef.set(y.x, 0, y.z); sonPuan = y.puan; tutTimer = GOSTERI.kamera.tut;
      } else sonPuan = surada;
    }
    if (dt <= 0) kamera.copy(hedef);
    else kamera.lerp(hedef, 1 - Math.exp(-dt * GOSTERI.kamera.yumusatma));
    return kamera;
  }

  /** Sahadaki savaşçıların hücre ızgarası: hücre başına birim listesi (işçiler sayılmaz). */
  function izgara() {
    const H = GOSTERI.kamera.hucre, cells = new Map();
    for (const e of world.entities) {
      if (!e.alive || e.isWorker) continue;
      const i = Math.floor(e.pos.x / H), j = Math.floor(e.pos.z / H), k = `${i},${j}`;
      let c = cells.get(k);
      if (!c) cells.set(k, (c = { i, j, list: [] }));
      c.list.push(e);
    }
    return cells;
  }
  /**
   * Hücrenin (komşularıyla birlikte) çatışma puanı ve bakılacak nokta. Puan iki tarafın karşılaştığı yerde yükselir
   * (kalabalık ufak katkı verir); nokta ise **düşmanı dibinde olan** birimlerin ağırlık merkezidir: kamera boş çayıra
   * değil kılıçların çarpıştığı yere bakar. Temas eden kimse yoksa bütün yığının merkezi alınır.
   */
  function puanla(cells, i, j) {
    const list = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const c = cells.get(`${i + di},${j + dj}`);
      if (c) for (const e of c.list) list.push(e);
    }
    if (!list.length) return null;
    let blue = 0, red = 0, other = 0;
    for (const e of list) { if (e.faction === 'blue') blue++; else if (e.faction === 'red') red++; else other++; }
    const t2 = GOSTERI.kamera.temas * GOSTERI.kamera.temas;
    let x = 0, z = 0, n = 0;
    for (const a of list) {
      let temas = false;
      for (const b of list) {
        if (b.faction === a.faction) continue;
        if ((a.pos.x - b.pos.x) ** 2 + (a.pos.z - b.pos.z) ** 2 <= t2) { temas = true; break; }
      }
      if (temas) { x += a.pos.x; z += a.pos.z; n++; }
    }
    if (!n) for (const a of list) { x += a.pos.x; z += a.pos.z; n++; }
    const carpisan = Math.min(blue, red) + Math.min(blue + red, other) * 0.5;
    return { x: x / n, z: z / n, puan: carpisan * 3 + list.length * GOSTERI.kamera.kalabalik, n: list.length };
  }
  /** En kalabalık çatışma; hiç karşılaşma yoksa en kalabalık yığın, o da yoksa bir kahraman. */
  function enKalabalik(cells) {
    let best = null;
    for (const c of cells.values()) {
      const s = puanla(cells, c.i, c.j);
      if (s && (!best || s.puan > best.puan)) best = s;
    }
    if (best) return best;
    const h = world.players.map(p => p.hero).find(e => e && e.alive);
    return h ? { x: h.pos.x, z: h.pos.z, puan: 0 } : { x: 0, z: 0, puan: 0 };
  }
  /**
   * Buluşma emri: iki ordunun ağırlık merkezlerinin ortasına **iki taraf da** yürütülür, yolda karşılaşan dövüşür.
   * Botların kendi hâline bırakılan orduları birbirini ıskalayıp ayrı ayrı üs kuşatmaya gidebiliyor; klipte ekranda
   * sürekli çarpışma olsun diye gösteride aralıklarla bu emir verilir. Emir `defend` bayrağıyla verilir: bot askerinin
   * kendi başına ilerleme mantığını geçer (bkz. ai.js updateUnit), varınca kendiliğinden düşer.
   */
  function bulustur() {
    const merkez = f => {
      let x = 0, z = 0, n = 0;
      for (const e of world.entities) { if (!e.alive || e.faction !== f || e.isWorker || e.isHero) continue; x += e.pos.x; z += e.pos.z; n++; }
      return n ? { x: x / n, z: z / n } : null;
    };
    const a = merkez('blue'), b = merkez('red');
    if (!a || !b) return;
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
    for (const p of world.players) {
      const ordu = world.entities.filter(e => e.alive && e.owner === p && e.brain && !e.isHero && !e.isWorker);
      if (ordu.length) giveOrder(world, ordu, { kind: 'move', x, z, defend: true });
    }
  }

  /** Her kare: maç sürüyorsa iki adım (iki kat hız), bittiyse yeni maçın geri sayımı. */
  function guncelle(dt) {
    if (world.ended) {
      bitisTimer -= dt;
      if (bitisTimer <= 0) basla();
      return;
    }
    if (!world.running || world.paused) return;
    for (let i = 0; i < GOSTERI.hiz; i++) step(world, dt);
    bulusmaTimer -= dt;
    if (bulusmaTimer <= 0) { bulusmaTimer = GOSTERI.bulusma; bulustur(); }
  }

  return { basla, guncelle, odak };
}
