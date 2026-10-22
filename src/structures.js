import * as T from 'three';
import { BUILD, BUILDINGS, CAMPS, TOWER } from './config.js';
import { t } from './dil.js';

/**
 * Yapılar: sancak, kışla, okçuluk, ahır, kuşatma, kule, tarafsız kamp. Hepsi aynı kayıt biçimini kullanır:
 * { id, kind, faction, owner, pos, radius, hp, maxHp, alive, hitFlash, buildTimer, ready, obstacle, shooter?, queue, progress,
 *   seen, seenByRed, respawnTimer, waveTimer, raidSide, deadTimer, spawnTimer, shots, demolished, view }.
 * faction takımdır ('blue' / 'red' / tarafsız 'beast'), owner sahibi olan oyuncu (players.js; kamplarda null).
 * Yalnızca veri: görünüm view/structview.js'te durumdan çizilir (inşa yükselmesi, çökme, yıkıntı, sis gizliliği).
 */
export const bannerOf = (world, owner) => (owner ? owner.banner : null);

/** Yapı kurar; instant değilse inşa süresi boyunca yerden büyür ve üretim yapamaz. */
export function createStructure(world, kind, faction, x, z, { instant = false, owner = null } = {}) {
  const spec = BUILDINGS[kind];
  const pos = new T.Vector3(x, 0, z);
  const obstacle = { pos, vel: new T.Vector3(), push: new T.Vector3(), radius: spec.radius, invMass: 0 };
  const s = {
    id: world.ids.structure++, kind, faction, owner, pos, radius: spec.radius, hp: spec.hp, maxHp: spec.hp, alive: true, hitFlash: 0, cooldown: 1,
    spawnTimer: 0, buildTime: spec.buildTime || 0, buildTimer: instant ? 0 : (spec.buildTime || 0), ready: instant || !spec.buildTime, obstacle, deadTimer: 0,
    // Üretim kuyruğu ve sisten görülmüşlük (mavi kendi yapısını hep görür).
    queue: [], progress: 0, seen: faction !== 'red', seenByRed: faction !== 'blue', respawnTimer: 0, waveTimer: 0, raidSide: null, shots: 0, demolished: false, view: null,
  };
  if (kind === 'tower') {
    // tower: atıcı kendi yapısını bilir (ölüm kamerası "seni hangi kule vurdu" diye gösterebilsin).
    s.shooter = { tower: s, pos, aim: new T.Vector3(), faction, owner, isPlayer: false, isHero: false, isTower: true, level: 1, buff: 0, jumpY: 3.2, view: null, facing: 0, stats: { weapon: { range: TOWER.range, damage: TOWER.damage, knockback: 0, arrowSpeed: TOWER.arrowSpeed, ranged: true } } };
  }
  world.obstacles.push(obstacle); bumpObstacles(world);
  world.structures.push(s);
  world.fx.addStructure(s);
  return s;
}

/** Engel listesi değişti: fizik engel ızgarasını yeniden kurar (bkz. physics.js resolveObstacleCollisions). */
const bumpObstacles = world => { world.obstacleVersion = (world.obstacleVersion || 0) + 1; };

/** O oyuncunun ayakta duran kule sayısı (towers=true) ya da kule dışındaki bina sayısı (sancak hariç). */
export function structureCount(world, owner, towers) {
  let n = 0;
  for (const s of world.structures) {
    if (!s.alive || s.owner !== owner || s.kind === 'banner') continue;
    if (towers ? s.kind === 'tower' : s.kind !== 'tower') n++;
  }
  return n;
}

/**
 * Kalkanlı sancak: **sahibinin** ayakta (inşası sürse bile) en az bir kulesi varken sancak **can kaybetmez**.
 * Takım arkadaşının kuleleri kalkan sayılmaz: her üs kendi kuleleriyle korunur.
 */
export function bannerShielded(world, s) {
  return s.kind === 'banner' && world.structures.some(t => t.alive && t.kind === 'tower' && t.owner === s.owner);
}

