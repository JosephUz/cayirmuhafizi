import * as T from 'three';
import { updateUnit } from './ai.js';
import { addEntity, applyLevelUp, createEntity, makeStats, xpNeeded } from './characters.js';
import { fireArrow, towerTarget, updateArrows, updateCombat, updateSpins, updateTornadoes } from './combat.js';
import { ALERT, BUILD, BUILDINGS, COMBAT, ECONOMY, ENEMY, ENEMY_HERO, HERO_UPGRADE, LEVEL, PHYSICS, POSITIONS, RALLY, SCORE, SOLDIER_TYPES, TEAMS, TOWER, VISION, heroConvertCost, respawnDelay } from './config.js';
import { buildStructure, clearResources, dropLoot, dropXp, hitNode, initBandits, initCamps, initResources, updateBots, updateCamps, updateEconomy } from './economy.js';
import { computeEnvironment, computeLayout } from './environment.js';
import { createFog } from './fog.js';
import { nullFx } from './fx.js';
import { applyHeroInput, createHeroInput } from './hero.js';
import { updateZones } from './abilities.js';
import { clampBounds, integrate, resolveEntityCollisions, resolveObstacleCollisions } from './physics.js';
import { cancelQueued, enqueue, updateProduction } from './production.js';
import { collapseStructure, createStructure, removeStructure, updateStructures } from './structures.js';
import { createPlayers, enemyBanners, limitsFor } from './players.js';
import { buildReport, createStats, sampleTimeline, statStructureDestroyed, statUnitDied } from './stats.js';

/**
 * Dünya: simülasyonun tamamı, render'dan bağımsız. Aynı kod üç yerde çalışır:
 *  - tek başına oyunda tarayıcıda (istemci hem simülasyonu hem görüntüyü koşturur),
 *  - çevrim içi oyunda sunucuda (Node, başsız; görseller fx kancalarıyla olaya dönüşür, bkz. net/netfx.js),
 *  - testlerde başsız (nullFx).
 * Görsel her şey `world.fx` kancalarından geçer (bkz. fx.js); oyuncuya özel geri bildirim (ses, HUD parıltısı, uçan yazı)
 * da fx.ping / flash / float ile **oyuncu** verilerek çağrılır: sunucu yalnızca o oyuncuya yollar.
 * Birden çok insan: mavi takımın ilk yuvaları insanlardır (humans); her insanın kendi girdisi (p.input), kahramanı (p.hero),
 * toplanma bayrağı (p.rally) ve karnesi (p.st) vardır. world.me / world.player yalnızca istemcide anlamlıdır.
 */
export function createWorld({ fx = nullFx(), scene = null } = {}) {
  const world = {
    fx, scene, time: 0, running: false, paused: false, ended: false,
    env: null, layout: null, half: TEAMS.half(TEAMS.default), teamSize: TEAMS.default, seed: 814,
    entities: [], structures: [], towerSpots: [], nodes: [], lanePoints: [], obstacles: [], bases: {}, spots: [], items: [],
    arrows: [], tornadoes: [], spins: [], zones: [],
    players: [], humans: [], me: null, player: null, limits: limitsFor(2),
    difficulty: 'normal', tmpVec: new T.Vector3(), mode: 'moba',
    fog: null, camps: [], obstacleVersion: 0, ids: { entity: 1, structure: 1, item: 1, arrow: 1, zone: 1 },
    timeline: [], sampleTimer: 0, outcome: null,
    /** (x, z) görüş alanında mı: yalnızca istemci daraltır (efekt ve eşya elemesi); sunucuda her şey "görünür". */
    inView: () => true,
    /** Oyun bitince çağrılır (sunucu karneyi yayar, istemci bitiş ekranını açar). */
    onEnd: null,
  };
  world.fog = createFog(world);
  installHooks(world);
  world.simulate = seconds => { const n = Math.ceil(seconds / 0.05); for (let i = 0; i < n; i++) step(world, 0.05); };
  return world;
}

