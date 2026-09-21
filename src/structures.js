import * as T from '/vendor/three.module.js';
import { ball, box, makeHpBar, mesh, removeGroup, setHpBar } from './builders.js';
import { burst, ring } from './combat.js';
import { BUILD, BUILDINGS, CAMPS, COLORS, HALF, TOWER } from './config.js';

/**
 * Yapılar: sancak, kışla, okçuluk, ahır, kule. Hepsi aynı kayıt biçimini kullanır:
 * { kind, faction, pos, radius, hp, maxHp, alive, g, flag, ring?, hitFlash, buildTimer, ready, obstacle, shooter? }.
 * Sancaklar world.structures[0] (mavi) ve [1] (kırmızı) olarak hep başta durur.
 */
let nextId = 1;

export const bannerOf = (world, faction) => world.structures[faction === 'blue' ? 0 : 1];

/** Yapı görünümü: grup, bayrak ve (kulede) menzil halkası. */
export function structureMesh(kind, faction) {
  const color = faction === 'blue' ? COLORS.blueBanner : COLORS.redBanner;
  const g = new T.Group();
  let flag = null, rng = null;
  if (kind === 'banner') {
    mesh(g, new T.CylinderGeometry(1.1, 1.3, 0.5, 8), '#8d8f9a', 0, 0.25, 0);
    box(g, '#5a4632', 0, 3, 0, 0.18, 5.4, 0.18);
    ball(g, '#cbb977', 0, 5.8, 0, 0.18);
    flag = box(g, color, 0.75, 5, 0, 1.5, 1, 0.06);
    // Sancak çemberi: kule dışındaki binalar yalnızca bu dairenin içine dikilebilir.
    rng = groundRing(g, color, BUILD.bannerRadius - 0.45, BUILD.bannerRadius, 0.3);
  } else if (kind === 'tower') {
    mesh(g, new T.CylinderGeometry(1.0, 1.25, 3.4, 8), '#8d8f9a', 0, 1.7, 0);
    mesh(g, new T.CylinderGeometry(1.25, 1.1, 0.9, 8), '#6b4e33', 0, 3.85, 0);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(g, '#7c7e88', Math.cos(a) * 1.15, 4.5, Math.sin(a) * 1.15, 0.3, 0.4, 0.3); }
    box(g, '#5a4632', 0, 5.2, 0, 0.12, 1.8, 0.12);
    flag = box(g, color, 0.45, 5.7, 0, 0.9, 0.55, 0.05);
    rng = groundRing(g, color, TOWER.range - 0.15, TOWER.range, 0.18);
  } else if (kind === 'barracks') {
    box(g, '#8d8f9a', 0, 0.3, 0, 3.6, 0.6, 3.0);
    box(g, '#c9b28a', 0, 1.5, 0, 3.2, 1.9, 2.6);
    const roof = mesh(g, new T.ConeGeometry(2.6, 1.3, 4), '#6b4e33', 0, 3.1, 0, 1, 1, 0.9); roof.rotation.y = Math.PI / 4;
    box(g, '#534433', 0, 0.95, 1.32, 0.9, 1.3, 0.06);
    for (const x of [-1.2, 1.2]) { box(g, '#80613c', x, 1.2, 1.55, 0.08, 1.6, 0.08); box(g, '#d9e4db', x, 1.7, 1.62, 0.1, 0.8, 0.05); }
    box(g, '#5a4632', 0, 4.1, 0, 0.1, 1.4, 0.1);
    flag = box(g, color, 0.4, 4.5, 0, 0.8, 0.5, 0.05);
  } else if (kind === 'archery') {
    box(g, '#7a5433', 0, 1.1, 0, 2.6, 2.2, 2.4);
    const roof = mesh(g, new T.ConeGeometry(2.2, 1.1, 4), '#9e5838', 0, 2.7, 0, 1, 1, 0.9); roof.rotation.y = Math.PI / 4;
    box(g, '#534433', 0, 0.75, 1.22, 0.7, 1.3, 0.06);
    // Hedef tahtası.
    box(g, '#80613c', 1.9, 0.7, -0.6, 0.08, 1.4, 0.08);
    for (const [r, c] of [[0.55, '#eee0b6'], [0.38, '#c9503e'], [0.2, '#eee0b6'], [0.08, '#c9503e']]) mesh(g, new T.CylinderGeometry(r, r, 0.06, 12), c, 1.9, 1.4, -0.6).rotation.z = Math.PI / 2;
    box(g, '#5a4632', -0.9, 3.4, 0, 0.1, 1.4, 0.1);
    flag = box(g, color, -0.5, 3.8, 0, 0.8, 0.5, 0.05);
  } else if (kind === 'siege') {
    // Kuşatma atölyesi: taş platform, ahşap sundurma ve kurulu bir mancınık.
    box(g, '#8d8f9a', 0, 0.25, 0, 3.8, 0.5, 3.2);
    box(g, '#7a5433', 0, 1.3, -1.3, 3.6, 2.0, 0.5);
    for (const x of [-1.7, 1.7]) box(g, '#6b4e33', x, 1.5, 1.0, 0.32, 2.4, 0.32);
    box(g, '#9e5838', 0, 2.75, -0.1, 4.2, 0.35, 3.4);
    box(g, '#6b4e33', 0, 2.55, -1.3, 4.2, 0.25, 0.9);
    // Mancınık: kundak, tekerlekler, atış kolu, taş.
    box(g, '#80613c', 0.2, 0.9, 0.7, 1.9, 0.32, 1.3);
    for (const x of [-0.5, 0.9]) for (const z of [0.15, 1.2]) { const wh = mesh(g, new T.CylinderGeometry(0.4, 0.4, 0.16, 12), '#4a3a2a', x, 0.45, z); wh.rotation.z = Math.PI / 2; }
    for (const z of [0.3, 1.1]) box(g, '#8e6d4a', 0.2, 1.5, z, 0.14, 1.1, 0.14);
    box(g, '#8e6d4a', 0.2, 2.02, 0.7, 0.16, 0.16, 1.0);
    const arm = box(g, '#a07a50', 0.2, 1.75, 0.35, 0.16, 2.6, 0.16); arm.rotation.x = -0.8;
    ball(g, '#6a6f74', 0.2, 2.72, -0.55, 0.3, 0.3, 0.3);
    // Yedek taşlar ve örs.
    ball(g, '#7c7e88', -1.5, 0.55, 1.25, 0.3, 0.28, 0.3);
    ball(g, '#6a6f74', -1.05, 0.5, 1.6, 0.24, 0.22, 0.24);
    box(g, '#534433', -1.6, 0.75, 0.2, 0.7, 0.5, 0.6);
    box(g, '#5a4632', -1.75, 3.6, 0, 0.1, 1.6, 0.1);
    flag = box(g, color, -1.35, 4.0, 0, 0.8, 0.5, 0.05);
  } else if (kind === 'camp') {
    // Tarafsız kamp: kazıklı çit, iki çadır, totem ve ateş. Yıkılınca ruin grubu görünür.
    const camp = new T.Group(); g.add(camp);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = 2.6;
      const p = box(camp, i % 2 ? '#6b5335' : '#7a5f3c', Math.cos(a) * r, 0.9, Math.sin(a) * r, 0.22, 1.8, 0.22);
      p.rotation.z = Math.cos(a) * 0.12; p.rotation.x = Math.sin(a) * 0.12;
    }
    for (const [tx, tz, s] of [[-1.1, -0.6, 1], [1.2, 0.5, 0.85]]) {
      const tent = mesh(camp, new T.ConeGeometry(1.15 * s, 1.9 * s, 4), '#7f6a4a', tx, 0.95 * s, tz);
      tent.rotation.y = Math.PI / 4;
      box(camp, '#4c3c28', tx, 0.5 * s, tz + 1.05 * s, 0.5, 0.9 * s, 0.05);
    }
    box(camp, '#5a4632', 0.1, 1.7, 1.4, 0.16, 3.4, 0.16);
    ball(camp, '#c9b45c', 0.1, 3.5, 1.4, 0.26, 0.34, 0.26);
    ball(camp, '#33411f', 0.1, 3.05, 1.4, 0.34, 0.3, 0.34);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; box(camp, '#4a3a26', 0.1 + Math.cos(a) * 0.5, 0.18, -1.2 + Math.sin(a) * 0.5, 0.5, 0.18, 0.18).rotation.y = a; }
    ball(camp, '#e0803a', 0.1, 0.4, -1.2, 0.34, 0.5, 0.34);
    rng = groundRing(g, '#8fd15a', 2.9, 3.15, 0.3);
    // Yıkıntı: yanmış kazıklar, çökmüş çadır bezi, kül. Kamp ayaktayken gizlidir.
    const ruin = new T.Group(); ruin.visible = false; g.add(ruin);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3, r = 2.4;
      const p = box(ruin, '#3a2c1d', Math.cos(a) * r, 0.35, Math.sin(a) * r, 0.2, 0.7, 0.2);
      p.rotation.z = 0.5 + Math.cos(a * 3) * 0.3; p.rotation.x = Math.sin(a * 2) * 0.4;
    }
    box(ruin, '#5b4c39', -1.0, 0.12, -0.5, 2.0, 0.16, 1.4).rotation.y = 0.5;
    box(ruin, '#4e412f', 1.1, 0.1, 0.6, 1.6, 0.14, 1.2).rotation.y = -0.4;
    ball(ruin, '#2c2a26', 0.1, 0.12, -1.2, 0.8, 0.14, 0.8);
    box(ruin, '#3a2c1d', 0.4, 0.3, 1.2, 0.14, 1.6, 0.14).rotation.z = 1.1;
    return { g, flag: null, ring: rng, camp, ruin };
  } else if (kind === 'stable') {
    box(g, '#8a6a44', 0, 1.0, 0, 4.2, 2.0, 2.6);
    box(g, '#9e5838', 0, 2.35, 0, 4.6, 0.7, 3.0);
    box(g, '#6b4e33', 0, 2.9, 0, 2.6, 0.4, 1.4);
    box(g, '#534433', -1.2, 0.8, 1.32, 1.1, 1.5, 0.06); box(g, '#534433', 1.2, 0.8, 1.32, 1.1, 1.5, 0.06);
    // Yalak ve saman.
    box(g, '#795c3b', 2.6, 0.3, 0.6, 1.2, 0.5, 0.6); box(g, '#5f7fa0', 2.6, 0.5, 0.6, 1.0, 0.1, 0.4);
    ball(g, '#d8c27a', -2.5, 0.4, -0.4, 0.6, 0.45, 0.6);
    box(g, '#5a4632', 0, 3.8, 0, 0.1, 1.4, 0.1);
    flag = box(g, color, 0.4, 4.2, 0, 0.8, 0.5, 0.05);
  }
  return { g, flag, ring: rng };
}

