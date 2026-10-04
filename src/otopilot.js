import { distXZ, yawFromDir } from './builders.js';
import { applyLevelUp } from './characters.js';
import { heroReach } from './combat.js';
import { CHARGE, HERO_UPGRADE, OTOPILOT as O, POSITIONS } from './config.js';
import { spawnUnit } from './economy.js';
import { isApp } from './platform.js';
import { createBotAi, nearestEnemyBanner } from './players.js';
import { createStructure } from './structures.js';
import { setupGame, step } from './world.js';

/**
 * **Otopilot** (`?otopilot=1`, yalnız tarayıcı): içerik videoları için **gerçek bir maç**, ama oyuncunun kahramanını
 * bir bot oynar. Gösteri kiplerinden (gosteri.js) farkı, bunun bir gösteri değil **oyunun kendisi** olmasıdır:
 *  - Maç normal kurallarla kurulur (setupGame, bir insan koltuğu + botlar) ve **bütün oyunculara eşit** bir
 *    "çatışma başlangıcı" verilir: dolu kasa (O.kasa), kurulu üretim binaları (O.binalar), cephe hattına dizilmiş bir
 *    bölük (O.birlikler) ve seviye O.seviye kahraman. Bu bir hile değildir — otopilot koltuğu da rakipleri de aynısını
 *    alır, kurallar değişmez; video ekonomi kurulmasını beklemeden muharebeyle başlasın diyedir (bkz. `basla`).
 *  - Oyuncunun kasası ve ordusu bot komutan kararlarıyla sürülür (bkz. economy.js updateBots → `p.otopilot`): işçi
 *    basılır, asker üretilir, ordu saldırıya kalkar. Yani ekranda gerçek bir maç akar.
 *  - **Kahraman girdiyle oynanır**: bu dosya her karede oyuncunun girdisini (bkz. hero.js createHeroInput) doldurur —
 *    hareket yönü, koşu, nişan, sol tık, basılı tutulan şarj, sağ tık atılma, zıplama. Simülasyon tarafında hiçbir
 *    ayrıcalık yoktur: kahraman oyuncunun bastığı tuşların aynısını "basar", menzil, bekleme ve şarj süreleri aynıdır.
 *  - Karar sırası bir oyuncunun yaptığına yakındır: canı azaldıysa sancağına çekilip iyileşir, görüşünde düşman varsa
 *    dövüşür (kalabalıkta şarjlı vuruş, mesafe varsa atılma), ortalık boşsa yerdeki ganimeti toplar, o da yoksa
 *    ordusunun ilerlediği cepheye yürür, ordusu toplanmadıysa üssünde kaynak çıkarır.
 *  - **İnşaat yapmaz**: bot komutan binayı kahramanın yanına diktirmek için ona şantiye görevi (`hero.errand`) verir,
 *    otopilot bu görevi her karede siler (bkz. `girdi`). Üretim binaları maç başında kurulu geldiği için geriye yalnız
 *    kule istekleri kalır; yani otopilot koltuğu maç içinde **kule dikmez** (rakip bot kahramanlar diker) ve kuşatma
 *    gerektiğinde o turda atölyeye sıra gelmez. Kabul edilen bir denge: kahramanın videoyu cepheden uzakta,
 *    şantiye gezerek geçirmesindense kule kurmaması yeğlendi. Asker üretimi bundan etkilenmez (bkz. economy.js
 *    updateBotEconomy: `tryBuild` 'wait' dönünce döngü kırılır ama asker üretimi aynı turda devam eder).
 *  - Duvara / ağaca takılırsa (konumu ilerlemiyorsa) yana kaçar; ölünce oyunun kendi yeniden doğma süresiyle doğar ve
 *    oynamaya devam eder (bkz. world.js updateLifecycle).
 * Kamera **normal oyun kamerasıdır** (izometrik, kahramanı izler; bkz. main.js): sahne yerleştirme yoktur.
 * Menü, lobi, yardım ve sonuç ekranı açılmaz; maç bitince kısa bir bekleyişten sonra **başka bir harita, takım boyu ve
 * kahraman türüyle** yeni maç başlar. Ölçüm (olcum.js) ve ağ bağlantısı yoktur. Uygulamada (isApp) hiç açılmaz.
 */
export function otopilotAcik() {
  if (isApp()) return false;
  const v = new URLSearchParams(location.search).get('otopilot');
  return v !== null && v !== '0';
}