/** Oyun kuralları: ölüm, yapı yıkımı, işçi birleşmesi, kaynak vuruşu, saldırı uyarısı, exp. */
function installHooks(world) {
  world.onDeath = (target, source) => {
    statUnitDied(target, source);
    if (target.isPlayer) {
      // İnsan kahramanı: altının bir kısmı gider, bekleme her ölümde uzar (RESPAWN).
      const owner = target.owner;
      const loss = Math.floor(owner.eco.gold * ECONOMY.deathGoldLoss);
      owner.eco.gold -= loss;
      target.deaths = (target.deaths || 0) + 1;
      return;
    }
    // Ölen asker çevreye yiyecek bırakır (her iki taraf); yalnızca kahramanlar toplar.
    if (!target.isHero && !target.isWorker) dropLoot(world, 'food', target.pos.x, target.pos.z, ECONOMY.loot.soldierFood);
    if (source && source.isPlayer && source.owner && target.faction !== source.faction) { source.owner.eco.gold += ENEMY.bounty; world.fx.flash(source.owner, 'gold'); }
    if (target.isHero && target.owner) target.deaths = (target.deaths || 0) + 1;
    // Ölen her birim yere bir exp küresi bırakır: kim toplarsa tecrübeyi o kahraman kazanır.
    dropXp(world, target.pos.x, target.pos.z, xpFor(target));
    if (source && (source.isPlayer || source.isHero) && target.faction !== source.faction) source.heroKills++;
  };
  /** Kendi sancağın ya da kulen saldırı aldı: sahibine uyarı (ekran kenarı, dünya halkası, minimap). */
  world.onOwnStructureHit = (s, source) => {
    if (world.time - (s.alertAt ?? -99) < ALERT.cooldown) return;
    s.alertAt = world.time;
    world.fx.ring(s.pos.x, s.pos.z, '#ff4438', ALERT.worldRing, 0.7);
    world.fx.alert(s.owner, s);
    void source;
  };
  world.onXpCollected = (hero, amount) => gainXp(world, hero, amount);
  world.onStructureDestroyed = (s, source) => {
    statStructureDestroyed(s, source);
    collapseStructure(world, s);
    dropLoot(world, 'wood', s.pos.x, s.pos.z, BUILDINGS[s.kind].loot);
    // Yıkılan kule / bina da exp bırakır (kule en değerlisi); kendi yıktığın yapı vermez, yoksa bedava exp olurdu.
    if (!s.demolished && s.kind !== 'banner') dropXp(world, s.pos.x, s.pos.z, s.kind === 'tower' ? LEVEL.xp.tower : s.kind === 'camp' ? LEVEL.xp.camp : LEVEL.xp.building);
    if (s.kind !== 'banner') return;
    if (s.faction === 'red') {
      // Zafer: rakip takımın **bütün** sancakları yıkılınca. Aradaki her sancak yalnızca ses verir.
      if (enemyBanners(world, 'blue').length) { for (const h of world.humans) world.fx.ping(h, 'tower'); }
      else endGame(world, 'victory', 'banners');
    } else {
      // Sancağı düşen insan **elenir**: kahramanı bir daha doğmaz. Mavi takımın insan sancakları hep düşünce yenilgi.
      if (s.owner && s.owner.human) s.owner.eliminated = true;
      if (!world.humans.some(h => h.banner && h.banner.alive)) endGame(world, 'defeat', 'banner');
    }
  };
  /** İşçi birleşti: hedefin kademesi arttı, gelen işçi sahneden kalkar. */
  world.onWorkerMerged = (target, source) => {
    const color = target.faction === 'blue' ? '#9fd6ff' : '#ffb59f';
    world.fx.burst(target.pos.x, 1.2, target.pos.z, color, 10, 0.1);
    world.fx.ring(target.pos.x, target.pos.z, color, 1.8, 0.45);
    if (target.owner && target.owner.human) world.fx.ping(target.owner, 'worker');
    void source;
  };
  world.onNodeHit = (node, attacker) => {
    if (!hitNode(world, node, attacker)) return;
    if (attacker.owner && attacker.owner.human) world.fx.ping(attacker.owner, 'worker');
  };
}

function endGame(world, result, reason) {
  if (world.ended) return;
  world.ended = true;
  world.outcome = { result, reason };
  sampleTimeline(world);
  const report = buildReport(world, world.outcome);
  world.report = report;
  if (world.onEnd) world.onEnd(report);
}