function groundRing(g, color, r0, r1, opacity) {
  const r = mesh(g, new T.RingGeometry(r0, r1, 64), color, 0, 0.03, 0);
  r.rotation.x = -Math.PI / 2; r.castShadow = false;
  r.material = new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide });
  r.material.userData.own = true;
  return r;
}

/** Yapı kurar; instant değilse inşa süresi boyunca yerden büyür ve üretim yapamaz. */
export function createStructure(world, kind, faction, x, z, { instant = false } = {}) {
  const spec = BUILDINGS[kind];
  const { g, flag, ring: rng, camp, ruin } = structureMesh(kind, faction);
  g.position.set(x, 0, z); world.scene.add(g);
  const pos = new T.Vector3(x, 0, z);
  const obstacle = { pos, vel: new T.Vector3(), push: new T.Vector3(), radius: spec.radius, invMass: 0 };
  const s = {
    id: nextId++, kind, faction, pos, radius: spec.radius, hp: spec.hp, maxHp: spec.hp, alive: true, g, flag, ring: rng, hitFlash: 0, cooldown: 1,
    spawnTimer: 0, buildTime: spec.buildTime || 0, buildTimer: instant ? 0 : (spec.buildTime || 0), ready: instant || !spec.buildTime, obstacle, deadTimer: 0,
    // Üretim kuyruğu ve (kırmızı için) sisten bir kez görülmüşlük.
    queue: [], progress: 0, seen: faction === 'blue', respawnTimer: 0, raidSide: null,
  };
  s.campMesh = camp || null; s.ruinMesh = ruin || null;
  // Can çubuğu: yapının üstünde durur, yalnızca hasar alınca görünür (bkz. updateStructureBars).
  s.bars = makeHpBar(world.scene, kind === 'banner' ? 2.6 : kind === 'tower' ? 2 : 1.8, kind === 'banner' ? 0.26 : 0.22);
  s.barY = kind === 'banner' ? 5.8 : kind === 'tower' ? 6.6 : 4.2;
  if (faction === 'red') g.visible = false;
  if (kind === 'tower') {
    s.shooter = { pos, aim: new T.Vector3(), faction, isPlayer: false, isHero: false, isTower: true, level: 1, buff: 0, jumpY: 3.2, view: null, facing: 0, stats: { weapon: { range: TOWER.range, damage: TOWER.damage, knockback: 0, arrowSpeed: TOWER.arrowSpeed, ranged: true } } };
  }
  if (!s.ready) { g.scale.set(1, 0.08, 1); if (rng) rng.visible = false; }
  world.obstacles.push(obstacle);
  world.structures.push(s);
  return s;
}

