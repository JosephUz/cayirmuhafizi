import * as T from 'three';
import { addEntity, applyLevelUp, createEntity, reachOf } from './characters.js';
import { ANTI, BANDITS, BUILD, BUILDINGS, CAMPS, ECONOMY, ENEMY_AI, ENEMY_HERO, LEVEL, POSITIONS, SIEGE, SOLDIER_BASE, SOLDIER_TYPES, TOWER, VISION, WORKER } from './config.js';
import { giveOrder, inEnemyTowerRange } from './ai.js';
import { armyCount, bestProducer, enqueue, queuedOf, queuedSoldiers, workerTotal } from './production.js';
import { rrand } from './rng.js';
import { canPlace, createStructure, placementError, reviveCamp, structureCount } from './structures.js';
import { enemyOf, nearestEnemyBanner, resourceMult, teamOf } from './players.js';
import { statBuilt, statGathered, statSpent, statUnitMade, structureValue } from './stats.js';

/**
 * Ekonomi: her üssün arkasında maden (altın), odunluk (odun) ve tarla (yiyecek). Kaynak noktaları hiç tükenmez. Bir
 * toplayıcı (işçi, bot kahramanı ya da insan kahramanı) çalışma yerinde durup çalışır; süre dolunca çevreye bir ürün fırlar.
 * Ürün alındığı anda **sahibinin** kasasına girer (taşıma yok). Ölen asker yiyecek, yıkılan yapı odun bırakır (ganimet,
 * owner=null): bunları yalnızca kahramanlar toplar. Rakip takımın altını zorluk çarpanıyla ölçeklenir.
 * Eşyalar yalnızca veridir: { id, kind, owner, amount, pos (Vector3, y yükseklik), fly, ttl, claimedBy, taken, view }.
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
  for (const it of world.items) world.fx.removeItem(it);
  world.items.length = 0;
}

/** Çalışma yerinden çevreye bir ürün fırlatır; yere düşünce alınabilir. */
export function produceItem(world, spot, claimedBy = null) {
  const a = rrand(0, Math.PI * 2), d = rrand(ECONOMY.work.throwMin, ECONOMY.work.throwMax);
  const L = ECONOMY.loot;
  const item = {
    id: world.ids.item++, kind: spot.kind, owner: spot.owner || null, amount: spot.amount || 0, pos: new T.Vector3(spot.x, 0.6, spot.z), claimedBy, taken: false, phase: rrand(0, 6),
    // Ömür: ganimet (sahipsiz yiyecek / odun) ttl, exp küresi xpTtl, işçi ürünü ownedTtl; son saniyede küçülerek kaybolur.
    ttl: spot.kind === 'xp' ? L.xpTtl : spot.owner ? L.ownedTtl : L.ttl,
    fly: { fx: spot.x, fz: spot.z, tx: spot.tx ?? spot.x + Math.cos(a) * d, tz: spot.tz ?? spot.z + Math.sin(a) * d, t: 0, dur: 0.45 },
    view: null,
  };
  world.fx.burst(spot.x, 1, spot.z, itemColor(spot.kind), 5, 0.08);
  world.items.push(item);
  world.fx.addItem(item);
  return item;
}

export const itemColor = kind => (kind === 'gold' ? '#f3c53d' : kind === 'wood' ? '#c9a06a' : kind === 'xp' ? '#c48bff' : '#bfe59a');
/** Ekrandaki "+N" yazısının simgesi. */
const itemIcon = kind => (kind === 'gold' ? '◉' : kind === 'wood' ? '🪵' : kind === 'xp' ? 'exp' : '🌾');

/** Uçan ürünün yay hareketi: hem simülasyon hem (çevrim içi) istemci aynı eğriyi ilerletir. */
export function advanceItemFly(it, dt) {
  const f = it.fly; if (!f) return;
  f.t += dt;
  const k = Math.min(1, f.t / f.dur);
  it.pos.set(f.fx + (f.tx - f.fx) * k, 0.6 * (1 - k) + Math.sin(k * Math.PI) * 1.2, f.fz + (f.tz - f.fz) * k);
  if (k >= 1) { it.pos.y = 0; it.fly = null; }
}

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
  world.fx.burst(spot.x, 1.2, spot.z, node.kind === 'wood' ? '#8fbf6a' : node.kind === 'gold' ? '#c9c9d4' : '#e6d27a', 6 + n * 2, 0.1);
  return true;
}