/**
 * Oyunu kurar: arena takım büyüklüğüne göre, oyuncular (insanlar mavi takımın ilk yuvalarında), her oyuncuya sancak +
 * başlangıç kulesi + kışla, kahramanlar, kamplar ve haydutlar; sis temizlenir.
 * humans: [{ name, color? }] — en az bir insan (tek başına oyunda 'Sen').
 */
export function setupGame(world, { teamSize = TEAMS.default, difficulty = 'normal', humans = [{ name: 'Sen' }], loadout = { ...HERO_UPGRADE.startLoadout }, seed = 814, run = true } = {}) {
  for (const e of world.entities) world.fx.removeEntity(e);
  world.entities.length = 0;
  for (const a of world.arrows) world.fx.removeArrow(a); world.arrows.length = 0;
  for (const list of [world.spins, world.tornadoes, world.zones]) { for (const z of list) world.fx.removeZone(z); list.length = 0; }
  clearResources(world);
  for (let i = world.structures.length - 1; i >= 0; i--) removeStructure(world, world.structures[i]);

  const layout = computeLayout(teamSize);
  const env = computeEnvironment(layout, seed);
  const players = createPlayers(teamSize, humans);
  Object.assign(world, {
    env, layout, seed, half: layout.half, teamSize, towerSpots: env.towerSpots, nodes: env.nodes, lanePoints: env.lanePoints, obstacles: env.obstacles, bases: env.bases,
    players, humans: players.filter(p => p.human), limits: limitsFor(players.length), camps: [],
    time: 0, paused: false, ended: false, running: run, difficulty, outcome: null, report: null, timeline: [], sampleTimer: 0,
    ids: { entity: 1, structure: 1, item: 1, arrow: 1, zone: 1 },
  });
  world.obstacleVersion++;
  for (const p of players) { p.st = createStats(); p.rally = null; p.eliminated = false; if (p.human) p.input = createHeroInput(); }

  // Her oyuncuya üs: sancak, başlangıç kuleleri ve bir kışla.
  for (const p of players) {
    p.base = env.bases[`${p.faction}:${p.slot}`];
    p.towerSpots = env.towerSpots.filter(t => t.faction === p.faction && t.slot === p.slot);
    p.banner = createStructure(world, 'banner', p.faction, p.base.pos.x, p.base.pos.z, { instant: true, owner: p });
    for (const t of p.towerSpots) createStructure(world, 'tower', p.faction, t.x, t.z, { instant: true, owner: p });
    const bk = p.base.at(POSITIONS.base.barracks);
    createStructure(world, 'barracks', p.faction, bk.x, bk.z, { instant: true, owner: p });
  }
  initResources(world);

  for (const p of players) {
    if (p.human) spawnHumanHero(world, p, loadout);
    else spawnBotHero(world, p);
  }
  // Tarafsız kamplar boş köşelere, haydutlar araziye serpiştirilir.
  initCamps(world);
  initBandits(world);
  world.fog.reset();
  sampleTimeline(world);
  return world;
}

/** İnsan kahramanı: sancağının yanında doğar; girdiyle sürülür (beyni yok). */
function spawnHumanHero(world, p, loadout) {
  const b = p.banner;
  const e = createEntity({ faction: p.faction, owner: p, loadout: { ...loadout }, isPlayer: true, x: b.pos.x + 2.2, z: b.pos.z + 1.5 });
  e.facing = Math.PI * 0.75; e.vision = VISION.hero;
  e.brain = { mode: 'hold', timer: 0, target: null, retarget: 0, home: { x: e.pos.x, z: e.pos.z }, order: null };
  addEntity(world, e);
  p.hero = e;
  return e;
}

/** Bot kahramanı: sahibinin sancağında doğar; kaynak toplar, keşfe çıkar, bina yerine gider, haydut avlar, gördüğü düşmana saldırır. */
function spawnBotHero(world, p) {
  const b = p.banner;
  const e = createEntity({ faction: p.faction, owner: p, loadout: { weapon: 'spear', shield: true, horse: true }, x: b.pos.x - 2.2, z: b.pos.z + 1.5 });
  e.isHero = true; e.work = { spot: null, item: null }; e.vision = VISION.hero;
  e.stats.maxHp = ENEMY_HERO.hp; e.hp = e.stats.maxHp;
  e.stats.speed *= ENEMY_HERO.speedMult;
  e.facing = Math.atan2(-b.pos.x, -b.pos.z);
  addEntity(world, e);
  p.hero = e;
  return e;
}

