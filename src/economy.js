import * as T from '/vendor/three.module.js';
import { CulledGroup, ball, box, mesh, removeGroup } from './builders.js';
import { applyLevelUp, buildView, createEntity } from './characters.js';
import { burst, ring } from './combat.js';
import { ANTI, BANDITS, BUILD, BUILDINGS, CAMPS, ECONOMY, ENEMY_AI, ENEMY_HERO, LEVEL, POSITIONS, SIEGE, SOLDIER_BASE, SOLDIER_TYPES, TOWER, VISION, WORKER } from './config.js';
import { giveOrder, inEnemyTowerRange } from './ai.js';
import { armyCount, bestProducer, classOf, enqueue, queuedOf, queuedSoldiers, workerTotal } from './production.js';
import { rrand } from './rng.js';
import { canPlace, createStructure, placementError, reviveCamp, structureCount } from './structures.js';
import { botSay, enemyOf, nearestEnemyBanner, resourceMult, teamOf } from './players.js';

/**
 * Ekonomi: her üssün arkasında maden (altın), odunluk (odun) ve tarla (yiyecek).
 * Kaynak noktaları hiç tükenmez. Bir toplayıcı (işçi, bot kahramanı ya da oyuncu) çalışma
 * yerinde durup çalışır; süre dolunca çevreye bir ürün fırlar. Ürün alındığı anda **sahibinin** kasasına girer
 * (taşıma yok): altın + yiyecek asker basar, altın + odun bina kurar. Ölen asker yiyecek, yıkılan
 * yapı odun bırakır (ganimet, owner=null): bunları yalnızca kahramanlar toplar. Rakip takımın altını zorluk çarpanıyla ölçeklenir.
 * Her oyuncunun (insan ve botlar) kendi kasası vardır: bkz. players.js.
 */
const SOLDIER_ONLY = SOLDIER_TYPES.filter(t => !t.worker);
const WORKER_TYPES = SOLDIER_TYPES.filter(t => t.worker);

// ---------- Çalışma yerleri ve ürünler ----------

/** Her oyuncunun üs yerleşiminden çalışma yerlerini kurar. Yerler kalıcıdır; ürün çalışmayla üretilir. */
export function initResources(world) {
  world.spots = []; world.items = [];
  for (const p of world.players) {
    const base = p.base;
    const add = (kind, list) => { for (const s of list) world.spots.push({ kind, owner: p, x: s.x, z: s.z, pos: new T.Vector3(s.x, 0, s.z) }); };
    add('gold', base.mineSlots); add('wood', base.woodSlots); add('food', base.farmSlots);
  }
}

export function clearResources(world) {
  for (const it of world.items) removeGroup(it.g);
  world.items.length = 0;
}

/** Çalışma yerinden çevreye bir ürün fırlatır; yere düşünce alınabilir. */
export function produceItem(world, spot, claimedBy = null) {
  const g = new CulledGroup(); g.position.set(spot.x, 0.6, spot.z); g.rotation.y = rrand(0, 6); world.scene.add(g);
  if (spot.kind === 'gold') {
    ball(g, '#f3c53d', 0, 0.28, 0, 0.32, 0.26, 0.3); ball(g, '#e2ad2c', 0.25, 0.2, 0.15, 0.2, 0.18, 0.2); ball(g, '#f7d76a', -0.2, 0.18, -0.15, 0.16);
  } else if (spot.kind === 'wood') {
    box(g, '#7a5433', 0, 0.2, 0, 0.32, 0.32, 1.3);
    box(g, '#8c6238', 0.3, 0.2, 0.1, 0.3, 0.3, 1.1);
    for (const z of [-0.65, 0.65]) mesh(g, new T.CircleGeometry(0.16, 8), '#d8b78a', 0, 0.2, z).rotation.y = z > 0 ? 0 : Math.PI;
  } else if (spot.kind === 'xp') {
    // Exp küresi: mor, hafifçe parlayan bir kristal; yalnızca kahramanlar toplar.
    ball(g, '#c48bff', 0, 0.42, 0, 0.26, 0.42, 0.26);
    ball(g, '#e7d0ff', 0, 0.42, 0, 0.14, 0.24, 0.14);
    ball(g, '#9a5cf0', 0, 0.1, 0, 0.2, 0.1, 0.2);
  } else {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, r = 0.22; box(g, '#c9b45c', Math.cos(a) * r, 0.45, Math.sin(a) * r, 0.08, 0.9, 0.08); ball(g, '#e6d27a', Math.cos(a) * r * 1.3, 0.95, Math.sin(a) * r * 1.3, 0.1, 0.22, 0.1); }
    box(g, '#7a5433', 0, 0.35, 0, 0.62, 0.08, 0.62).rotation.y = 0.4;
  }
  const glow = mesh(g, new T.RingGeometry(0.4, 0.5, 20), itemColor(spot.kind), 0, 0.03, 0);
  glow.rotation.x = -Math.PI / 2; glow.castShadow = false;
  glow.material = new T.MeshBasicMaterial({ color: glow.material.color.clone(), transparent: true, opacity: 0.35, side: T.DoubleSide });
  // Yerdeki küçük eşya gölge atmaz (5v5'te yüzlercesi birikir; gölge geçişinden düşer).
  g.traverse(o => { o.castShadow = false; });
  const a = rrand(0, Math.PI * 2), d = rrand(ECONOMY.work.throwMin, ECONOMY.work.throwMax);
  const L = ECONOMY.loot;
  const item = {
    kind: spot.kind, owner: spot.owner || null, amount: spot.amount || 0, pos: g.position, g, claimedBy, taken: false, phase: rrand(0, 6),
    // Ömür: ganimet (sahipsiz yiyecek / odun) kısa, exp küresi orta, işçi ürünü uzun; son saniyede küçülerek kaybolur.
    ttl: spot.kind === 'xp' ? L.xpTtl : spot.owner ? L.ownedTtl : L.ttl,
    fly: { fx: spot.x, fz: spot.z, tx: spot.tx ?? spot.x + Math.cos(a) * d, tz: spot.tz ?? spot.z + Math.sin(a) * d, t: 0, dur: 0.45 },
  };
  burst(world, spot.x, 1, spot.z, itemColor(spot.kind), 5, 0.08);
  world.items.push(item);
  return item;
}

const itemColor = kind => (kind === 'gold' ? '#f3c53d' : kind === 'wood' ? '#c9a06a' : kind === 'xp' ? '#c48bff' : '#bfe59a');
/** Ekrandaki "+N" yazısının simgesi. */
const itemIcon = kind => (kind === 'gold' ? '◉' : kind === 'wood' ? '🪵' : kind === 'xp' ? 'exp' : '🌾');