/**
 * Kahraman kendi sancağının çemberinde mi (BUILD.bannerRadius). İnsan oyuncu bina dikmek ve asker basmak için
 * çemberin içinde olmalıdır (bkz. production.js enqueueError, economy.js buildError); kule çember dışına da dikilir.
 * Botlar ve otopilot koltuğu bu kurala bağlı değildir (rakip bot komutanı ordusunu her yerden yönetir).
 */
export function heroInBase(owner) {
  const h = owner && owner.hero, b = owner && owner.banner;
  return Boolean(h && b && h.alive && b.alive && Math.hypot(h.pos.x - b.pos.x, h.pos.z - b.pos.z) <= BUILD.bannerRadius);
}
/** Kural insan oyuncuya mı işler (bot ve otopilot koltuğu hariç). */
export const baseRuleFor = owner => Boolean(owner && owner.human && !owner.otopilot);

/**
 * Yapı kuralı: kule dışındaki binalar kendi sancağının çemberi içine; kuleler yalnızca yollara, başka kulelere
 * en az TOWER.minGap = **menzilin iki katı** uzağa (kendi ve rakip kuleleri dahil; böylece atış alanları çakışmaz)
 * ve **rakibin sancak çemberinin dışına** dikilir. Uygunsa null, değilse sebep döner.
 */
export function placementError(world, kind, x, z, owner) {
  if (kind === 'tower') {
    const onLane = (world.lanePoints || []).some(p => Math.hypot(p.x - x, p.z - z) <= TOWER.laneDist)
      || (world.towerSpots || []).some(t => Math.hypot(t.x - x, t.z - z) <= 3);
    if (!onLane) return t('insa.yolda');
    for (const foe of world.structures) {
      if (foe.kind !== 'banner' || !foe.alive || foe.faction === owner.faction) continue;
      if (Math.hypot(foe.pos.x - x, foe.pos.z - z) <= BUILD.bannerRadius) return t('insa.rakipCember');
    }
    for (const s of world.structures) {
      if (!s.alive || s.kind !== 'tower') continue;
      if (Math.hypot(s.pos.x - x, s.pos.z - z) < TOWER.minGap) return t('insa.kuleAraligi', { n: TOWER.minGap });
    }
    return null;
  }
  const b = owner.banner;
  if (!b || !b.alive) return t('insa.sancakYikildi');
  if (Math.hypot(b.pos.x - x, b.pos.z - z) > BUILD.bannerRadius) return t('insa.cemberDisi');
  return null;
}

/**
 * Yapı kurulabilir mi: harita sınırı, engeller, başka yapı, çalışma yeri ve **düşman** birimleri.
 * `faction` verilirse o takımın birimleri engel sayılmaz. Uygunsa null, değilse sebep döner.
 */
export function canPlace(world, x, z, radius, faction = null) {
  if (Math.abs(x) > world.half - radius - 1 || Math.abs(z) > world.half - radius - 1) return t('insa.haritaDisi');
  for (const o of world.obstacles) if (Math.hypot(o.pos.x - x, o.pos.z - z) < o.radius + radius + 0.5) return t('insa.dolu');
  for (const s of world.structures) if (s.alive && Math.hypot(s.pos.x - x, s.pos.z - z) < s.radius + radius + 1) return t('insa.yakin');
  for (const sp of world.spots) if (Math.hypot(sp.x - x, sp.z - z) < radius + 1.2) return t('insa.calismaYeri');
  for (const e of world.entities) {
    if (!e.alive || (faction && e.faction === faction)) continue;
    if (Math.hypot(e.pos.x - x, e.pos.z - z) < e.radius + radius) return t('insa.dusman');
  }
  return null;
}