/** Sancak, aynı tarafın en az bir kulesi ayaktayken (inşası sürse de) vurulamaz. */
/** O tarafın ayakta duran kule sayısı (kind='tower') ya da kule dışındaki bina sayısı (sancak hariç). */
export function structureCount(world, faction, towers) {
  let n = 0;
  for (const s of world.structures) {
    if (!s.alive || s.faction !== faction || s.kind === 'banner') continue;
    if (towers ? s.kind === 'tower' : s.kind !== 'tower') n++;
  }
  return n;
}

/**
 * Kalkanlı sancak: o tarafın ayakta (inşası sürse bile) en az bir kulesi varken sancak **can kaybetmez**.
 * Vuruş yine sancağa iner ve kalkana çarpar; bu vuruş o tarafın bütün kulelerini haritada ele verir (bkz. damageStructure).
 */
export function bannerShielded(world, s) {
  return s.kind === 'banner' && world.structures.some(t => t.alive && t.kind === 'tower' && t.faction === s.faction);
}

/**
 * Yapı kuralı: kule dışındaki binalar kendi sancağının çemberi içine; kuleler yalnızca yollara, başka kulelere
 * en az TOWER.minGap uzağa (kendi ve rakip kuleleri dahil) ve **rakibin sancak çemberinin dışına** dikilir.
 * Uygunsa null, değilse sebep döner.
 */