/**
 * Kahraman bir kaynak düğümüne (maden / ağaç / tarla) vurdu: düğümün kenarından ona doğru, **vuranın** ürünü düşer.
 * Seviyeli kahraman her vuruşta daha çok ürün çıkarır (bkz. heroGather).
 */
export function hitNode(world, node, attacker) {
  if (node.hitCd > 0) return false;
  node.hitCd = ECONOMY.work.hitCooldown;
  const dx = attacker.pos.x - node.pos.x, dz = attacker.pos.z - node.pos.z, d = Math.hypot(dx, dz) || 1;
  const edge = Math.max(0, Math.min(d - 0.4, node.radius));
  const spot = { kind: node.kind, x: node.pos.x + dx / d * edge, z: node.pos.z + dz / d * edge, owner: attacker.owner };
  const n = heroGather(attacker);
  for (let i = 0; i < n; i++) produceItem(world, spot);
  burst(world, spot.x, 1.2, spot.z, node.kind === 'wood' ? '#8fbf6a' : node.kind === 'gold' ? '#c9c9d4' : '#e6d27a', 6 + n * 2, 0.1);
  return true;
}

function removeItem(world, item) {
  item.taken = true;
  removeGroup(item.g);
  const i = world.items.indexOf(item); if (i >= 0) world.items.splice(i, 1);
}

// ---------- Kaynak etkileri ----------

const near = (a, b, r) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz < r * r; };

/** Kahramanın bir kaynak çıkarışında düşen ürün sayısı: her LEVEL.gatherEvery seviyede bir fazla. */
export const heroGather = e =>
  (e.isPlayer || e.isHero ? 1 + Math.floor(e.level / LEVEL.gatherEvery) : 1);

/** Ürün alma yarıçapı: işçilerde sabit, kahramanlarda seviyeyle büyür. */
export const pickRadiusOf = e =>
  (e.isPlayer || e.isHero ? Math.min(LEVEL.maxPickRadius, ECONOMY.pickRadius + LEVEL.pickPerLevel * (e.level - 1)) : ECONOMY.pickRadius);

/** Ganimet: ölen asker / yıkılan yapı çevreye kaynak saçar (owner=null: yalnızca kahramanlar toplar). */
export function dropLoot(world, kind, x, z, count) {
  for (let i = 0; i < count; i++) {
    const a = rrand(0, Math.PI * 2), d = rrand(0.6, ECONOMY.loot.scatter);
    produceItem(world, { kind, x, z, owner: null, tx: x + Math.cos(a) * d, tz: z + Math.sin(a) * d });
  }
}

/**
 * Ölen birimin bıraktığı exp küresi: yere düşer, yalnızca kahramanlar (oyuncu ve bot kahramanları) toplar.
 * Kim öldürdüğünden bağımsızdır — küreyi kapan kahraman tecrübeyi alır.
 */
export function dropXp(world, x, z, amount) {
  if (!(amount > 0)) return;
  // Büyük ödüller (kahraman, kule) tek kürede kalmasın: LEVEL.xpOrbMax boyutunda kürelere bölünür.
  const orbs = Math.max(1, Math.ceil(amount / LEVEL.xpOrbMax)), each = amount / orbs;
  for (let i = 0; i < orbs; i++) {
    const a = rrand(0, Math.PI * 2), d = rrand(0.5, 1.4 + orbs * 0.3);
    produceItem(world, { kind: 'xp', x, z, owner: null, amount: each, tx: x + Math.cos(a) * d, tz: z + Math.sin(a) * d });
  }
}

/**
 * Toplanan ürün anında **sahibinin** kasasına girer (exp ise toplayan kahramana yazılır). Altın k çarpanıyla
 * ölçeklenir (rakip botlarda zorluk). `taker` verilirse insan kahramanı için ekranda "+N" yazısı çıkar.
 */
function collect(world, owner, it, k = 1, taker = null) {
  const bag = owner.eco, mine = owner === world.me;
  const float = (n, kind) => { if (taker && taker.isPlayer) world.ui.float(`+${n} ${itemIcon(kind)}`, taker.pos, itemColor(kind)); };
  if (it.kind === 'xp') { const n = Math.round(it.amount || 0); if (taker) world.onXpCollected(taker, n); float(n, 'xp'); return `+${n} exp`; }
  if (it.kind === 'gold') { const g = Math.round(ECONOMY.gold.value * k); bag.gold += g; if (mine) world.ui.flash('gold'); float(g, 'gold'); return `+${g} altın`; }
  if (it.kind === 'wood') { bag.wood++; if (mine) world.ui.flash('wood'); float(1, 'wood'); return '+1 odun'; }
  bag.food++; if (mine) world.ui.flash('wood'); float(1, 'food');
  return '+1 yiyecek';
}

// ---------- Ana güncelleme ----------