export function createOtopilot(world, { arenaReady }) {
  world.otopilot = true;
  let macNo = 0, bitisTimer = 0;
  let hedef = null, tazeleTimer = 0, ziplaTimer = 0, sarjSon = -1, sarjBekle = 0, kaciyor = false;
  // Takılma gözetimi: son ölçümdeki yer, kalan süre ve (takıldıysa) yana kaçış yönü.
  const takilma = { x: 0, z: 0, timer: 0, kacis: 0, yon: [0, 0] };

  /** Yeni maç: her maçta başka takım boyu (yani başka harita), başka kahraman türü ve başka tohum. */
  function basla() {
    const teamSize = O.takimlar[macNo % O.takimlar.length];
    const loadout = { ...O.loadoutlar[macNo % O.loadoutlar.length] };
    macNo++;
    setupGame(world, { teamSize, difficulty: O.difficulty, humans: [{ name: 'Kahraman' }], loadout, seed: 1000 + Math.floor(Math.random() * 900000) });
    world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
    // Oyuncunun koltuğu insandır (kahraman girdiyle oynanır) ama komutan kararlarını bot verir: bu bayrak
    // updateBots'un insan koltuğunu atlamasını engeller, `ai` de o botun karar durumudur (bkz. economy.js).
    world.me.otopilot = true; world.me.ai = createBotAi(0);
    // Çatışma başlangıcı: her oyuncuya (otopilot dahil, eşit) dolu kasa ve hazır bir bölük; bölükler cephe hattına
    // dizilir. Maçın kuralları değişmez, yalnız başlangıç noktası ekonomisi kurulmuş bir maçtır.
    for (const p of world.players) {
      Object.assign(p.eco, O.kasa);
      // Kahramanlar da o safhanın seviyesinde: herkese eşit, oyunun kendi seviye artışıyla (menzil, can, hasar).
      for (let i = 1; i < O.seviye; i++) applyLevelUp(p.hero);
      p.st.level = p.hero.level;
      // Üretim binaları kurulu gelir (kışla setupGame'de kuruluyor): her oyuncu okçu ve atlı da basabilsin, yani
      // sahada tek tip asker olmasın. Bina yalnız kahramanın yanına dikilebildiği için (bkz. economy.js tryBuild)
      // bunlar maç içinde dikilseydi kahraman videonun yarısını şantiye gezerek geçirirdi.
      for (const kind of O.binalar) {
        const q = p.base.at(POSITIONS.base[kind]);
        if (q) createStructure(world, kind, p.faction, q.x, q.z, { instant: true, owner: p });
      }
      cepheyeDiz(p);
    }
    world.onEnd = () => { bitisTimer = O.yenidenBasla; };
    arenaReady();
    // Savaş sisi kapalı (gösteri kiplerindeki gibi): kadrajın büyük kısmı karartma düzlemiyle kapanmasın, kahramanın
    // çevresindeki muharebe görünsün. Oyunun kuralları değişmez; yalnız istemcinin çizdiği karartma kalkar.
    world.fog.enabled = false; world.fog.update(0, true);
    world.camTarget.copy(world.player.pos);
    hedef = null; tazeleTimer = 0; sarjSon = -1; sarjBekle = 0; kaciyor = false; bitisTimer = 0;
    ziplaTimer = araDeger(O.ziplama);
    takilma.timer = O.takilma.sure; takilma.kacis = 0; takilma.x = world.player.pos.x; takilma.z = world.player.pos.z;
  }

  const araDeger = ([a, b]) => a + Math.random() * (b - a);

  /** Oyuncunun hazır bölüğü: kışlasında basılır, sancağıyla en yakın rakip sancak arasındaki hatta dizilir. */
  function cepheyeDiz(p) {
    const bina = world.structures.find(s => s.alive && s.owner === p && s.kind === 'barracks') || p.banner;
    const foe = nearestEnemyBanner(world, p.faction, p.banner.pos);
    const at = foe ? foe.pos : { x: 0, z: 0 };
    const cx = p.banner.pos.x + (at.x - p.banner.pos.x) * O.hat;
    const cz = p.banner.pos.z + (at.z - p.banner.pos.z) * O.hat;
    const n = O.birlikler.length;
    O.birlikler.forEach((key, i) => {
      const e = spawnUnit(world, key, p, bina);
      if (!e) return;
      // Altın oran açısıyla dağıt: üst üste binmeden düzgün bir bölük olur.
      const a = i * 2.39996, r = O.hatYayilma * Math.sqrt((i + 0.5) / n);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      e.pos.set(x, 0, z); e.spawnTimer = 0;
      e.facing = yawFromDir(at.x - x, at.z - z);
      e.brain.order = null; e.brain.home = { x, z };
    });
    // Kahraman da bölüğünün yanında başlar: maç ilk saniyesinden itibaren cephede geçsin, video kahramanın üsten
    // cepheye yürüyüşüyle açılmasın. Bütün oyuncular için aynı (otopilot da rakipleri de).
    const h = p.hero;
    if (h && h.alive) {
      h.pos.set(cx - (at.x - cx) * 0.08, 0, cz - (at.z - cz) * 0.08);
      h.facing = yawFromDir(at.x - h.pos.x, at.z - h.pos.z);
      if (h.brain) { h.brain.order = null; h.brain.home = { x: h.pos.x, z: h.pos.z }; }
    }
  }

  /**
   * Kahramanın dövüşeceği düşman: görüşündeki en yakın **savaşçı** (işçi değil); hiç savaşçı yoksa en yakın işçi ya da
   * düşman yapısı. Yapı da hedef olur ki kahraman kuşatmada kuleye / sancağa vursun, boş sahada beklemesin.
   */
  function dusmanSec(p) {
    const R = O.gorus;
    let asker = null, ad = Infinity, baska = null, bd = Infinity;
    for (const e of world.entities) {
      if (!e.alive || e.faction === p.faction) continue;
      const d = distXZ(p.pos, e.pos);
      if (d > R) continue;
      if (!e.isWorker) { if (d < ad) { ad = d; asker = e; } } else if (d < bd) { bd = d; baska = e; }
    }
    if (asker) return asker;
    let yapi = null, yd = Infinity;
    for (const s of world.structures) {
      if (!s.alive || s.faction === p.faction) continue;
      const d = distXZ(p.pos, s.pos) - s.radius;
      if (d < R && d < yd) { yd = d; yapi = s; }
    }
    return baska || yapi;
  }

  /** Dövüş yokken toplanacak ganimet: yerdeki (uçmayan), sahipsiz ya da kendi ürünü olan en yakın eşya. */
  function ganimetSec(p) {
    let best = null, bd = O.ganimet;
    for (const it of world.items) {
      if (it.taken || it.fly) continue;
      if (!(it.owner === world.me || it.owner === null)) continue;
      const d = distXZ(p.pos, it.pos);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  /**
   * Görüşünde düşman yokken gidilecek hedef: **çatışmanın içindeki** en yakın düşman savaşçısı, yani kendi
   * takımından birinin dibinde dövüşen biri. Böylece kahraman boş çayırda dolaşmaz, kameranın gördüğü yer de
   * kalabalık olur. Hiçbir yerde temas yoksa `av` yarıçapındaki en yakın düşman (haydut dahil) seçilir.
   */
  function avSec(p) {
    let carpisan = null, cd = Infinity, yakin = null, yd = O.av;
    for (const e of world.entities) {
      if (!e.alive || e.faction === p.faction || e.isWorker) continue;
      const d = distXZ(p.pos, e.pos);
      if (d < yd) { yd = d; yakin = e; }
      if (d >= cd) continue;
      // Dövüşüyor mu: yakınında bu takımdan bir savaşçı var mı.
      let temas = false;
      for (const o of world.entities) {
        if (!o.alive || o.faction !== p.faction || o.isWorker || o === p) continue;
        if (distXZ(o.pos, e.pos) < O.temas) { temas = true; break; }
      }
      if (temas) { cd = d; carpisan = e; }
    }
    return carpisan || yakin;
  }

  /**
   * Cephe: ordusunun ağırlık merkezinden rakip sancağa doğru biraz ileride bir nokta. Ordu `orduAsgari`den azsa null
   * döner — kahraman tek başına rakip üssüne yürümez, üssünde kaynak çıkarmaya kalır.
   */
  function cephe(p) {
    let x = 0, z = 0, n = 0;
    for (const e of world.entities) {
      if (!e.alive || e.owner !== world.me || e.isWorker || e === p) continue;
      x += e.pos.x; z += e.pos.z; n++;
    }
    if (n < O.orduAsgari) return null;
    const ox = x / n, oz = z / n;
    const foe = nearestEnemyBanner(world, p.faction, { x: ox, z: oz });
    if (!foe) return { x: ox, z: oz };
    return { x: ox + (foe.pos.x - ox) * O.cepheIleri, z: oz + (foe.pos.z - oz) * O.cepheIleri };
  }

  /**
   * Kaynak çıkarma yeri: kendi üssündeki en yakın boş çalışma yeri. Kahraman orada **hareketsiz** durunca oyunun
   * kendi kuralıyla ürün çıkarır (bkz. economy.js updateEconomy); yani otopilotun ekonomisi hileyle değil,
   * oyuncunun kullandığı yoldan döner.
   */
  function calismaYeri(p) {
    let best = null, bd = Infinity;
    const dolu = new Set();
    for (const e of world.entities) if (e !== p && e.alive && e.work && e.work.spot) dolu.add(e.work.spot);
    for (const s of world.spots) {
      if (s.owner !== world.me) continue;
      const d = distXZ(p.pos, s.pos) + (dolu.has(s) ? 12 : 0) + (s.kind === 'gold' ? 0 : 5);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Çevredeki düşman savaşçısı sayısı (şarjlı vuruş kararı için). */
  function kalabalik(p, r) {
    let n = 0;
    for (const e of world.entities) if (e.alive && e.faction !== p.faction && !e.isWorker && distXZ(p.pos, e.pos) < r) n++;
    return n;
  }

  /**
   * Bir karelik girdi: oyuncunun elindeki her şeyi (hareket, koşu, nişan, sol tık, şarj, atılma, zıplama) üretir.
   * Girdi biçimi hero.js'nin beklediği **çözülmüş** biçimdir; kenar bayrakları (aq / dq / jq / ar) applyHeroInput
   * içinde tüketilir, bu yüzden her karede sıfırlanmaz, yalnızca basıldığı karede kurulur.
   */
  function girdi(dt) {
    const p = world.player, inp = world.me && world.me.input;
    if (!p || !inp) return;
    if (!p.alive) { inp.mv[0] = inp.mv[1] = 0; inp.sp = false; inp.ah = false; inp.ha = false; hedef = null; sarjSon = -1; return; }

    // Bot komutanı binayı kahramanın yanına diktirir ve bunun için kahramana şantiye görevi verir (bkz. economy.js
    // tryBuild). Otopilotta üretim binaları maç başında kurulu geldiği için bu görev yalnız kule isteklerinden gelir
    // ve kahramanı cepheden üsse geri çeker: görev silinir, komutan o kareyi atlar ve asker üretimine devam eder.
    if (p.errand) p.errand = null;

    tazeleTimer -= dt; ziplaTimer -= dt; sarjBekle -= dt;
    const canOran = p.hp / Math.max(1, p.stats.maxHp);
    if (kaciyor ? canOran >= O.don : canOran <= O.kac) kaciyor = !kaciyor;
    // Dövüş hedefi iki kademeli aranır: **görüşündeki** düşman (yakın tehdit) ve sahadaki çatışmanın içindeki
    // düşman (gidilecek yer).
    if (tazeleTimer <= 0) { tazeleTimer = O.tazele; hedef = kaciyor ? null : dusmanSec(p) || avSec(p); }
    if (hedef && !hedef.alive) hedef = null;

    // Nereye gidilecek, bir oyuncunun sırasıyla: canı bitmek üzereyse sancağına çekilir (orada iyileşir), düşman /
    // haydut varsa dövüşür, yerde ganimet varsa alır, ordusu toplandıysa cepheye yürür, hiçbiri yoksa üssünde
    // kaynak çıkarır.
    const banner = world.me.banner;
    let git = null;
    if (kaciyor && banner && banner.alive) git = { x: banner.pos.x, z: banner.pos.z, yakin: HERO_UPGRADE.range * 0.35 };
    else if (hedef) git = { x: hedef.pos.x, z: hedef.pos.z, yakin: (hedef.radius || 0) + heroReach(p).range * O.yanas };
    else {
      const g = ganimetSec(p);
      if (g) git = { x: g.pos.x, z: g.pos.z, yakin: 0.6 };
      else {
        const c = cephe(p);
        if (c) git = { x: c.x, z: c.z, yakin: 4 };
        else {
          const s = calismaYeri(p);
          // Çalışma yerinde **hareketsiz** durmak gerekir: yakın eşiği küçük tutulur ki kahraman kıpırdamasın.
          git = s ? { x: s.pos.x, z: s.pos.z, yakin: 0.5 }
            : banner ? { x: banner.pos.x, z: banner.pos.z, yakin: 4 } : { x: p.pos.x, z: p.pos.z, yakin: 1 };
        }
      }
    }
    const mesafe = distXZ(p.pos, git);
    // Hedefe olan **gerçek** uzaklık: vuruş, şarj ve atılma kararları buna bakar (gidilen yer hedef olmayabilir).
    const hedefMesafe = hedef ? distXZ(p.pos, hedef.pos) - (hedef.radius || 0) : Infinity;

    // Yaylı kahraman mesafeyi korur: dibine gelen düşmandan geri çekilerek atar (oyuncunun yaptığı gibi).
    const yayli = Boolean(p.stats.weapon.ranged);
    let dx = git.x - p.pos.x, dz = git.z - p.pos.z;
    let ilerle = mesafe > git.yakin;
    if (hedef && yayli && !kaciyor && hedefMesafe < O.yayYakin) { dx = p.pos.x - hedef.pos.x; dz = p.pos.z - hedef.pos.z; ilerle = true; }

    // Takılma: konum ilerlemiyorsa bir süre yana kaç (duvar, ağaç, kalabalık).
    takilma.timer -= dt;
    if (takilma.kacis > 0) {
      takilma.kacis -= dt;
      dx = takilma.yon[0]; dz = takilma.yon[1]; ilerle = true;
    } else if (takilma.timer <= 0) {
      const ilerleme = Math.hypot(p.pos.x - takilma.x, p.pos.z - takilma.z);
      if (ilerleme < O.takilma.mesafe && ilerle) {
        takilma.kacis = O.takilma.kurtul;
        const l = Math.hypot(dx, dz) || 1, yon = Math.random() < 0.5 ? 1 : -1;
        takilma.yon = [(-dz / l) * yon, (dx / l) * yon];
      }
      takilma.timer = O.takilma.sure; takilma.x = p.pos.x; takilma.z = p.pos.z;
    }

    const l = Math.hypot(dx, dz) || 1;
    inp.mv[0] = ilerle ? dx / l : 0;
    inp.mv[1] = ilerle ? dz / l : 0;
    inp.sp = ilerle && mesafe > O.kos && !p.charging;

    // Nişan: düşman varsa ona, yoksa gidilen yöne (kahraman yürüdüğü yere baksın).
    inp.ha = true;
    if (hedef) { inp.aim[0] = hedef.pos.x; inp.aim[1] = hedef.pos.z; }
    else { inp.aim[0] = p.pos.x + dx / l * 6; inp.aim[1] = p.pos.z + dz / l * 6; }

    if (!hedef || kaciyor) { birakSarj(inp); return; }

    const menzilIci = hedefMesafe <= heroReach(p).range * 0.98;

    // Sağ tık: hedef biraz uzaktaysa üstüne atıl (set etkisi + mesafeyi kapatır).
    if (!menzilIci && p.dodgeCd <= 0 && p.stun <= 0 && hedefMesafe >= O.atilma.enAz && hedefMesafe <= O.atilma.enCok && !p.charging) inp.dq = true;

    // Zıplama: dövüşün içinde aralıklarla (oyuncu da yerinde durmaz).
    if (ziplaTimer <= 0) { ziplaTimer = araDeger(O.ziplama); if (hedefMesafe < O.gorus * 0.6 && p.stun <= 0) inp.jq = true; }

    // Sol tık: menzildeyken ya tek vuruş ya da **basılı tutulan şarjlı vuruş**. Şarj kalabalıkta denenir: oyunun
    // şarjlı vuruşu alan etkilidir, tek düşmana harcanması boşa olur.
    if (sarjSon >= 0) {
      if (world.time < sarjSon) inp.ah = true;
      else { inp.ah = false; inp.ar = true; sarjSon = -1; sarjBekle = O.sarj.bekle; }
      return;
    }
    // Şarj hedefe yaklaşırken de başlar: oyuncu da sol tıkı basılı tutarak kalabalığın içine girer.
    const sarjMesafe = heroReach(p).range * O.sarj.baslaKat;
    if (sarjBekle <= 0 && hedefMesafe <= sarjMesafe && !hedef.kind && kalabalik(p, O.sarj.yaricap) >= O.sarj.kalabalik && Math.random() < O.sarj.olasilik) {
      // Basılı tutma süresi: şarjın dolması (delay + full) + küçük bir pay.
      sarjSon = world.time + CHARGE.delay + CHARGE.full + 0.12;
      inp.ah = true; inp.heldAt = -1;
      return;
    }
    birakSarj(inp);
    // Sol tık her karede kurulur: oyunun kendi bekleme süresi (startAttack → canAttack) dolar dolmaz vuruş çıkar,
    // yani kahraman dövüşün içinde boş durmaz. Menzil dışındayken tıklanmaz.
    if (menzilIci) inp.aq = true;
  }

  const birakSarj = inp => { if (inp.ah) { inp.ah = false; inp.ar = true; } sarjSon = -1; };

  /** Her kare: maç sürüyorsa girdi + bir simülasyon adımı; bittiyse yeni maçın geri sayımı. */
  function guncelle(dt) {
    if (world.ended) {
      bitisTimer -= dt;
      if (bitisTimer <= 0) basla();
      return;
    }
    if (!world.running || world.paused) return;
    girdi(dt);
    step(world, dt);
  }

  return { basla, guncelle };
}