export function placementError(world, kind, x, z, faction) {
  if (kind === 'tower') {
    const onLane = (world.lanePoints || []).some(p => Math.hypot(p.x - x, p.z - z) <= TOWER.laneDist)
      || (world.towerSpots || []).some(t => Math.hypot(t.x - x, t.z - z) <= 3);
    if (!onLane) return 'Kuleler yalnızca yollara dikilir';
    // Rakibin sancak çemberi kuleye kapalıdır: üssünün dibine kule dikilemez.
    const foe = bannerOf(world, faction === 'blue' ? 'red' : 'blue');
    if (foe && foe.alive && Math.hypot(foe.pos.x - x, foe.pos.z - z) <= BUILD.bannerRadius) return 'Rakibin sancak çemberine kule dikilemez';
    for (const s of world.structures) {
      if (!s.alive || s.kind !== 'tower') continue;
      if (Math.hypot(s.pos.x - x, s.pos.z - z) < TOWER.minGap) return `Kuleler arası en az ${TOWER.minGap} birim olmalı`;
    }
    return null;
  }
  const b = bannerOf(world, faction);
  if (!b || !b.alive) return 'Sancak yıkıldı, inşa edilemez';
  if (Math.hypot(b.pos.x - x, b.pos.z - z) > BUILD.bannerRadius) return 'Sancak çemberinin dışına bina dikilemez';
  return null;
}