export function updateEconomy(world, dt) {
  const me = world.me, eco = me.eco, E = ECONOMY, p = world.player;
  eco.hintTimer -= dt;
  if (world.nodes) for (const n of world.nodes) if (n.hitCd > 0) n.hitCd -= dt;

  // Uçan ürünler yere düşer; altın parlar.
  for (const it of world.items) {
    if (it.fly) {
      const f = it.fly; f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      it.g.position.set(f.fx + (f.tx - f.fx) * k, 0.6 * (1 - k) + Math.sin(k * Math.PI) * 1.2, f.fz + (f.tz - f.fz) * k);
      if (k >= 1) { it.g.position.y = 0; it.fly = null; }
    } else if (it.kind === 'gold') { it.g.rotation.y += dt * 1.5; it.g.position.y = Math.sin(world.time * 3 + it.phase) * 0.05; }
  }

  // Oyuncu çalışması: kendi üssünün boş bir çalışma yerinde hareketsiz dur.
  const pw = eco.work;
  let spot = null;
  if (p.alive && p.moveDir.lengthSq() < 0.01 && p.attackTimer <= 0) {
    spot = world.spots.find(s => s.owner === me && near(s.pos, p.pos, E.work.spotRadius + p.radius));
  }
  if (spot) {
    if (pw.spot !== spot) { pw.spot = spot; pw.timer = 0; }
    pw.timer += dt; p.working = true; p.workTimer += dt;
    if (pw.timer >= E.work.heroTime) { pw.timer = 0; for (let i = 0; i < heroGather(p); i++) produceItem(world, spot); world.ui.ping('worker'); }
  } else { pw.spot = null; pw.timer = 0; p.working = false; }

  // Ürünleri al: etkiler anında işlenir, taşıma yok.
  const gatherers = world.entities.filter(e => e.alive && (e.isHero || e.isWorker));
  for (let i = world.items.length - 1; i >= 0; i--) {
    const it = world.items[i];
    // Toplanmayan eşya ömrü dolunca kaybolur (bkz. ECONOMY.loot.ttl); son saniyede küçülür.
    it.ttl -= dt;
    if (it.ttl <= 0) { removeItem(world, it); continue; }
    if (it.ttl < 1 && !it.fly) it.g.scale.setScalar(0.15 + 0.85 * it.ttl);
    if (it.fly) continue;
    if (p.alive && (it.owner === me || it.owner === null) && near(it.pos, p.pos, p.radius + pickRadiusOf(p))) {
      // Yiyecek de yalnızca envantere girer: kahramanın canı yalnızca sancak alanında yenilenir.
      // "+N" yazısı kahramanın üstünde belirir (bkz. collect -> ui.float).
      collect(world, me, it, 1, p);
      burst(world, it.pos.x, 0.8, it.pos.z, itemColor(it.kind), 5, 0.08);
      removeItem(world, it); continue;
    }
    for (const g of gatherers) {
      // İşçi yalnızca kendi sahibinin kendi türündeki ürününü alır; kahraman ganimeti de alır.
      if (!(it.owner === g.owner || (g.isHero && it.owner === null)) || !near(it.pos, g.pos, g.radius + pickRadiusOf(g))) continue;
      if (g.workerKind && g.workerKind !== it.kind) continue;
      const note = collect(world, g.owner, it, resourceMult(world, g.owner), g);
      if (g.owner === me && (it.kind !== 'gold' || Math.random() < 0.25)) world.ui.say(`${g.workerKind === 'wood' ? 'Oduncu' : g.workerKind === 'gold' ? 'Madenci' : 'Çiftçi'}: ${note}`, 900);
      if (g.work && g.work.item === it) g.work.item = null;
      burst(world, it.pos.x, 0.7, it.pos.z, itemColor(it.kind), 4, 0.08);
      removeItem(world, it); break;
    }
  }
}

// ---------- Tarafsız kamplar ve haydutlar ----------

/** Yerleşim uygun mu: yoldan, sancaklardan, çalışma yerlerinden uzak ve boş bir nokta. */
function freeNeutralSpot(world, x, z, radius, minLane, minBanner, others, minGap) {
  const lanes = world.lanePoints || [];
  if (Math.abs(x) > world.half - 12 || Math.abs(z) > world.half - 12) return false;
  if (lanes.some(p => Math.hypot(p.x - x, p.z - z) < minLane)) return false;
  if (world.structures.some(s => s.kind === 'banner' && Math.hypot(s.pos.x - x, s.pos.z - z) < minBanner)) return false;
  if (world.spots.some(s => Math.hypot(s.x - x, s.z - z) < 10)) return false;
  if (others.some(o => Math.hypot(o.x - x, o.z - z) < minGap)) return false;
  return !canPlace(world, x, z, radius);
}

/** Haydut sayısı arenayla ölçeklenir: 1v1 arenası (120) taban, alan oranı kadar çoğalır. */
const banditScale = world => (world.half / 120) ** 2;

/**
 * İki tarafsız kamp: haritanın **boş köşelerine** kurulur — mavi takım (-x, +z) ve kırmızı takım (+x, -z)
 * köşelerinde olduğundan kamplar (-x, -z) ve (+x, +z) köşelerine gider (bkz. environment.js layout.corners).
 * Her kamp en yakın sancağın takımına **akıncıdır**: kurulduktan CAMPS.waveTime sonra her türden asker +
 * bir mancınık çıkarıp o takımın kulelerine saldırır.
 */
export function initCamps(world) {
  const C = CAMPS, r = BUILDINGS.camp.radius + 1;
  const lim = world.half - C.edge;
  const spots = [];
  for (const c of world.layout.corners) {
    let best = null;
    for (let tries = 0; tries < 3000 && !best; tries++) {
      const x = Math.max(-lim, Math.min(lim, c.x + rrand(-C.cornerSearch, C.cornerSearch)));
      const z = Math.max(-lim, Math.min(lim, c.z + rrand(-C.cornerSearch, C.cornerSearch)));
      if (freeNeutralSpot(world, x, z, r, C.minLaneDist, 30, spots, 20)) best = { x, z };
    }
    if (best) spots.push(best);
  }
  const camps = spots.map(p => {
    const s = createStructure(world, 'camp', 'beast', p.x, p.z, { instant: true });
    s.waveTimer = CAMPS.waveTime; s.guardTimer = CAMPS.guardEvery; s.respawnTimer = 0;
    // Hangi takıma akın edecek: hangi sancak daha yakınsa.
    let side = 'blue', bd = Infinity;
    for (const q of world.players) { const d = Math.hypot(p.x - q.banner.pos.x, p.z - q.banner.pos.z); if (d < bd) { bd = d; side = q.faction; } }
    s.raidSide = side;
    return s;
  });
  world.camps = camps;
  for (const c of camps) for (const key of CAMPS.guards) spawnCampUnit(world, c, key);
  return camps;
}

/** Kampın çevresinde tarafsız bir asker doğurur. raidSide verilirse kamptan ayrılıp o takımın kulelerine gider. */
export function spawnCampUnit(world, camp, typeKey, raidSide = null) {
  const a = rrand(0, Math.PI * 2), r = camp.radius + rrand(1.6, 4);
  const e = spawnNeutral(world, camp.pos.x + Math.cos(a) * r, camp.pos.z + Math.sin(a) * r, typeKey, { aggro: CAMPS.aggro, leash: CAMPS.leash });
  if (!e) return null;
  e.camp = camp; e.raidSide = raidSide;
  e.brain.den = { x: camp.pos.x, z: camp.pos.z };
  return e;
}