/** Eşyayı listeden kaldırır; görünümü fx ile gider. */
function removeItem(world, item) {
  item.taken = true; item.claimedBy = null;
  world.fx.removeItem(item);
  const i = world.items.indexOf(item); if (i >= 0) world.items.splice(i, 1);
}

// ---------- Kaynak etkileri ----------

const near = (a, b, r) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz < r * r; };

/** Kahramanın bir kaynak çıkarışında (vuruş ya da çalışma) düşen ürün sayısı: **seviyesi kadar** (sv 1: 1, sv 7: 7). */
export const heroGather = e => (e.isPlayer || e.isHero ? Math.max(1, e.level || 1) : 1);

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

/** Ölen birimin bıraktığı exp küresi: yere düşer, yalnızca kahramanlar toplar. Kim öldürdüğünden bağımsızdır. */
export function dropXp(world, x, z, amount) {
  if (!(amount > 0)) return;
  const orbs = Math.max(1, Math.ceil(amount / LEVEL.xpOrbMax)), each = amount / orbs;
  for (let i = 0; i < orbs; i++) {
    const a = rrand(0, Math.PI * 2), d = rrand(0.5, 1.4 + orbs * 0.3);
    produceItem(world, { kind: 'xp', x, z, owner: null, amount: each, tx: x + Math.cos(a) * d, tz: z + Math.sin(a) * d });
  }
}

/**
 * Toplanan ürün anında **sahibinin** kasasına girer (exp ise toplayan kahramana yazılır). Altın k çarpanıyla
 * ölçeklenir (rakip botlarda zorluk). `taker` insan kahramanıysa ekranında "+N" yazısı çıkar.
 */
function collect(world, owner, it, k = 1, taker = null) {
  const bag = owner.eco;
  const float = (n, kind) => { if (taker && taker.isPlayer && taker.owner) world.fx.float(taker.owner, `+${n} ${itemIcon(kind)}`, { x: taker.pos.x, y: 0, z: taker.pos.z }, itemColor(kind)); };
  if (it.kind === 'xp') { const n = Math.round(it.amount || 0); if (taker) world.onXpCollected(taker, n); float(n, 'xp'); return; }
  if (it.kind === 'gold') { const g = Math.round(ECONOMY.gold.value * k); bag.gold += g; statGathered(owner, 'gold', g); if (owner.human) world.fx.flash(owner, 'gold'); float(g, 'gold'); return; }
  if (it.kind === 'wood') { bag.wood++; statGathered(owner, 'wood', 1); if (owner.human) world.fx.flash(owner, 'wood'); float(1, 'wood'); return; }
  bag.food++; statGathered(owner, 'food', 1); if (owner.human) world.fx.flash(owner, 'wood'); float(1, 'food');
}

// ---------- Ana güncelleme ----------