/** Sabit adımlı simülasyon: kontrol -> yapay zekâ -> fizik -> savaş -> yaşam döngüsü. */
const aliveList = [];
export function step(world, dt) {
  const steps = Math.min(Math.ceil(dt / PHYSICS.fixedStep), PHYSICS.maxSteps);
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    world.time += h;
    for (const p of world.humans) applyHeroInput(world, p, h);
    for (const e of world.entities) if (e.brain) updateUnit(world, e, h);
    integrate(world.entities, h);
    aliveList.length = 0;
    for (const e of world.entities) if (e.alive) aliveList.push(e);
    resolveEntityCollisions(aliveList);
    resolveObstacleCollisions(aliveList, world.obstacles, world.obstacleVersion);
    clampBounds(world.entities, world.half);
    updateCombat(world, h);
    updateTowers(world, h);
    updateArrows(world, h);
    updateTornadoes(world, h);
    updateSpins(world, h);
    updateZones(world, h);
    updateLifecycle(world, h);
  }
  updateStructures(world, dt);
  updateProduction(world, dt);
  world.fog.update(dt);
  checkVictory(world);
  updateCamps(world, dt);
  updateHeroRegen(world, dt);
  updateEconomy(world, dt);
  updateBots(world, dt);
  // Karne zaman çizelgesi ve sınır dolu süresi.
  world.sampleTimer -= dt;
  if (world.sampleTimer <= 0) { world.sampleTimer = SCORE.sampleEvery; if (!world.ended) sampleTimeline(world); }
}

// ---------- Komutlar (istemciden ya da yerel arayüzden; hepsi oyuncu adına) ----------

/** Üretim emri: bina oyuncunun olmalı. Hata metni ya da null. */
export function cmdEnqueue(world, player, building, typeKey) {
  return enqueue(world, building, typeKey, player);
}
export function cmdCancel(world, player, building, index) {
  if (!building || building.owner !== player) return 'Bu bina senin değil';
  cancelQueued(world, building, index);
  return null;
}
export function cmdBuild(world, player, kind, x, z) {
  const r = buildStructure(world, kind, player, x, z);
  return typeof r === 'string' ? r : null;
}
/** Seçili kendi yapını yıkma (sancak hariç): enkazdan odun düşer; sınır dolduğunda yer açmanın yolu budur. */
export function cmdDemolish(world, player, s) {
  if (!s || !s.alive) return 'Yapı yok';
  if (s.owner !== player) return 'Yalnızca kendi yapını yıkabilirsin';
  if (s.kind === 'banner') return 'Sancak yıkılamaz';
  s.demolished = true;
  world.onStructureDestroyed(s, null);
  return null;
}
/**
 * Orta tık: toplanma alanı ya da **saldırı hedefi** (target: düşman birim / yapı ya da null). Bütün **kendi** askerleri
 * hedefe kilitlenir ya da bayrağa yürür (bkz. ai.js updateAggressive). { n, target } döner.
 */