/** Tarafsız bir asker yaratır (kamp muhafızı, akıncı ya da haydut). Sahibi yoktur; kendi durduğu yeri korur. */
export function spawnNeutral(world, x, z, typeKey, { aggro = BANDITS.aggro, leash = BANDITS.leash } = {}) {
  const type = SOLDIER_TYPES.find(t => t.key === typeKey);
  if (!type) return null;
  const e = createEntity({ faction: 'beast', loadout: { weapon: type.weapon, shield: type.shield, horse: type.horse }, x, z });
  e.typeKey = type.key; e.isBeast = true; e.vision = type.siege ? VISION.soldier : aggro + 4;
  if (type.siege) { e.isSiege = true; e.stats.maxHp = SIEGE.hp; e.hp = SIEGE.hp; e.stats.speed = SIEGE.speed; e.radius = SIEGE.radius; e.stats.radius = SIEGE.radius; }
  e.guard = { aggro, leash };
  e.brain = { mode: 'beast', timer: 0, target: null, retarget: 0, den: { x, z } };
  e.spawnTimer = 0.5;
  buildView(world.scene, e);
  world.entities.push(e);
  return e;
}

/** Araziye serpiştirilmiş haydutlar: yollardan ve üslerden uzak, birbirinden ayrı noktalarda dururlar. */
export function initBandits(world) {
  world.banditTimer = BANDITS.spawnEvery;
  const n = Math.round(BANDITS.initial * banditScale(world));
  for (let i = 0; i < n; i++) spawnBandit(world);
}

/** Uygun bir yere tek bir haydut koyar (yer bulunamazsa hiçbir şey yapmaz). */
export function spawnBandit(world) {
  const B = BANDITS, lim = world.half - B.edge;
  const others = world.entities.filter(e => e.alive && e.isBeast).map(e => ({ x: e.pos.x, z: e.pos.z }));
  const campSpots = (world.camps || []).map(c => ({ x: c.pos.x, z: c.pos.z }));
  for (let tries = 0; tries < 400; tries++) {
    const x = rrand(-lim, lim), z = rrand(-lim, lim);
    if (!freeNeutralSpot(world, x, z, 1.2, B.minLaneDist, B.minBannerDist, [...others, ...campSpots], B.minGap)) continue;
    const key = B.types[Math.floor(Math.random() * B.types.length)];
    const e = spawnNeutral(world, x, z, key, { aggro: B.aggro, leash: B.leash });
    if (e) e.isBandit = true;
    return e;
  }
  return null;
}

/**
 * Kamplar ve haydutlar:
 *  - Kamp dakikada **bir** muhafız doğurur (eksikse) ve dakikada **bir** akın dalgası (her türden asker + mancınık)
 *    çıkarıp hedef takımın kulelerine yollar. Dalga sayacı kamp kurulduğunda / yeniden kurulduğunda 1 dakikadan başlar.
 *  - Yıkık kamp CAMPS.respawn saniye sonra yerinde yeniden kurulur.
 *  - Haydutlar BANDITS.spawnEvery saniyede bir, en çok BANDITS.max (arenayla ölçekli) olacak şekilde araziye eklenir.
 */
export function updateCamps(world, dt) {
  if (world.camps) for (const camp of world.camps) {
    if (!camp.alive) {
      camp.respawnTimer = Math.max(0, (camp.respawnTimer || 0) - dt);
      if (camp.respawnTimer <= 0) {
        reviveCamp(world, camp);
        camp.waveTimer = CAMPS.waveTime; camp.guardTimer = CAMPS.guardEvery;
        for (const key of CAMPS.guards) spawnCampUnit(world, camp, key);
        if (world.fog.isVisible(camp.pos.x, camp.pos.z)) world.ui.say('Haydut kampı yeniden kuruldu: 1 dakika sonra akın başlar!', 2600);
      }
      continue;
    }
    // Dakikada bir muhafız: eksik türlerden ilkini doğurur.
    camp.guardTimer = (camp.guardTimer || 0) - dt;
    if (camp.guardTimer <= 0) {
      camp.guardTimer = CAMPS.guardEvery;
      const missing = CAMPS.guards.find(k => !world.entities.some(e => e.alive && e.isBeast && e.camp === camp && !e.raidSide && e.typeKey === k));
      if (missing) spawnCampUnit(world, camp, missing);
    }
    // Dakikada bir akın dalgası: her türden asker + bir mancınık.
    camp.waveTimer = (camp.waveTimer || CAMPS.waveTime) - dt;
    if (camp.waveTimer > 0) continue;
    camp.waveTimer = CAMPS.waveTime;
    for (const key of CAMPS.wave) spawnCampUnit(world, camp, key, camp.raidSide);
    spawnCampUnit(world, camp, 'catapult', camp.raidSide);
    ring(world, camp.pos.x, camp.pos.z, '#8fd15a', 5, 0.8);
    if (camp.raidSide === 'blue') { world.ui.say('Haydut kampı akına çıktı: takımının kulelerine mancınıklı dalga geliyor!', 2600); world.ui.ping('tower'); }
  }
  // Haydutlar arada bir yeniden belirir.
  world.banditTimer = (world.banditTimer || BANDITS.spawnEvery) - dt;
  if (world.banditTimer <= 0) {
    world.banditTimer = BANDITS.spawnEvery;
    const n = world.entities.filter(e => e.alive && e.isBandit).length;
    if (n < Math.round(BANDITS.max * banditScale(world))) spawnBandit(world);
  }
}

// ---------- Birim basma ----------

/**
 * İşçi sınırı (world.limits.workers) bir oyuncunun bütün işçi türlerinin **toplamıdır** ve üretimi durdurmaz: yeni işçi
 * çıkınca sahadaki **en kalabalık** işçi türünden bir kademe eksilir (eşitlikte yeni işçinin türü değil öbürü eksilir;
 * kademesi 1 olan işçi ölmeden, birleşen işçi gibi sessizce sahneden kalkar). Böylece toplam sabit kalır, dağılım yeni türe kayar.
 * Eksiltilen türün adını döndürür (üretim mesajına yazılır), gerekmediyse null.
 */
export function trimWorkers(world, owner, fresh = null) {
  const LABEL = { gold: 'madenci', wood: 'oduncu', food: 'çiftçi' };
  let removed = null;
  for (let guard = 0; guard < 64; guard++) {
    const by = { wood: 0, gold: 0, food: 0 };
    let total = 0;
    for (const e of world.entities) {
      if (!e.alive || e.merged || e.owner !== owner || !e.isWorker) continue;
      const n = e.tier || 1; by[e.workerKind] += n; total += n;
    }
    if (total <= world.limits.workers) break;
    // En kalabalık tür; eşitlikte yeni işçinin türü en sona kalır.
    let kind = null, best = -Infinity;
    for (const k of Object.keys(by)) {
      if (!by[k]) continue;
      const score = by[k] - (fresh && k === fresh.workerKind ? 0.5 : 0);
      if (score > best) { best = score; kind = k; }
    }
    // O türden (yeni işçinin kendisi hariç) kademesi en yüksek işçiden bir kademe alınır.
    let victim = null;
    for (const e of world.entities) {
      if (!e.alive || e.merged || e.owner !== owner || !e.isWorker || e.workerKind !== kind || e === fresh) continue;
      if (!victim || (e.tier || 1) > (victim.tier || 1)) victim = e;
    }
    if (!victim) break;
    if ((victim.tier || 1) > 1) victim.tier -= 1; else { victim.merged = true; victim.mergeTo = null; }
    removed = kind;
  }
  return removed ? LABEL[removed] : null;
}