export function updateEconomy(world, dt) {
  const E = ECONOMY;
  if (world.nodes) for (const n of world.nodes) if (n.hitCd > 0) n.hitCd -= dt;

  // Uçan ürünler yere düşer.
  for (const it of world.items) advanceItemFly(it, dt);

  // İnsan kahramanının çalışması: kendi üssünün boş bir çalışma yerinde hareketsiz dur.
  for (const me of world.humans) {
    const p = me.hero, pw = me.eco.work;
    if (!p) continue;
    let spot = null;
    if (p.alive && p.moveDir.lengthSq() < 0.01 && p.attackTimer <= 0) {
      spot = world.spots.find(s => s.owner === me && near(s.pos, p.pos, E.work.spotRadius + p.radius));
    }
    if (spot) {
      if (pw.spot !== spot) { pw.spot = spot; pw.timer = 0; }
      pw.timer += dt; p.working = true; p.workTimer += dt;
      if (pw.timer >= E.work.heroTime) { pw.timer = 0; for (let i = 0; i < heroGather(p); i++) produceItem(world, spot); world.fx.ping(me, 'worker'); }
    } else { pw.spot = null; pw.timer = 0; p.working = false; }
  }

  // Ürünleri al: etkiler anında işlenir, taşıma yok. İnsan kahramanı kendi ürününü ve ganimeti alır.
  const gatherers = world.entities.filter(e => e.alive && (e.isHero || e.isWorker || e.isPlayer));
  for (let i = world.items.length - 1; i >= 0; i--) {
    const it = world.items[i];
    it.ttl -= dt;
    if (it.ttl <= 0) { removeItem(world, it); continue; }
    if (it.fly) continue;
    for (const g of gatherers) {
      // İşçi yalnızca kendi sahibinin kendi türündeki ürününü alır; kahraman (insan ya da bot) ganimeti de alır.
      const hero = g.isHero || g.isPlayer;
      if (!(it.owner === g.owner || (hero && it.owner === null)) || !near(it.pos, g.pos, g.radius + pickRadiusOf(g))) continue;
      if (g.workerKind && g.workerKind !== it.kind) continue;
      collect(world, g.owner, it, resourceMult(world, g.owner), g);
      if (g.work && g.work.item === it) g.work.item = null;
      world.fx.burst(it.pos.x, 0.7, it.pos.z, itemColor(it.kind), 4, 0.08);
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
 * İki tarafsız kamp: haritanın **boş köşelerine** kurulur. Her kamp en yakın sancağın takımına **akıncıdır**: kurulduktan
 * CAMPS.waveTime sonra her türden asker + bir mancınık çıkarıp o takımın kulelerine saldırır.
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
  addEntity(world, e);
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
 * Kamplar ve haydutlar: kamp dakikada bir muhafız doğurur (eksikse) ve dakikada bir akın dalgası çıkarır; yıkık kamp
 * CAMPS.respawn saniye sonra yerinde yeniden kurulur; haydutlar BANDITS.spawnEvery saniyede bir eklenir (en çok max).
 */
export function updateCamps(world, dt) {
  if (world.camps) for (const camp of world.camps) {
    if (!camp.alive) {
      camp.respawnTimer = Math.max(0, (camp.respawnTimer || 0) - dt);
      if (camp.respawnTimer <= 0) {
        reviveCamp(world, camp);
        camp.waveTimer = CAMPS.waveTime; camp.guardTimer = CAMPS.guardEvery;
        for (const key of CAMPS.guards) spawnCampUnit(world, camp, key);
      }
      continue;
    }
    camp.guardTimer = (camp.guardTimer || 0) - dt;
    if (camp.guardTimer <= 0) {
      camp.guardTimer = CAMPS.guardEvery;
      const missing = CAMPS.guards.find(k => !world.entities.some(e => e.alive && e.isBeast && e.camp === camp && !e.raidSide && e.typeKey === k));
      if (missing) spawnCampUnit(world, camp, missing);
    }
    camp.waveTimer = (camp.waveTimer || CAMPS.waveTime) - dt;
    if (camp.waveTimer > 0) continue;
    camp.waveTimer = CAMPS.waveTime;
    for (const key of CAMPS.wave) spawnCampUnit(world, camp, key, camp.raidSide);
    spawnCampUnit(world, camp, 'catapult', camp.raidSide);
    world.fx.ring(camp.pos.x, camp.pos.z, '#8fd15a', 5, 0.8);
    if (camp.raidSide === 'blue') for (const h of world.humans) world.fx.ping(h, 'tower');
  }
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
 * çıkınca sahadaki **en kalabalık** işçi türünden bir kademe eksilir. Eksiltilen türün adını döndürür, gerekmediyse null.
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
    let kind = null, best = -Infinity;
    for (const k of Object.keys(by)) {
      if (!by[k]) continue;
      const score = by[k] - (fresh && k === fresh.workerKind ? 0.5 : 0);
      if (score > best) { best = score; kind = k; }
    }
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

/** Kuyruktan çıkan birimi binanın yanında, **binanın sahibine** yaratır (ücret sırada ödendi). Sahibin sancağı yıkıksa null. */
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
  e.typeKey = type.key; e.vision = type.worker ? VISION.worker : VISION.soldier;
  if (type.worker) {
    e.isWorker = true; e.workerKind = type.worker;
    e.stats.maxHp = WORKER.hp; e.hp = e.stats.maxHp; e.stats.speed = WORKER.speed;
    e.brain = { mode: 'gather', timer: 0, target: null, retarget: 0 };
    e.work = { spot: null, item: null };
    e.tier = 1;
    // Aynı sahibin aynı türde sahada işçisi varsa yenisi ona yürüyüp birleşir (sayı artmaz, üretim artar).
    e.mergeTo = world.entities.find(o => o.alive && o.isWorker && o.owner === owner && o.workerKind === e.workerKind && !o.mergeTo) || null;
  } else { e.stats.maxHp = SOLDIER_BASE.hp; e.hp = e.stats.maxHp; e.brain.order = null; e.brain.home = { x: e.pos.x, z: e.pos.z }; }
  if (type.siege) { e.isSiege = true; e.stats.maxHp = SIEGE.hp; e.hp = SIEGE.hp; e.stats.speed = SIEGE.speed; e.radius = SIEGE.radius; e.vision = VISION.siege; }
  // Görüş silah menzilinin altında kalmaz: asker vurabildiğini görür, gördüğüyle savaşır (mancınık 36).
  if (!type.worker) e.vision = Math.max(e.vision, reachOf(e).range);
  e.facing = Math.atan2(-building.pos.x, -building.pos.z);
  e.spawnTimer = 0.5;
  addEntity(world, e);
  statUnitMade(owner, e);
  if (e.isWorker) trimWorkers(world, owner, e);
  const color = owner.faction === 'blue' ? '#9fd6ff' : '#ffb59f';
  world.fx.burst(e.pos.x, 1, e.pos.z, color, 12, 0.11);
  world.fx.ring(e.pos.x, e.pos.z, color, 2.2, 0.5);
  world.fx.ring(building.pos.x, building.pos.z, color, building.radius + 3.5, 0.6);
  building.spawnTimer = 0.35;
  return e;
}

/** İnşa mümkün mü: hata metni ya da null (istemci anında geri bildirim için aynı denetimi yapar; sunucu yeniden denetler). */
export function buildError(world, kind, owner, x, z, instant = false) {
  const spec = BUILDINGS[kind];
  if (!spec || kind === 'banner') return 'Bilinmeyen yapı';
  const bag = owner.eco;
  if (!owner.banner || !owner.banner.alive) return 'Sancak yıkıldı, inşa edilemez';
  if (bag.gold < spec.cost || bag.wood < spec.wood) return `Yetersiz odun: ${spec.label} ${spec.wood} odun`;
  const isTower = kind === 'tower', cap = isTower ? world.limits.towers : world.limits.buildings;
  if (structureCount(world, owner, isTower) >= cap) return isTower ? `Kule sınırı dolu (en fazla ${cap} kule) · birini yıkabilirsin` : `Bina sınırı dolu (en fazla ${cap} bina) · birini yıkabilirsin`;
  if (!instant) {
    const hero = owner.hero;
    if (!hero || !hero.alive) return 'Kahraman yerde, inşa edilemez';
    if (Math.hypot(hero.pos.x - x, hero.pos.z - z) > BUILD.heroRadius) return `Kahramandan uzak: bina kahramanın ${BUILD.heroRadius} birim yakınına dikilir`;
    const why = placementError(world, kind, x, z, owner);
    if (why) return why;
  }
  return canPlace(world, x, z, spec.radius, owner.faction);
}

/** Bina / kule kurar (odunla, sahibinin kahramanının yakınına); odun yetmezse, kahraman uzaksa ya da yer uygun değilse sebep döner. */
export function buildStructure(world, kind, owner, x, z, { instant = false } = {}) {
  const why = buildError(world, kind, owner, x, z, instant);
  if (why) return why;
  const spec = BUILDINGS[kind], bag = owner.eco;
  bag.gold -= spec.cost; bag.wood -= spec.wood;
  const s = createStructure(world, kind, owner.faction, x, z, { instant, owner });
  statBuilt(owner, s); statSpent(owner, structureValue(s));
  const color = owner.faction === 'blue' ? '#9fd6ff' : '#ffb59f';
  world.fx.burst(x, 1.5, z, color, 16, 0.13);
  world.fx.ring(x, z, color, spec.radius + 4, 0.7);
  if (owner.human) { world.fx.flash(owner, 'gold'); world.fx.ping(owner, 'tower'); }
  return s;
}

/** Sayım: `sel` bir oyuncuysa onun, bir takım adıysa o takımın tümünün işçi türü, asker sayısı ve türleri, bina türleri, kuleleri. */
function census(world, sel) {
  const mine = typeof sel === 'string' ? o => o.faction === sel : o => o.owner === sel;
  const c = { workers: { wood: 0, gold: 0, food: 0 }, army: 0, types: {}, buildings: {}, towers: 0 };
  for (const e of world.entities) {
    if (!e.alive || !mine(e) || e.isPlayer || e.isHero) continue;
    if (e.isWorker) c.workers[e.workerKind] += e.tier || 1; else { c.army++; c.types[e.typeKey] = (c.types[e.typeKey] || 0) + 1; }
  }
  for (const s of world.structures) {
    if (!s.alive || !mine(s)) continue;
    if (s.kind === 'tower') c.towers++; else c.buildings[s.kind] = (c.buildings[s.kind] || 0) + 1;
  }
  return c;
}
/** Takım sayımını oyuncu payına indirir. */
function scaleCensus(c, k) {
  const scale = o => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, Math.ceil(v * k)]));
  return { workers: scale(c.workers), army: Math.ceil(c.army * k), types: scale(c.types), buildings: scale(c.buildings), towers: Math.ceil(c.towers * k) };
}