export function cmdRally(world, player, x, z, target = null) {
  if (target && (!target.alive || target.faction === player.faction)) target = null;
  const at = target ? target.pos : { x, z };
  const color = target ? RALLY.attackColor : RALLY.color;
  player.rally = { x: at.x, z: at.z, color, target };
  const units = world.entities.filter(e => e.alive && e.owner === player && !e.isWorker && !e.isHero && !e.isPlayer && e.brain);
  for (const u of units) { u.brain.order = null; u.brain.focus = target || null; u.brain.retarget = 0; }
  world.fx.ring(at.x, at.z, color, target ? (target.radius || 1) + 3 : 3, 0.7);
  world.fx.rally(player);
  return { n: units.length, target };
}
/** Tür değişimi mümkün mü: hata metni ya da null (istemci de anında geri bildirim için aynı denetimi yapar). */
export function convertError(world, player, key) {
  const p = player.hero, b = player.banner, t = SOLDIER_TYPES.find(x => x.key === key && !x.worker && !x.siege);
  if (!t) return 'Bilinmeyen tür';
  if (!p || !p.alive) return 'Kahraman yerde';
  if (!b || !b.alive) return 'Sancak yıkık';
  if (Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) > HERO_UPGRADE.range) return 'Kahraman sancağa yaklaşmalı';
  if (p.loadout.weapon === t.weapon && p.loadout.shield === t.shield && p.loadout.horse === t.horse) return `Zaten ${t.label}sın`;
  if (player.eco.gold < heroConvertCost(t)) return `Yetersiz altın: ${t.label} ${heroConvertCost(t)} altın`;
  return null;
}
/** Sancakta altınla başka bir asker türüne dönüşme: donanım ve görünüm değişir, seviye korunur. */
export function cmdConvert(world, player, key) {
  const err = convertError(world, player, key);
  if (err) return err;
  const p = player.hero, t = SOLDIER_TYPES.find(x => x.key === key);
  const cost = heroConvertCost(t);
  player.eco.gold -= cost; if (player.st) player.st.spent += cost; world.fx.flash(player, 'gold');
  const ratio = p.hp / p.stats.maxHp;
  p.loadout = { weapon: t.weapon, shield: t.shield, horse: t.horse };
  p.stats = makeStats(p.loadout, true);
  p.radius = p.stats.radius; p.invMass = p.stats.invMass;
  // Seviye ve exp korunur: yeni türün taban canına seviyelerin can artışı yeniden eklenir.
  p.stats.maxHp += LEVEL.hpPerLevel * (p.level - 1);
  p.hp = Math.max(1, Math.round(p.stats.maxHp * ratio));
  p.attackTimer = 0; p.cooldown = 0; p.blocking = false; p.aimLocked = false;
  world.fx.refreshEntity(p);
  world.fx.ring(p.pos.x, p.pos.z, '#ffd12e', 3.5, 0.8); world.fx.burst(p.pos.x, 1.6, p.pos.z, '#ffd12e', 16, 0.13);
  world.fx.flash(player, 'level');
  return null;
}

// ---------- Kurallar ----------

/**
 * Can yenilenmesi: kahraman **kendi sancağının alanında** durdukça saniyede HERO_UPGRADE.regenPerSecond can kazanır.
 * Başka hiçbir yol iyileştirmez. Aynı kural bütün bot kahramanları için kendi sancaklarında geçerlidir.
 */
function updateHeroRegen(world, dt) {
  for (const p of world.players) {
    const hero = p.hero, banner = p.banner;
    if (!hero || !hero.alive || !banner || !banner.alive) continue;
    if (hero.hp >= hero.stats.maxHp) continue;
    if (Math.hypot(hero.pos.x - banner.pos.x, hero.pos.z - banner.pos.z) > BUILD.bannerRadius) continue;
    hero.hp = Math.min(hero.stats.maxHp, hero.hp + HERO_UPGRADE.regenPerSecond * dt);
    hero.healFx = (hero.healFx || 0) - dt;
    if (hero.healFx <= 0) {
      hero.healFx = HERO_UPGRADE.bubbleEvery;
      world.fx.heal(hero.pos.x, 2.1 + hero.jumpY + (hero.loadout.horse ? 0.9 : 0), hero.pos.z);
    }
    if (hero.isPlayer && hero.hp >= hero.stats.maxHp) { world.fx.ring(hero.pos.x, hero.pos.z, '#8fe08f', 3, 0.6); world.fx.flash(p, 'health'); }
  }
}