/**
 * Kuyruktan çıkan birimi binanın yanında, **binanın sahibine** yaratır (ücret sırada ödendi). Sahibin sancağı yıkıksa null.
 */
export function spawnUnit(world, typeKey, owner, building) {
  const type = SOLDIER_TYPES.find(t => t.key === typeKey);
  if (!type || !owner || !building || !building.alive) return null;
  const bag = owner.eco;
  if (!owner.banner || !owner.banner.alive) return null;
  bag.soldiersSpawned++;

  // Binanın merkeze bakan tarafında doğ.
  const toCenter = Math.atan2(-building.pos.z, -building.pos.x);
  const a = toCenter + rrand(-1.1, 1.1), r = building.radius + rrand(1.2, 2.4);
  const e = createEntity({ faction: owner.faction, owner, loadout: { weapon: type.weapon, shield: type.shield, horse: type.horse }, x: building.pos.x + Math.cos(a) * r, z: building.pos.z + Math.sin(a) * r });
  e.typeKey = type.key; e.rallyClass = classOf(type); e.vision = type.worker ? VISION.worker : VISION.soldier;
  if (type.worker) {
    e.isWorker = true; e.workerKind = type.worker;
    e.stats.maxHp = WORKER.hp; e.hp = e.stats.maxHp; e.stats.speed = WORKER.speed;
    e.brain = { mode: 'gather', timer: 0, target: null, retarget: 0 };
    e.work = { spot: null, item: null };
    // Kademe: bu işçinin temsil ettiği işçi sayısı; her çalışmada bu kadar ürün çıkarır.
    e.tier = 1;
    // Aynı sahibin aynı türde sahada işçisi varsa yenisi ona yürüyüp birleşir (sayı artmaz, üretim artar).
    e.mergeTo = world.entities.find(o => o.alive && o.isWorker && o.owner === owner && o.workerKind === e.workerKind && !o.mergeTo) || null;
  } else { e.stats.maxHp = SOLDIER_BASE.hp; e.hp = e.stats.maxHp; e.brain.order = null; e.brain.home = { x: e.pos.x, z: e.pos.z }; }
  if (type.siege) { e.isSiege = true; e.stats.maxHp = SIEGE.hp; e.hp = SIEGE.hp; e.stats.speed = SIEGE.speed; e.radius = SIEGE.radius; e.vision = VISION.siege; }
  e.facing = Math.atan2(-building.pos.x, -building.pos.z);
  e.spawnTimer = 0.5;
  buildView(world.scene, e);
  world.entities.push(e);
  // İşçi sınırı toplamdır: gerekiyorsa en kalabalık türden bir kademe eksilir, yeni işçi onun yerine geçer.
  if (e.isWorker) e.replacedLabel = trimWorkers(world, owner, e);
  const color = owner.faction === 'blue' ? '#9fd6ff' : '#ffb59f';
  burst(world, e.pos.x, 1, e.pos.z, color, 12, 0.11);
  ring(world, e.pos.x, e.pos.z, color, 2.2, 0.5);
  ring(world, building.pos.x, building.pos.z, color, building.radius + 3.5, 0.6);
  building.spawnTimer = 0.35;
  if (owner.faction === 'red') world.ui.flash('enemyGold');
  return e;
}

/** Bina / kule kurar (odunla, sahibinin kahramanının yakınına); odun yetmezse, kahraman uzaksa ya da yer uygun değilse sebep döner. */
export function buildStructure(world, kind, owner, x, z, { instant = false } = {}) {
  const spec = BUILDINGS[kind];
  if (!spec || kind === 'banner') return 'Bilinmeyen yapı';
  const bag = owner.eco;
  if (!owner.banner || !owner.banner.alive) return 'Sancak yıkıldı, inşa edilemez';
  if (bag.gold < spec.cost || bag.wood < spec.wood) return `Yetersiz odun: ${spec.label} ${spec.wood} odun`;
  // Yapı sınırı: kuleler ve diğer binalar ayrı ayrı sayılır (sancak hariç).
  const isTower = kind === 'tower', cap = isTower ? world.limits.towers : world.limits.buildings;
  if (structureCount(world, owner, isTower) >= cap) return isTower ? `Kule sınırı dolu (en fazla ${cap} kule) · birini yıkabilirsin` : `Bina sınırı dolu (en fazla ${cap} bina) · birini yıkabilirsin`;
  if (!instant) {
    const hero = owner.hero;
    if (!hero || !hero.alive) return 'Kahraman yerde, inşa edilemez';
    if (Math.hypot(hero.pos.x - x, hero.pos.z - z) > BUILD.heroRadius) return `Kahramandan uzak: bina kahramanın ${BUILD.heroRadius} birim yakınına dikilir`;
    const why = placementError(world, kind, x, z, owner);
    if (why) return why;
  }
  const why = canPlace(world, x, z, spec.radius, owner.faction);
  if (why) return why;
  bag.gold -= spec.cost; bag.wood -= spec.wood;
  const s = createStructure(world, kind, owner.faction, x, z, { instant, owner });
  const color = owner.faction === 'blue' ? '#9fd6ff' : '#ffb59f';
  burst(world, x, 1.5, z, color, 16, 0.13);
  ring(world, x, z, color, spec.radius + 4, 0.7);
  if (owner.human) { world.ui.flash('gold'); world.ui.ping('tower'); } else if (owner.faction === 'red') world.ui.flash('enemyGold');
  return s;
}

/**
 * Sayım: `sel` bir oyuncuysa onun, bir takım adıysa ('blue' / 'red') o takımın tümünün işçi türü, asker sayısı ve
 * türleri, bina türleri, kuleleri.
 */