/** Yıkım: engeli kalkar, kısa süre sonra listeden silinir. Sancaklar ve kamp yıkıntısı kalır (görünüm durumdan çizer). */
export function collapseStructure(world, s) {
  s.alive = false; s.hp = 0; s.queue.length = 0; s.progress = 0;
  if (s.kind === 'camp') s.respawnTimer = CAMPS.respawn;
  else if (s.kind !== 'banner') s.deadTimer = 2.5;
  world.fx.burst(s.pos.x, 2, s.pos.z, '#d9c4a0', 14, 0.14);
  const i = world.obstacles.indexOf(s.obstacle); if (i >= 0) { world.obstacles.splice(i, 1); bumpObstacles(world); }
  if (world.sel && world.sel.structure === s) world.sel.structure = null;
}

/** Yıkılan kamp geri sayımı dolunca aynı yerde yeniden kurulur: canı dolar, geri sayımı sıfırlanır. */
export function reviveCamp(world, s) {
  s.alive = true; s.hp = s.maxHp; s.respawnTimer = 0; s.deadTimer = 0;
  if (!world.obstacles.includes(s.obstacle)) { world.obstacles.push(s.obstacle); bumpObstacles(world); }
  world.fx.ring(s.pos.x, s.pos.z, '#8fd15a', 4, 0.8);
  world.fx.burst(s.pos.x, 2, s.pos.z, '#8fd15a', 16, 0.13);
}

export function removeStructure(world, s) {
  world.fx.removeStructure(s);
  const i = world.structures.indexOf(s); if (i >= 0) world.structures.splice(i, 1);
  const j = world.obstacles.indexOf(s.obstacle); if (j >= 0) { world.obstacles.splice(j, 1); bumpObstacles(world); }
  if (world.sel && world.sel.structure === s) world.sel.structure = null;
}

/** İnşa ilerlemesi, yıkıntı temizliği. */
export function updateStructures(world, dt) {
  for (let i = world.structures.length - 1; i >= 0; i--) {
    const s = world.structures[i];
    if (!s.alive) {
      if (s.deadTimer > 0) { s.deadTimer -= dt; if (s.deadTimer <= 0) removeStructure(world, s); }
      continue;
    }
    if (!s.ready) {
      s.buildTimer -= dt;
      if (s.buildTimer <= 0) {
        s.buildTimer = 0; s.ready = true; s.spawnTimer = 0.5;
        const color = s.faction === 'blue' ? '#9fd6ff' : '#ffb59f';
        world.fx.burst(s.pos.x, 2.5, s.pos.z, color, 16, 0.13); world.fx.ring(s.pos.x, s.pos.z, color, s.radius + 4, 0.7);
        if (s.owner && s.owner.human) world.fx.ping(s.owner, 'tower');
      }
    }
  }
}

/** O oyuncunun ilk hazır (ayakta) yapısı; `near` verilirse en yakını. */
export function findBuilding(world, owner, kind, near = null) {
  let best = null, bd = Infinity;
  for (const s of world.structures) {
    if (!s.alive || !s.ready || s.owner !== owner || s.kind !== kind) continue;
    const d = near ? Math.hypot(s.pos.x - near.x, s.pos.z - near.z) : 0;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** Oyuncunun sol tıkla seçebileceği kendi yapısı: imlece en yakın olan (müttefikin yapısı seçilmez). */
/** Yapı bu takıma bilinir mi (mavi: seen, kırmızı: seenByRed). Kendi ve tarafsız yapılar baştan bilinir. */
export const knownBy = (s, faction) => (faction === 'red' ? s.seenByRed : s.seen);
/** Bu takımın bilgisini işaretle. */
export function markKnown(s, faction) { if (faction === 'red') s.seenByRed = true; else s.seen = true; }

export function pickOwnStructure(world, x, z, owner = world.me) {
  let best = null, bd = Infinity;
  for (const s of world.structures) {
    if (!s.alive || s.owner !== owner) continue;
    const d = Math.hypot(s.pos.x - x, s.pos.z - z) - s.radius;
    if (d < 1.4 && d < bd) { bd = d; best = s; }
  }
  return best;
}