/**
 * Yapı kurulabilir mi: harita sınırı, engeller, başka yapı, çalışma yeri ve **düşman** birimleri.
 * `faction` verilirse o tarafın kendi birimleri engel sayılmaz (kendi askerinin üstüne bina dikilebilir).
 * Uygunsa null, değilse sebep döner.
 */
export function canPlace(world, x, z, radius, faction = null) {
  if (Math.abs(x) > HALF - radius - 1 || Math.abs(z) > HALF - radius - 1) return 'Harita dışı';
  for (const o of world.obstacles) if (Math.hypot(o.pos.x - x, o.pos.z - z) < o.radius + radius + 0.5) return 'Burası dolu';
  for (const s of world.structures) if (s.alive && Math.hypot(s.pos.x - x, s.pos.z - z) < s.radius + radius + 1) return 'Başka bir yapıya çok yakın';
  for (const sp of world.spots) if (Math.hypot(sp.x - x, sp.z - z) < radius + 1.2) return 'Çalışma yerinin üstüne kurulamaz';
  // Kendi birimlerin (kahraman, asker, işçi) inşaya engel değildir: yapı kurulunca kenara itilirler.
  // Yalnızca düşman birimi yeri kapatır.
  for (const e of world.entities) {
    if (!e.alive || (faction && e.faction === faction)) continue;
    if (Math.hypot(e.pos.x - x, e.pos.z - z) < e.radius + radius) return 'Üstünde düşman birimi var';
  }
  return null;
}

/** Yıkım: devrilir, engeli kalkar; kısa süre sonra sahneden silinir. Sancaklar kalır. */
export function collapseStructure(world, s) {
  s.alive = false; s.hp = 0; s.queue.length = 0; s.progress = 0;
  if (s.kind === 'camp') {
    // Kamp devrilmez: yerinde yıkıntısı kalır, üstünde yeniden kurulma geri sayımı görünür (bkz. updateCamps).
    if (s.campMesh) s.campMesh.visible = false;
    if (s.ruinMesh) s.ruinMesh.visible = true;
    if (s.ring) s.ring.visible = false;
    s.respawnTimer = CAMPS.respawn;
  } else {
    s.g.rotation.z = s.kind === 'tower' ? 0.35 : 0.5; if (s.flag) s.flag.visible = false; if (s.ring) s.ring.visible = false;
    s.g.scale.y = 0.55;
    if (s.kind !== 'banner') s.deadTimer = 2.5;
  }
  burst(world, s.pos.x, 2, s.pos.z, '#d9c4a0', 14, 0.14);
  const i = world.obstacles.indexOf(s.obstacle); if (i >= 0) world.obstacles.splice(i, 1);
  if (world.selected === s) world.selected = null;
}