function census(world, sel) {
  const mine = typeof sel === 'string' ? o => o.faction === sel : o => o.owner === sel;
  const c = { workers: { wood: 0, gold: 0, food: 0 }, army: 0, types: {}, buildings: {}, towers: 0 };
  for (const e of world.entities) {
    if (!e.alive || !mine(e) || e.isPlayer || e.isHero) continue;
    // İşçide kademe sayılır: taklit eden bot da aynı üretim gücünü hedefler.
    if (e.isWorker) c.workers[e.workerKind] += e.tier || 1; else { c.army++; c.types[e.typeKey] = (c.types[e.typeKey] || 0) + 1; }
  }
  for (const s of world.structures) {
    if (!s.alive || !mine(s)) continue;
    if (s.kind === 'tower') c.towers++; else c.buildings[s.kind] = (c.buildings[s.kind] || 0) + 1;
  }
  return c;
}
/** Takım sayımını oyuncu payına indirir: bot, rakip takımın toplamının kendi takımındaki oyuncu sayısına bölümünü hedefler. */
function scaleCensus(c, k) {
  const scale = o => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, Math.ceil(v * k)]));
  return { workers: scale(c.workers), army: Math.ceil(c.army * k), types: scale(c.types), buildings: scale(c.buildings), towers: Math.ceil(c.towers * k) };
}

/**
 * Bot ordusunun toplanma noktası: en yakın rakip sancağa **en yakın** (en ileri) ayakta kendi kulesinin hemen önü. Ordu
 * orada kulesinin koruması altında birikir ve saldırıya oradan çıkar; kule zinciri ilerledikçe toplanma da öne kayar.
 * Nokta rakip kule menziline düşüyorsa kulenin arkasına çekilir. Hiç kule yoksa sancaktan merkeze doğru toplanır.
 */
export function botRally(world, p) {
  const b = p.banner, foe = nearestEnemyBanner(world, p.faction, b.pos);
  const target = foe ? foe.pos : { x: 0, z: 0 };
  let tower = null, td = Infinity;
  for (const s of world.structures) {
    if (!s.alive || s.owner !== p || s.kind !== 'tower') continue;
    const d = Math.hypot(s.pos.x - target.x, s.pos.z - target.z);
    if (d < td) { td = d; tower = s; }
  }
  if (tower) {
    const dx = target.x - tower.pos.x, dz = target.z - tower.pos.z, l = Math.hypot(dx, dz) || 1;
    for (const off of [ENEMY_AI.towerOffset, 0, -ENEMY_AI.towerOffset]) {
      const x = tower.pos.x + (dx / l) * off, z = tower.pos.z + (dz / l) * off;
      if (!inEnemyTowerRange(world, p.faction, { x, z })) return { x, z };
    }
    return { x: tower.pos.x, z: tower.pos.z };
  }
  const d = Math.hypot(b.pos.x, b.pos.z) || 1;
  return { x: b.pos.x - (b.pos.x / d) * ENEMY_AI.rallyDist, z: b.pos.z - (b.pos.z / d) * ENEMY_AI.rallyDist };
}

/**
 * Kule zincirinin bir sonraki yeri: botun en ileri kulesinden (yoksa sancağından) en yakın rakip sancağa doğru bir adım;
 * yer doluysa çevresinde boş nokta aranır. Rakip kule menziline yakın noktalar ve hedefe stopDist'ten yakın adımlar elenir.
 */
export function creepTowerSpot(world, p) {
  const C = ENEMY_AI.creep, foe = nearestEnemyBanner(world, p.faction, p.banner.pos);
  if (!foe) return null;
  const target = foe.pos, own = p.banner.pos;
  // En ileri kendi kulesi (yoksa sancak): zincir oradan rakip sancağa doğru ilerler.
  let fd = Math.hypot(own.x - target.x, own.z - target.z), front = own;
  for (const s of world.structures) {
    if (!s.alive || s.owner !== p || s.kind !== 'tower') continue;
    const d = Math.hypot(s.pos.x - target.x, s.pos.z - target.z);
    if (d < fd) { fd = d; front = s.pos; }
  }
  if (fd <= C.stopDist + 1) return null;
  const r = BUILDINGS.tower.radius;
  const foeTowers = world.structures.filter(s => s.alive && s.kind === 'tower' && s.faction !== p.faction);
  const safe = (x, z) => foeTowers.every(t => Math.hypot(t.pos.x - x, t.pos.z - z) > TOWER.range + C.avoidTower);
  // Kuleler yalnızca yollara dikilebildiği için aday noktalar doğrudan yol üstünden seçilir:
  // rakip sancağa en yakın, ileri doğru bir adımlık ve kurallara uyan yol noktası.
  let best = null, bestScore = Infinity;
  for (const q of world.lanePoints) {
    const toTarget = Math.hypot(q.x - target.x, q.z - target.z);
    if (toTarget <= C.stopDist || toTarget >= fd) continue;
    if (Math.hypot(q.x - front.x, q.z - front.z) > C.step * 1.6) continue;
    if (!safe(q.x, q.z)) continue;
    if (placementError(world, 'tower', q.x, q.z, p)) continue;
    if (canPlace(world, q.x, q.z, r, p.faction)) continue;
    if (toTarget < bestScore) { bestScore = toTarget; best = { x: q.x, z: q.z }; }
  }
  return best;
}

/** Bot ordusunun (asker) merkezi ve bu merkezin çevresindeki rakip / kendi takım savaşçısı sayısı (haydutlar sayılmaz). */
function crowdAround(world, p, mine) {
  if (!mine.length) return { foes: 0, own: 0 };
  let cx = 0, cz = 0; for (const e of mine) { cx += e.pos.x; cz += e.pos.z; } cx /= mine.length; cz /= mine.length;
  let foes = 0, own = 0;
  for (const e of world.entities) {
    if (!e.alive || e.isWorker || e.isBeast) continue;
    if (Math.hypot(e.pos.x - cx, e.pos.z - cz) > ENEMY_AI.crowdRadius) continue;
    if (e.faction !== p.faction) foes++; else if (!e.isHero) own++;
  }
  return { foes, own };
}

/**
 * Birikme / saldırı: botun ordusu rakip payına denk (ve en az minWave) olunca hepsi saldırır. Saldırıdayken ordu rakip
 * payının altına inince, eriyince ya da karşısında kalabalık görünce kulelerinin dibine çekilir ve yeniden birikir.
 */