/**
 * Bot ordusunun toplanma noktası: en yakın rakip sancağa **en yakın** ayakta kendi kulesinin hemen önü; rakip kule
 * menziline düşüyorsa kulenin arkası. Hiç kule yoksa sancaktan merkeze doğru.
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

/** Kule zincirinin bir sonraki yeri: botun en ileri kulesinden en yakın rakip sancağa doğru bir adım. */
export function creepTowerSpot(world, p) {
  const C = ENEMY_AI.creep, foe = nearestEnemyBanner(world, p.faction, p.banner.pos);
  if (!foe) return null;
  const target = foe.pos, own = p.banner.pos;
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

/** Birikme / saldırı: botun ordusu rakip payına denk olunca hepsi saldırır; eriyince ya da kalabalık görünce çekilir. */
function updateBotStance(world, p, me, you) {
  const ai = p.ai, X = ENEMY_AI.extra[world.difficulty];
  const mine = world.entities.filter(e => e.alive && e.owner === p && !e.isHero && !e.isWorker);
  const retreat = () => {
    ai.attacking = false;
    const r = botRally(world, p);
    giveOrder(world, mine, { kind: 'move', x: r.x, z: r.z });
  };
  const foeTowers = world.structures.some(s => s.alive && s.kind === 'tower' && s.faction !== p.faction);
  const siege = world.entities.some(e => e.alive && e.owner === p && e.isSiege);
  ai.needSiege = foeTowers && !siege;
  if (ai.needSiege) { if (ai.attacking) retreat(); return; }
  const threshold = Math.max(ENEMY_AI.minWave, you.army + X.army);
  if (!ai.attacking) {
    if (me.army >= threshold) { ai.attacking = true; ai.launchSize = me.army; }
    return;
  }
  if (me.army < Math.max(2, ai.launchSize * ENEMY_AI.retreatRatio)) { retreat(); return; }
  if (me.army < you.army) { retreat(); return; }
  const c = crowdAround(world, p, mine);
  if (c.foes > c.own * ENEMY_AI.crowdRatio) retreat();
}

/** Bot savunması: kulesi / sancağı vurulan bot askerlerini ve kahramanını oraya çağırır. */
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
  ai.defend = { s: hit, x: hit.pos.x, z: hit.pos.z, at: hit.lastHitAt };
  const nearD = e => Math.hypot(e.pos.x - hit.pos.x, e.pos.z - hit.pos.z);
  const away = world.entities.filter(e => e.alive && e.owner === p && !e.isHero && !e.isWorker && e.brain
    && !(e.brain.order && e.brain.order.defend) && nearD(e) < D.recall && nearD(e) > D.hold);
  if (away.length) giveOrder(world, away, { kind: 'move', x: hit.pos.x, z: hit.pos.z, defend: true });
}