/** Öldürülen birimin verdiği exp: kahraman > mancınık > asker > işçi. */
function xpFor(target) {
  if (target.isBeast) return LEVEL.xp.beast;
  if (target.isPlayer || target.isHero) return LEVEL.xp.hero + LEVEL.xpHeroPerLevel * ((target.level || 1) - 1);
  if (target.isWorker) return LEVEL.xp.worker;
  if (target.isSiege) return LEVEL.xp.siege;
  if (target.loadout && target.loadout.horse) return LEVEL.xp.cavalry;
  return LEVEL.xp.soldier;
}
/** Toplanan exp: yeter sayıya ulaştıkça seviye atlatır; artan exp sonrakine kalır. */
export function gainXp(world, e, amount) {
  if (!(amount > 0)) return;
  e.xp = (e.xp || 0) + amount;
  if (e.owner) e.owner.st.xp += amount;
  while (e.xp >= xpNeeded(e.level)) {
    e.xp -= xpNeeded(e.level);
    applyLevelUp(e);
    if (e.owner) e.owner.st.level = e.level;
    if (e.isPlayer) {
      world.fx.ring(e.pos.x, e.pos.z, '#ffd12e', 3, 0.7);
      world.fx.burst(e.pos.x, 1.6, e.pos.z, '#ffd12e', 12, 0.12);
      world.fx.flash(e.owner, 'level');
    } else world.fx.ring(e.pos.x, e.pos.z, '#ffb59f', 3, 0.6);
  }
}

/** Kuleler: menzildeki en yakın düşmana takipli ok atar. */
function updateTowers(world, dt) {
  for (const t of world.structures) {
    if (t.kind !== 'tower' || !t.alive || !t.ready) continue;
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const sh = t.shooter; sh.facing = 0;
    const target = towerTarget(world, sh, TOWER.range);
    if (!target) continue;
    t.cooldown = TOWER.cooldown;
    const dir = world.tmpVec.set(target.pos.x - t.pos.x, 0, target.pos.z - t.pos.z).normalize();
    fireArrow(world, sh, dir, target);
    t.shots = (t.shots || 0) + 1;
  }
}

/** Zafer: rakip takımın bütün sancakları yıkık **ve** sahada rakip birim kalmadı. */
function checkVictory(world) {
  if (world.ended || enemyBanners(world, 'blue').length) return;
  if (world.entities.some(e => e.faction === 'red' && e.alive)) return;
  endGame(world, 'victory', 'annihilation');
}

function updateLifecycle(world, dt) {
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i];
    // Birleşen işçi: ölmez, sessizce sahneden kalkar.
    if (e.merged) { world.fx.removeEntity(e); world.entities.splice(i, 1); continue; }
    if (e.alive) continue;
    e.deathTimer += dt;
    if (e.isPlayer) {
      const b = e.owner.banner;
      if (e.deathTimer >= respawnDelay(e.deaths) && b && b.alive && !world.ended) respawnHero(world, e, true);
      continue;
    }
    if (e.isHero) {
      // Bot kahramanı: sahibinin sancağı ayaktaysa orada yeniden doğar; sancak yıkıksa cesedi sahneden kalkar.
      const b = e.owner.banner;
      if (e.deathTimer >= respawnDelay(e.deaths, ENEMY_HERO.respawn) && b.alive && !world.ended) respawnHero(world, e, false);
      else if (!b.alive && e.deathTimer > COMBAT.deathDuration + COMBAT.sinkDuration + 0.1) { world.fx.removeEntity(e); world.entities.splice(i, 1); }
      continue;
    }
    if (e.deathTimer > COMBAT.deathDuration + COMBAT.sinkDuration + 0.1) { world.fx.removeEntity(e); world.entities.splice(i, 1); }
  }
}

function respawnHero(world, e, human) {
  const b = e.owner.banner;
  e.hp = e.stats.maxHp; e.alive = true; e.deathTimer = 0; e.stun = 0; e.hitFlash = 0; e.cooldown = 0; e.attackTimer = 0;
  e.vel.set(0, 0, 0); e.push.set(0, 0, 0); e.moveDir.set(0, 0, 0); e.jumpY = 0; e.vy = 0; e.dodgeTimer = 0; e.invuln = 0; e.charging = false;
  if (human) { e.pos.set(b.pos.x + 2.2, 0, b.pos.z + 1.5); e.facing = Math.PI * 0.75; e.brain.order = null; e.brain.home = { x: e.pos.x, z: e.pos.z }; }
  else { e.brain.target = null; e.brain.retarget = 0; e.work = { spot: null, item: null }; e.working = false; e.workTimer = 0; e.pos.set(b.pos.x - 2.2, 0, b.pos.z + 1.5); }
  world.fx.burst(e.pos.x, 1, e.pos.z, e.faction === 'blue' ? '#9fd6ff' : '#ffb59f', 8, 0.1);
}