function updateBotStance(world, p, me, you) {
  const ai = p.ai, X = ENEMY_AI.extra[world.difficulty];
  const mine = world.entities.filter(e => e.alive && e.owner === p && !e.isHero && !e.isWorker);
  const retreat = why => {
    ai.attacking = false;
    const r = botRally(world, p);
    giveOrder(world, mine, { kind: 'move', x: r.x, z: r.z });
    botSay(world, p, why, 2500);
  };
  // Rakipte kule varken bot mancınıksız yürümez: saldırıdaysa çekilir, değilse bekler ve mancınık için biriktirir.
  const foeTowers = world.structures.some(s => s.alive && s.kind === 'tower' && s.faction !== p.faction);
  const siege = world.entities.some(e => e.alive && e.owner === p && e.isSiege);
  ai.needSiege = foeTowers && !siege;
  if (ai.needSiege) { if (ai.attacking) retreat('ordusu mancınıksız kulelere yürümez, çekiliyor'); return; }
  const threshold = Math.max(ENEMY_AI.minWave, you.army + X.army);
  if (!ai.attacking) {
    if (me.army >= threshold) { ai.attacking = true; ai.launchSize = me.army; botSay(world, p, `ordusu (${me.army} asker) saldırıya geçti!`, 3000); }
    return;
  }
  if (me.army < Math.max(2, ai.launchSize * ENEMY_AI.retreatRatio)) { retreat('ordusu eridi, kulelerine çekiliyor'); return; }
  if (me.army < you.army) { retreat('ordusu sayıca geride kaldı, kulelerine çekiliyor'); return; }
  const c = crowdAround(world, p, mine);
  if (c.foes > c.own * ENEMY_AI.crowdRatio) retreat(`ordusu kalabalık gördü (${c.foes} savaşçı), kulelerine çekiliyor`);
}

/**
 * Bot savunması: botun **kulesi** ya da **sancağı** vurulunca en son vurulan yapı savunma noktası olur ve vuruş
 * ENEMY_AI.defend.memory saniye hatırlanır. O noktanın recall yarıçapındaki kendi askerleri oraya `defend` işaretli
 * move emriyle koşar — bu emir saldırı düzenini de keser (bkz. ai.js updateUnit) — ve **botun kahramanı** da oraya
 * gider (bkz. ai.js updateGatherer). Yolda düşman görürlerse zaten durup dövüşürler. Takım arkadaşları koşmaz.
 */
function updateBotDefense(world, p, dt) {
  const ai = p.ai, D = ENEMY_AI.defend;
  if (ai.defend && world.time - ai.defend.at > D.memory) ai.defend = null;
  ai.defendTimer = (ai.defendTimer || 0) - dt;
  if (ai.defendTimer > 0) return;
  ai.defendTimer = D.check;
  let hit = null;
  for (const s of world.structures) {
    if (!s.alive || s.owner !== p || (s.kind !== 'tower' && s.kind !== 'banner')) continue;
    if (world.time - (s.lastHitAt ?? -99) > D.memory) continue;
    if (!hit || s.lastHitAt > hit.lastHitAt) hit = s;
  }
  if (!hit) return;
  const fresh = !ai.defend || ai.defend.s !== hit;
  ai.defend = { s: hit, x: hit.pos.x, z: hit.pos.z, at: hit.lastHitAt };
  const near = e => Math.hypot(e.pos.x - hit.pos.x, e.pos.z - hit.pos.z);
  const away = world.entities.filter(e => e.alive && e.owner === p && !e.isHero && !e.isWorker && e.brain
    && !(e.brain.order && e.brain.order.defend) && near(e) < D.recall && near(e) > D.hold);
  if (away.length) giveOrder(world, away, { kind: 'move', x: hit.pos.x, z: hit.pos.z, defend: true });
  if (fresh) botSay(world, p, `${hit.kind === 'tower' ? 'kulesi' : 'sancağı'} saldırı altında: ordusu ve kahramanı savunmaya koşuyor`, 2400);
}

/**
 * Bot ekonomisi: rakip takımı taklit eder. Her karar turunda rakip takımın sayımını alır, kendi takımındaki oyuncu
 * sayısına böler (payı) ve şu sırayla hedefler: işçiler (türe göre pay kadar + ek) -> binalar (rakipte olan bina türü
 * kendinde yoksa kurar, eksik / eksik kalan kuleler) -> asker (rakibin tür dağılımını kopyalar). Bina için odun
 * bekliyorsa asker basımı engellenmez. Askerler toplanma noktasında birikir; saldırı kararı updateBotStance'ta.
 * Aynı döngü senin takımındaki botlar için de çalışır: onlar rakip takımı taklit edip senin yanında savaşır.
 */