/** Bot ekonomisi: rakip takımı taklit eder (işçi -> bina -> asker); saldırı kararı updateBotStance'ta. */
function updateBotEconomy(world, p, dt) {
  const ai = p.ai, banner = p.banner;
  if (!banner.alive) return;
  ai.spawnTimer -= dt;
  if (ai.spawnTimer > 0) return;
  ai.spawnTimer = ENEMY_HERO.spawnCheck;
  const base = p.base, X = ENEMY_AI.extra[world.difficulty], eco = p.eco;
  const foeTeam = enemyOf(p.faction), mates = teamOf(world, p.faction).length;
  const me = census(world, p), you = scaleCensus(census(world, foeTeam), 1 / mates);

  // 0) Bot kahramanı geride kalırsa tur başına bir seviye alarak en yüksek rakip kahramana yetişir.
  const rh = p.hero;
  let top = 1;
  for (const q of world.players) if (q.faction === foeTeam && q.hero) top = Math.max(top, q.hero.level);
  if (rh && rh.alive && rh.level < top) { applyLevelUp(rh); p.st.level = rh.level; world.fx.ring(rh.pos.x, rh.pos.z, '#ffb59f', 3, 0.6); }

  updateBotStance(world, p, me, you);

  if (!ai.attacking) {
    const r = botRally(world, p);
    const idle = world.entities.filter(e => e.alive && e.owner === p && !e.isHero && !e.isWorker
      && !(e.brain && e.brain.order) && Math.hypot(e.pos.x - r.x, e.pos.z - r.z) > ENEMY_AI.regroupDist);
    if (idle.length) giveOrder(world, idle, { kind: 'move', x: r.x, z: r.z });
  }

  // 1) İşçiler.
  for (const wt of WORKER_TYPES) {
    const target = Math.max(ENEMY_AI.minWorkersPerKind, (you.workers[wt.worker] || 0) + X.workers) + (wt.worker === 'wood' ? ENEMY_AI.creep.extraWoodcutters : 0);
    const n = me.workers[wt.worker] + queuedOf(world, p, wt.key);
    if (workerTotal(world, p) >= world.limits.workers) break;
    if (n < target && banner.queue.length < ENEMY_HERO.queueDepth + 1) { enqueue(world, banner, wt.key, p); break; }
  }

  // 2) Binalar.
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
    if (typeof r !== 'string') return 'built';
    return 'fail';
  };
  const wants = [];
  for (const kind of ['barracks', 'archery', 'stable', 'siege']) {
    const target = kind === 'barracks' ? Math.max(1, you.buildings.barracks || 0) : kind === 'siege' && ai.needSiege ? Math.max(1, you.buildings.siege || 0) : (you.buildings[kind] || 0);
    if (has(kind) < target) wants.push([kind, freeSpot(kind, [base.at(POSITIONS.base[kind]), ...ENEMY_AI.buildSpots.map(o => base.at(o))])]);
  }
  const missingTower = p.towerSpots.find(t => !world.structures.some(s => s.alive && s.kind === 'tower' && Math.hypot(s.pos.x - t.x, s.pos.z - t.z) < 3));
  if (missingTower) wants.push(['tower', missingTower]);
  const hasCatapult = world.entities.some(e => e.alive && e.owner === p && e.isSiege) || queuedOf(world, p, 'catapult') > 0;
  if (me.towers < ENEMY_AI.creep.maxTowers && !(ai.needSiege && !hasCatapult)) { const c = creepTowerSpot(world, p); if (c) wants.push(['tower', c]); }
  for (const [kind, spot] of wants) { const r = tryBuild(kind, spot); if (r === 'built') return; if (r === 'wait') break; }

  // 3) Asker.
  if (ai.needSiege && !hasCatapult) {
    const sw = bestProducer(world, p, 'siege'), ct = SOLDIER_ONLY.find(t => t.key === 'catapult');
    if (sw && eco.gold >= ct.cost && eco.wood >= ct.wood) { enqueue(world, sw, 'catapult', p); return; }
    if (me.army >= you.army) return;
  }
  const youQueued = Math.ceil(teamOf(world, foeTeam).reduce((a, q) => a + queuedSoldiers(world, q), 0) / mates);
  const cap = Math.min(Math.ceil((you.army + youQueued) * ENEMY_AI.armyMult) + X.army, world.limits.army);
  if (me.army + queuedSoldiers(world, p) >= cap || armyCount(world, p) >= world.limits.army) return;
  const options = SOLDIER_ONLY.filter(t => { const b = bestProducer(world, p, t.building); return b && b.ready && b.queue.length < ENEMY_HERO.queueDepth && eco.gold >= t.cost && eco.food >= t.food && eco.wood >= (t.wood || 0); });
  if (!options.length) return;
  let pick = null;
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
  enqueue(world, bestProducer(world, p, pick.building), pick.key, p);
}

/** Bütün botlar (iki takımda da): önce savunma çağrısı, sonra ekonomi / ordu kararı. */
export function updateBots(world, dt) {
  for (const p of world.players) {
    if (p.human) continue;
    updateBotDefense(world, p, dt);
    updateBotEconomy(world, p, dt);
  }
}