/** Yıkılan kamp geri sayımı dolunca aynı yerde yeniden kurulur: canı dolar, modeli döner, geri sayımı sıfırlanır. */
export function reviveCamp(world, s) {
  s.alive = true; s.hp = s.maxHp; s.respawnTimer = 0; s.deadTimer = 0;
  if (s.campMesh) s.campMesh.visible = true;
  if (s.ruinMesh) s.ruinMesh.visible = false;
  if (s.ring) s.ring.visible = true;
  s.g.rotation.z = 0; s.g.scale.set(1, 1, 1);
  if (!world.obstacles.includes(s.obstacle)) world.obstacles.push(s.obstacle);
  ring(world, s.pos.x, s.pos.z, '#8fd15a', 4, 0.8);
  burst(world, s.pos.x, 2, s.pos.z, '#8fd15a', 16, 0.13);
}

export function removeStructure(world, s) {
  removeGroup(s.g);
  if (s.bars) { s.bars.g.parent.remove(s.bars.g); s.bars = null; }
  const i = world.structures.indexOf(s); if (i >= 0) world.structures.splice(i, 1);
  const j = world.obstacles.indexOf(s.obstacle); if (j >= 0) world.obstacles.splice(j, 1);
  if (world.selected === s) world.selected = null;
}

/** Yapıların can çubukları: her karede kameraya döner; yalnızca görünen ve hasar almış yapıda çıkar. */
export function updateStructureBars(world, camQuat) {
  for (const s of world.structures) {
    if (!s.bars) continue;
    setHpBar(s.bars, s.hp, s.maxHp, s.pos.x, s.barY, s.pos.z, camQuat, s.alive && s.g.visible);
  }
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
      const k = 1 - Math.max(0, s.buildTimer) / s.buildTime;
      s.g.scale.set(1, 0.08 + 0.92 * k, 1);
      if (s.buildTimer <= 0) {
        s.ready = true; s.g.scale.set(1, 1, 1); if (s.ring) s.ring.visible = true; s.spawnTimer = 0.5;
        const color = s.faction === 'blue' ? '#9fd6ff' : '#ffb59f';
        burst(world, s.pos.x, 2.5, s.pos.z, color, 16, 0.13); ring(world, s.pos.x, s.pos.z, color, s.radius + 4, 0.7);
        if (s.faction === 'blue') { world.ui.say(`${BUILDINGS[s.kind].label} hazır`, 1800); world.ui.ping('tower'); }
      }
    }
  }
}

/** Toplanma bayrağı: bu binadan çıkan askerler oraya yürür. Aynı yere ikinci kez konursa kaldırılır. */
/** Sınıf toplanma bayrağı (direk + flama + halka); rengi sınıfa göre. */
export function rallyFlag(world, x, z, color) {
  const g = new T.Group(); g.position.set(x, 0, z); world.scene.add(g);
  box(g, '#5a4632', 0, 1.1, 0, 0.08, 2.2, 0.08);
  box(g, color, 0.4, 1.9, 0, 0.8, 0.45, 0.04);
  const r = mesh(g, new T.RingGeometry(0.5, 0.62, 24), color, 0, 0.04, 0); r.rotation.x = -Math.PI / 2; r.castShadow = false;
  return g;
}

/** O tarafın ilk hazır (ayakta) yapısı; `near` verilirse en yakını. */
export function findBuilding(world, faction, kind, near = null) {
  let best = null, bd = Infinity;
  for (const s of world.structures) {
    if (!s.alive || !s.ready || s.faction !== faction || s.kind !== kind) continue;
    const d = near ? Math.hypot(s.pos.x - near.x, s.pos.z - near.z) : 0;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** Oyuncunun sol tıkla seçebileceği kendi yapısı: imlece en yakın olan. */
export function pickOwnStructure(world, x, z, faction = 'blue') {
  let best = null, bd = Infinity;
  for (const s of world.structures) {
    if (!s.alive || s.faction !== faction) continue;
    const d = Math.hypot(s.pos.x - x, s.pos.z - z) - s.radius;
    if (d < 1.4 && d < bd) { bd = d; best = s; }
  }
  return best;
}