function updateBotEconomy(world, p, dt) {
  const ai = p.ai, banner = p.banner;
  if (!banner.alive) return;
  ai.spawnTimer -= dt;
  if (ai.spawnTimer > 0) return;
  ai.spawnTimer = ENEMY_HERO.spawnCheck;
  const base = p.base, X = ENEMY_AI.extra[world.difficulty], eco = p.eco;
  const foeTeam = enemyOf(p.faction), mates = teamOf(world, p.faction).length;
  const me = census(world, p), you = scaleCensus(census(world, foeTeam), 1 / mates);

  // 0) Bot kahramanı da öldürdüklerinden exp kazanır; geride kalırsa tur başına bir seviye alarak en yüksek rakip
  // kahramana yetişir (seviye altınla alınmadığı için bedeli yoktur).
  const rh = p.hero;
  let top = 1;
  for (const q of world.players) if (q.faction === foeTeam && q.hero) top = Math.max(top, q.hero.level);
  if (rh && rh.alive && rh.level < top) { applyLevelUp(rh); ring(world, rh.pos.x, rh.pos.z, '#ffb59f', 3, 0.6); }

  updateBotStance(world, p, me, you);

  // Saldırıda değilken ordu en ileri kulenin dibinde toparlanır; zincir ilerledikçe toplanma noktası öne kayar.
  if (!ai.attacking) {
    const r = botRally(world, p);
    const idle = world.entities.filter(e => e.alive && e.owner === p && !e.isHero && !e.isWorker
      && !(e.brain && e.brain.order) && Math.hypot(e.pos.x - r.x, e.pos.z - r.z) > ENEMY_AI.regroupDist);
    if (idle.length) giveOrder(world, idle, { kind: 'move', x: r.x, z: r.z });
  }

  // 1) İşçiler: rakip payının her türdeki işçisi kadar (+ ek).
  for (const wt of WORKER_TYPES) {
    const target = Math.max(ENEMY_AI.minWorkersPerKind, (you.workers[wt.worker] || 0) + X.workers) + (wt.worker === 'wood' ? ENEMY_AI.creep.extraWoodcutters : 0);
    const n = me.workers[wt.worker] + queuedOf(world, p, wt.key);
    // Toplam işçi sınırı dolduysa bot yeni işçi basmaz (yerine geçirmeyle oynamaz).
    if (workerTotal(world, p) >= world.limits.workers) break;
    if (n < target && banner.queue.length < ENEMY_HERO.queueDepth + 1) { if (!enqueue(world, banner, wt.key, p)) botSay(world, p, `${wt.label.toLowerCase()} basıyor`, 1200, true); break; }
  }

  // 2) Binalar: her türde rakip payı kadar (kışla en az 1); bina kahramanın yanına dikilir, kahraman uzaksa oraya yollanır.
  //    'wait' odun / kahraman bekliyor demek, asker basımını engellemez.
  const has = kind => me.buildings[kind] || 0;
  const hero = p.hero;
  const freeSpot = (kind, cands) => cands.find(q => !canPlace(world, q.x, q.z, BUILDINGS[kind].radius, p.faction) && !placementError(world, kind, q.x, q.z, p)) || null;
  const tryBuild = (kind, spot) => {
    if (eco.gold < BUILDINGS[kind].cost || eco.wood < BUILDINGS[kind].wood) return 'wait';
    if (!spot) return 'fail';
    if (!hero || !hero.alive) return 'wait';
    if (Math.hypot(hero.pos.x - spot.x, hero.pos.z - spot.z) > BUILD.heroRadius) { hero.errand = { x: spot.x, z: spot.z, kind, ttl: 30 }; return 'wait'; }
    const r = buildStructure(world, kind, p, spot.x, spot.z);
    hero.errand = null;
    if (typeof r !== 'string') { botSay(world, p, `${BUILDINGS[kind].label.toLowerCase()} kuruyor`, 2000); return 'built'; }
    return 'fail';
  };
  const wants = [];
  for (const kind of ['barracks', 'archery', 'stable', 'siege']) {
    // Savaş aletleri: rakipte varsa ya da kulelerini kırmak için gerekiyorsa en az 1.
    const target = kind === 'barracks' ? Math.max(1, you.buildings.barracks || 0) : kind === 'siege' && ai.needSiege ? Math.max(1, you.buildings.siege || 0) : (you.buildings[kind] || 0);
    if (has(kind) < target) wants.push([kind, freeSpot(kind, [base.at(POSITIONS.base[kind]), ...ENEMY_AI.buildSpots.map(o => base.at(o))])]);
  }
  const missingTower = p.towerSpots.find(t => !world.structures.some(s => s.alive && s.kind === 'tower' && Math.hypot(s.pos.x - t.x, s.pos.z - t.z) < 3));
  if (missingTower) wants.push(['tower', missingTower]);
  // Kule zinciri (en düşük öncelik): taklit tamamsa rakip sancağa doğru bir adım daha kule.
  const hasCatapult = world.entities.some(e => e.alive && e.owner === p && e.isSiege) || queuedOf(world, p, 'catapult') > 0;
  if (me.towers < ENEMY_AI.creep.maxTowers && !(ai.needSiege && !hasCatapult)) { const c = creepTowerSpot(world, p); if (c) wants.push(['tower', c]); }
  for (const [kind, spot] of wants) { const r = tryBuild(kind, spot); if (r === 'built') return; if (r === 'wait') break; }

  // 3) Asker: rakip payının (canlı + sırada) armyMult katı kadar; tür dağılımını kopyala, rakipte o tür yoksa sırayla.
  // Mancınık gerekiyorsa (ordu sınırından bağımsız): savaş aletleri hazırsa önce mancınık; ordu rakibe denkse başka asker
  // basmayıp kaynak biriktirir.
  if (ai.needSiege && !hasCatapult) {
    const sw = bestProducer(world, p, 'siege'), ct = SOLDIER_ONLY.find(t => t.key === 'catapult');
    if (sw && eco.gold >= ct.cost && eco.wood >= ct.wood) { if (!enqueue(world, sw, 'catapult', p)) botSay(world, p, 'mancınık basıyor', 1800, true); return; }
    if (me.army >= you.army) return;
  }
  // Taklit sınırı ve nüfus sınırı: hangisi önce dolarsa.
  const youQueued = Math.ceil(teamOf(world, foeTeam).reduce((a, q) => a + queuedSoldiers(world, q), 0) / mates);
  const cap = Math.min(Math.ceil((you.army + youQueued) * ENEMY_AI.armyMult) + X.army, world.limits.army);
  if (me.army + queuedSoldiers(world, p) >= cap || armyCount(world, p) >= world.limits.army) return;
  const options = SOLDIER_ONLY.filter(t => { const b = bestProducer(world, p, t.building); return b && b.ready && b.queue.length < ENEMY_HERO.queueDepth && eco.gold >= t.cost && eco.food >= t.food && eco.wood >= (t.wood || 0); });
  if (!options.length) return;
  let pick = null;
  // Önce anti: rakibin en kalabalık asker türünü tek atan bir tür (zorluğa göre olasılıkla).
  const topType = Object.entries(you.types).filter(([k]) => k !== 'catapult').sort((a, b) => b[1] - a[1])[0];
  if (topType && Math.random() < ENEMY_AI.counterChance[world.difficulty]) {
    const counters = options.filter(t => ANTI.table[t.key] && ANTI.table[t.key].includes(topType[0]));
    if (counters.length) pick = counters[Math.floor(Math.random() * counters.length)];
  }
  const copy = options.filter(t => you.types[t.key]);
  if (pick) { /* anti seçildi */ }
  else if (copy.length && Math.random() < ENEMY_AI.copyChance) {
    let r = Math.random() * copy.reduce((s, t) => s + you.types[t.key], 0);
    for (const t of copy) { r -= you.types[t.key]; if (r <= 0) { pick = t; break; } }
    pick = pick || copy[copy.length - 1];
  } else pick = options[ai.typeIndex++ % options.length];
  if (!enqueue(world, bestProducer(world, p, pick.building), pick.key, p)) botSay(world, p, `${pick.label.toLowerCase()} basıyor`, 1400, true);
}

/** Bütün botlar (iki takımda da): önce savunma çağrısı, sonra ekonomi / ordu kararı. */
export function updateBots(world, dt) {
  for (const p of world.players) {
    if (p.human) continue;
    updateBotDefense(world, p, dt);
    updateBotEconomy(world, p, dt);
  }
}
