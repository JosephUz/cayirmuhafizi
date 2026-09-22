import * as T from '/vendor/three.module.js';
import { CulledGroup, ball, box, clamp, makeHpBar, mesh, ownMat, removeGroup, setHpBar } from './builders.js';
import { COLORS, COMBAT, DASH, HERO, HORSE, KIT, LEVEL, PLAYER_BASE, SHIELD, SOLDIER_BASE, SPRINT_MULT, TOWER, WEAPONS } from './config.js';

let nextId = 1;

/** Donanımdan (silah / kalkan / at) savaş ve hareket sayılarını türetir. */
export function makeStats(loadout, isPlayer) {
  const base = isPlayer ? PLAYER_BASE : SOLDIER_BASE;
  const weapon = { ...WEAPONS[loadout.weapon] };
  // Kahraman da (HERO.damageLikeSoldier) kendi türündeki asker kadar vurur.
  if (!weapon.siege) weapon.damage *= (isPlayer && !HERO.damageLikeSoldier ? 1 : SOLDIER_BASE.damageMult * (weapon.soldierMult || 1)) * (loadout.horse ? HORSE.damageMult : 1);
  // Kahraman yetenek seti silah değerlerini değiştirebilir (Kılıçlı Atlı: geniş yay, sert itme) ve vururken yavaşlamayı kaldırabilir.
  const kit = isPlayer ? KIT[kitKey(loadout)] : null;
  if (kit) { if (kit.arcMult) weapon.arc = Math.min(Math.PI * 1.9, weapon.arc * kit.arcMult); if (kit.knockMult) weapon.knockback *= kit.knockMult; }
  return {
    attackControl: kit && kit.attackControl != null ? kit.attackControl : undefined,
    speed: base.speed * (loadout.horse ? HORSE.speedMult : 1) * (loadout.shield ? SHIELD.speedMult : 1),
    accel: base.accel,
    maxHp: base.hp + (loadout.horse ? HORSE.hpBonus : 0) + (loadout.shield ? SHIELD.hpBonus : 0),
    radius: loadout.horse ? HORSE.radius : base.radius,
    invMass: base.invMass * (loadout.horse ? HORSE.invMassMult : 1),
    weapon,
  };
}

/** Yetenek seti anahtarı: silah x at ('sword', 'spear', 'bow', 'horsesword', 'horsespear', 'horsebow'); işçi / mancınıkta null. */
export function kitKey(loadout) {
  if (!loadout || !['sword', 'spear', 'bow'].includes(loadout.weapon)) return null;
  return (loadout.horse ? 'horse' : '') + loadout.weapon;
}
export const kitOf = e => kitKey(e && e.loadout);
/** Mızraklı Atlı hücumu: vuruş hasarı o anki hıza göre artar (duruşta 1x, tam koşuda 1 + chargeBonus). Öbür setlerde 1. */
export function chargeMult(e) {
  if (!(e.isPlayer || e.isHero) || kitOf(e) !== 'horsespear') return 1;
  const sp = Math.hypot(e.vel.x + e.push.x, e.vel.z + e.push.z), max = e.stats.speed * SPRINT_MULT;
  return 1 + KIT.horsespear.chargeBonus * Math.min(1, sp / max);
}

/** Seviyeden türeyen vuruş alanı çarpanları (kılıç / mızrak menzili, yay açısı). */
export const levelReachMult = e => Math.min(LEVEL.maxReachMult, 1 + LEVEL.reachPerLevel * (e.level - 1));
export const levelArcMult = e => Math.min(LEVEL.maxReachMult, 1 + LEVEL.arcPerLevel * (e.level - 1));

/** Yaylı kahramanın menzil çarpanı: her LEVEL.bowRangeEvery seviyede bir kademe büyür (ok sayısı ayrı, seviye kadar). */
export const bowRangeMult = e => 1 + LEVEL.bowRangeStep * Math.floor(e.level / LEVEL.bowRangeEvery);

/** Mancınık dışındaki birimlerin menzil tavanı: kule menzilinin üçte biri (seviye artışları da bunu aşamaz). */
export const rangeCap = w => (w.siege ? Infinity : TOWER.range * TOWER.unitRangeMax);

/** Gerçek vuruş alanı: kahramanda seviyeyle büyür (yayda kademeli menzil), askerde silahın kendi değerleri; tavanla sınırlı. */
export function reachOf(e) {
  const w = e.stats.weapon, cap = rangeCap(w);
  if (!(e.isPlayer || e.isHero)) return { range: Math.min(w.range, cap), arc: w.arc };
  if (w.ranged) return { range: Math.min(w.range * bowRangeMult(e), cap), arc: w.arc };
  const range = Math.min(w.range * levelReachMult(e), cap);
  // Kılıçlı kahraman çevresine 360° vurur; mızraklı kahraman yay değil, önüne koridor açar (bkz. KIT.spear.corridorLen / Width).
  if (w.label === 'Kılıç') return { range, arc: Math.PI * 2 };
  // Koridorun boyu da tavanı aşmaz: mızraklı kahramanın gerçek vuruş mesafesi koridorun uzunluğudur.
  if (w.label === 'Mızrak') return { range, arc: w.arc, corridor: { length: Math.min(range * KIT.spear.corridorLen, cap), width: KIT.spear.corridorWidth } };
  return { range, arc: Math.min(Math.PI * 1.9, w.arc * levelArcMult(e)) };
}

/** Vuruş yayı geometrisi: gerçek menzil ve açıyla çizilir, böylece gösterge alanı birebir gösterir. */
// Vuruş alanı görseli: yay (kılıç / asker), tam çember (kılıçlı kahraman) ya da koridor (mızraklı kahraman: ileri uzanan dikdörtgen).
const swingGeo = e => {
  const r = reachOf(e);
  if (r.corridor) return new T.PlaneGeometry(r.corridor.width, r.corridor.length).translate(0, r.corridor.length / 2, 0);
  return new T.RingGeometry(0.9, r.range, 44, 1, Math.PI / 2 - r.arc / 2, r.arc);
};
const swingEdgeGeo = e => {
  const r = reachOf(e);
  if (r.corridor) return new T.PlaneGeometry(r.corridor.width, 0.42).translate(0, r.corridor.length - 0.21, 0);
  return new T.RingGeometry(Math.max(0.95, r.range - 0.42), r.range, 48, 1, Math.PI / 2 - r.arc / 2, r.arc);
};

/** Seviye değişince kahramanın vuruş alanı göstergesini yeni menzile / açıya göre yeniden çizer. */
export function rebuildSwing(e) {
  const v = e.view; if (!v) return;
  if (v.swing) { v.swing.geometry.dispose(); v.swing.geometry = swingGeo(e); }
  if (v.swingEdge) { v.swingEdge.geometry.dispose(); v.swingEdge.geometry = swingEdgeGeo(e); }
}

/**
 * Bir seviyeden diğerine gereken tecrübe: LEVEL.xpBase + LEVEL.xpGrowth x (seviye - 1).
 * Seviye altınla alınmaz; exp yalnızca öldürmeyle kazanılır (bkz. main.js gainXp).
 */
export function xpNeeded(level) { return LEVEL.xpBase + LEVEL.xpGrowth * (level - 1); }

/** Sağ tık hortumunun yarıçap çarpanı: her LEVEL.dashEvery seviyede +LEVEL.dashPerStep. */
export function dashMult(e) { return 1 + LEVEL.dashPerStep * Math.floor((e.level || 1) / LEVEL.dashEvery); }

/** Sağ tık atılmasının mesafesi: taban DASH.base, seviye başına DASH.perLevel eklenir (en çok DASH.max). */
export function dashDistance(e) { return Math.min(DASH.max, DASH.base + DASH.perLevel * ((e.level || 1) - 1)); }

/** Kahraman bir seviye atlar: can artar, vuruş alanı göstergesi büyür. Efekt ve mesaj çağırana ait. */
export function applyLevelUp(e) {
  e.level++;
  // Azami can artar ama mevcut can doldurulmaz: can yalnızca sancak alanında yenilenir.
  e.stats.maxHp += LEVEL.hpPerLevel;
  e.stats.speed *= 1 + LEVEL.speedPerLevel;
  rebuildSwing(e);
}

/** Yeni bir savaşçı varlığı (oyuncu, asker ya da düşman). faction takım, owner sahibi (players.js; haydutlarda null). Görünüm ayrı eklenir. */
export function createEntity({ faction, owner = null, loadout, isPlayer = false, x = 0, z = 0 }) {
  const stats = makeStats(loadout, isPlayer);
  return {
    id: nextId++, faction, owner, isPlayer, loadout, stats,
    pos: new T.Vector3(x, 0, z), vel: new T.Vector3(), push: new T.Vector3(),
    radius: stats.radius, invMass: stats.invMass,
    hp: stats.maxHp, alive: true, facing: 0,
    moveDir: new T.Vector3(),
    aim: new T.Vector3(x, 0, z + 1),
    attackTimer: 0, cooldown: 0, didHit: false, stun: 0, hitFlash: 0, deathTimer: 0,
    blocking: false, sprinting: false, jumpY: 0, vy: 0, dodgeTimer: 0, dodgeCd: 0, invuln: 0, aimLocked: false,
    level: 1, heroKills: 0, xp: 0, isHero: false, isWorker: false, workerKind: null, spawnTimer: 0, working: false, workTimer: 0, work: null, typeKey: null, vision: 10,
    walkPhase: Math.random() * 6, bobPhase: Math.random() * 6,
    brain: isPlayer ? null : { mode: 'march', timer: 0, target: null, retarget: 0 },
    view: null,
  };
}

/** Kaçış (ve sonrasındaki vurulmazlık) / zıplama sırasında yakın dövüş vuruşları geçmez. */
export function isEvading(e) { return e.dodgeTimer > 0 || e.invuln > 0 || e.jumpY > COMBAT.jumpDodgeHeight; }

function weaponMesh(parent, type) {
  const g = new T.Group(); parent.add(g);
  if (type === 'bow') {
    const curve = new T.EllipseCurve(0, 0, 0.3, 0.62, -Math.PI / 2, Math.PI / 2, false, 0);
    const pts = curve.getPoints(12).map(p => new T.Vector3(p.x, p.y, 0));
    g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: '#775033' })));
    g.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, -0.62, 0), new T.Vector3(0, 0.62, 0)]), new T.LineBasicMaterial({ color: '#eee0b6' })));
  } else if (type === 'catapult') {
    // Mancınık mürettebatı: kısa tokmak.
    box(g, '#80613c', 0, 0.4, 0, 0.07, 0.9, 0.07);
    box(g, '#6a6f74', 0, 0.85, 0, 0.26, 0.2, 0.2);
  } else if (type === 'tool') {
    // Kazma: sap + demir uç.
    box(g, '#80613c', 0, 0.5, 0, 0.07, 1.4, 0.07);
    box(g, '#9a9ca6', 0, 1.15, 0.1, 0.1, 0.12, 0.6);
    box(g, '#9a9ca6', 0, 1.15, 0.38, 0.09, 0.09, 0.2);
  } else if (type === 'spear') {
    box(g, '#80613c', 0, 0.7, 0, 0.07, 2.3, 0.07);
    mesh(g, new T.ConeGeometry(0.13, 0.48, 4), '#d5dbcf', 0, 2, 0);
  } else {
    box(g, '#d9e4db', 0, 0.55, 0, 0.13, 1.05, 0.07);
    box(g, '#bf9748', 0, 0.02, 0, 0.4, 0.1, 0.13);
    box(g, '#69472d', 0, -0.15, 0, 0.1, 0.25, 0.1);
  }
  return g;
}

/** Kutulardan kurulu rig. Renk dışında herkes aynı iskeleti kullanır. */
export function buildView(scene, e) {
  const { weapon, shield, horse } = e.loadout;
  const blue = e.faction === 'blue', beast = e.faction === 'beast';
  const tunic = beast ? COLORS.beast : e.isWorker ? (blue ? '#5b7f9a' : '#9a6a5b') : blue ? (e.isPlayer ? COLORS.bluePlayer : COLORS.blue) : weapon === 'bow' ? COLORS.redBow : COLORS.red;
  const tunicMat = ownMat(tunic);

  // Kök CulledGroup: ekran dışında (bkz. main.js görüş elemesi) gizlenir ve matrisleri güncellenmez.
  const g = new CulledGroup(), body = new T.Group();
  g.add(body); body.position.y = horse ? 0.78 : 0;
  box(body, tunicMat, 0, 1, 0, 0.62, 0.72, 0.36);
  // Kahraman kafası takım rengini söyler: senin takımınınki sarı, rakip takımınki kırmızı (müttefik bot kahramanı da sarı).
  const headColor = e.faction === 'red' ? HERO.enemyHeadColor : HERO.headColor;
  box(body, e.isPlayer || e.isHero ? headColor : '#e1b48a', 0, 1.64, 0, 0.57, 0.57, 0.52);
  box(body, e.isPlayer || e.isHero ? headColor : beast ? COLORS.beastHead : e.isWorker ? '#d8c27a' : blue ? '#433e36' : '#818b83', 0, 1.95, 0, 0.62, 0.15, 0.57);
  if (e.isWorker) { mesh(body, new T.CylinderGeometry(0.55, 0.6, 0.06, 10), '#d8c27a', 0, 1.94, 0); box(body, '#8a6a44', 0, 0.62, -0.28, 0.5, 0.45, 0.22); }
  for (const x of [-0.13, 0.13]) box(body, '#30372f', x, 1.7, 0.268, 0.065, 0.07, 0.03);

  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const l = new T.Group(); l.position.set(s * (horse ? 0.3 : 0.18), 0.65, 0); body.add(l);
    if (horse) { l.rotation.x = -1.25; l.rotation.z = s * 0.35; }
    box(l, '#414e4a', 0, -0.29, 0, 0.23, 0.58, 0.27);
    box(l, '#433d31', 0, -0.58, 0.07, 0.26, 0.15, 0.37);
    legs.push(l);
    const a = new T.Group(); a.position.set(s * 0.43, 1.3, 0); body.add(a);
    box(a, tunicMat, 0, -0.23, 0, 0.22, 0.47, 0.27);
    box(a, '#dfb387', 0, -0.5, 0, 0.2, 0.18, 0.23);
    arms.push(a);
  }
  const w = weaponMesh(arms[1], weapon);
  w.position.set(0, -0.45, 0.27); w.rotation.x = 0.2;

  // Mancınık arabası: mürettebatın yanında tekerlekli ahşap kundak ve fırlatma kolu.
  if (e.isSiege) {
    const cart = new T.Group(); cart.position.set(1.05, 0, 0); g.add(cart);
    const wood = blue ? '#7d5f3f' : '#6e4b33';
    box(cart, wood, 0, 0.5, 0, 1.3, 0.22, 1.1);
    for (const x of [-0.55, 0.55]) for (const z of [-0.5, 0.5]) { const wh = mesh(cart, new T.CylinderGeometry(0.28, 0.28, 0.12, 10), '#4a3a2a', x, 0.28, z); wh.rotation.z = Math.PI / 2; }
    for (const z of [-0.35, 0.35]) box(cart, wood, 0, 0.95, z, 0.1, 0.7, 0.1);
    box(cart, wood, 0, 1.3, 0, 0.12, 0.12, 0.9);
    const arm = box(cart, '#8e6d4a', 0, 1.05, -0.3, 0.1, 1.5, 0.1); arm.rotation.x = -0.9;
    ball(cart, '#6a6f74', 0, 1.62, -0.95, 0.22, 0.22, 0.22);
  }

  let shieldMesh = null;
  if (shield) {
    shieldMesh = mesh(arms[0], new T.CylinderGeometry(0.43, 0.43, 0.12, 8), blue ? COLORS.blueShield : COLORS.redShield, 0, -0.27, 0.29);
    shieldMesh.rotation.x = Math.PI / 2;
    ball(arms[0], '#cbb977', 0, -0.27, 0.38, 0.14, 0.14, 0.06);
  }

  const horseLegs = [];
  if (horse) {
    const hc = blue ? '#6f5a48' : '#865838';
    box(g, hc, 0, 0.88, 0, 0.64, 0.7, 1.38);
    box(g, hc, 0, 1.32, 0.64, 0.38, 0.9, 0.43);
    box(g, blue ? '#846c58' : '#9a6945', 0, 1.68, 0.89, 0.38, 0.42, 0.69);
    box(g, '#483b2b', 0, 1.72, 0.48, 0.2, 0.61, 0.24);
    for (const x of [-0.22, 0.22]) for (const z of [-0.48, 0.48]) horseLegs.push(box(g, '#65462e', x, 0.36, z, 0.15, 0.72, 0.17));
    box(g, '#483b2b', 0, 0.72, -0.87, 0.16, 0.62, 0.18);
  }

  // Vuruş yayı: gövdenin önünde parlayıp sönen dilim (yalnızca yakın dövüş). Kahramanda gerçek menzil / açıyla
  // çizilir ve kenarı belirgin bir çizgiyle vurgulanır; böylece seviyeyle büyüyen alan vuruş anında net görünür.
  const hero = e.isPlayer || e.isHero;
  let swing = null, swingEdge = null;
  if (!e.stats.weapon.ranged) {
    swing = new T.Mesh(swingGeo(e), new T.MeshBasicMaterial({ color: blue ? '#fff2a8' : '#ff9d7a', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
    swing.material.userData.own = true;
    swing.rotation.x = Math.PI / 2; swing.position.y = 0.14; swing.visible = false;
    g.add(swing);
    if (hero) {
      swingEdge = new T.Mesh(swingEdgeGeo(e), new T.MeshBasicMaterial({ color: blue ? '#ffdf4a' : '#ff6a3a', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      swingEdge.material.userData.own = true;
      swingEdge.rotation.x = Math.PI / 2; swingEdge.position.y = 0.17; swingEdge.visible = false;
      g.add(swingEdge);
    }
  }

  // Sahip halkası: birimin ayağında sahibinin rengi (sen altın, botlar kendi rengi); takım rengi gövdede kalır.
  // Böylece takım oyununda kendi askerin müttefikinkinden ayrılır. Haydutlarda halka yok.
  if (e.owner) {
    const r0 = hero ? 0.65 : e.radius + 0.06, r1 = hero ? 0.78 : e.radius + 0.14;
    const marker = mesh(g, new T.RingGeometry(r0, r1, hero ? 40 : 24), e.owner.color, 0, 0.045, 0);
    marker.rotation.x = -Math.PI / 2; marker.castShadow = false;
  }
  // Seçim halkası (komutan modu): varsayılan gizli.
  const sel = mesh(g, new T.RingGeometry(e.radius + 0.25, e.radius + 0.42, 32), '#c8ff8a', 0, 0.05, 0);
  sel.rotation.x = -Math.PI / 2; sel.castShadow = false; sel.visible = false;

  // Can çubuğu (kahraman dahil herkeste): kırmızı şerit + yeşil dolgu, yalnızca darbe alınca görünür.
  const bars = makeHpBar(scene, e.isPlayer || e.isHero ? 1.4 : 1.1, e.isPlayer || e.isHero ? 0.2 : 0.16);
  const hpBar = bars.g, hpFill = bars.fill;

  scene.add(g);
  e.view = { g, body, legs, arms, w, shieldMesh, horseLegs, swing, swingEdge, tunicMat, hpBar, hpFill, bars, sel, mounted: horse };
  return e.view;
}

export function removeView(e) {
  if (!e.view) return;
  removeGroup(e.view.g);
  if (e.view.hpBar) e.view.hpBar.parent.remove(e.view.hpBar);
  e.view = null;
}

/** Tamamen prosedürel canlandırma: yürüyüş sinüs, saldırı tek eğri, ölüm devrilip gömülme. */
export function animateView(e, dt, camQuat) {
  const v = e.view; if (!v) return;
  v.g.position.x = e.pos.x; v.g.position.z = e.pos.z; v.g.rotation.y = e.facing;

  if (!e.alive) { animateDeath(e, v); }
  else {
    v.g.rotation.x = 0; v.g.rotation.z = 0; v.g.visible = true;
    animateAlive(e, v, dt);
    // Yeni basılan birim yerden büyüyerek belirir.
    if (e.spawnTimer > 0) { e.spawnTimer -= dt; const k = 1 - Math.max(0, e.spawnTimer) / 0.5; const s = 0.2 + 0.8 * (1 - Math.pow(1 - k, 3)) * (1 + 0.25 * Math.sin(k * Math.PI)); v.g.scale.setScalar(s); }
    else v.g.scale.setScalar(1);
  }
  updateSwing(e, v);
  const f = e.hitFlash > 0 ? e.hitFlash / COMBAT.hitFlash : 0;
  v.tunicMat.emissive.setRGB(f * 0.9, f * 0.1, f * 0.05);
  // Canı tamsa çubuk hiç görünmez; darbe alınca yeşil → sarı → kırmızı dolgu çıkar.
  setHpBar(v.bars, e.hp, e.stats.maxHp, e.pos.x, (v.mounted ? 3.3 : 2.35) + e.jumpY, e.pos.z, camQuat, e.alive);
}

function animateAlive(e, v, dt) {
  const speed = Math.hypot(e.vel.x + e.push.x, e.vel.z + e.push.z);
  const gait = clamp(speed / e.stats.speed, 0, 1.4);
  e.bobPhase += dt * 2.4;
  e.walkPhase += dt * (4 + gait * 7);
  const s = Math.sin(e.walkPhase);
  const stride = s * 0.55 * gait;
  if (!v.mounted) { v.legs[0].rotation.x = stride; v.legs[1].rotation.x = -stride; }
  const armDrop = e.stun > 0 ? 0.5 : 0;
  v.arms[0].rotation.x = -stride - armDrop; v.arms[1].rotation.x = stride - armDrop;
  v.arms[0].rotation.z = 0.08 + gait * 0.1; v.arms[1].rotation.z = -0.08 - gait * 0.1;
  for (let i = 0; i < v.horseLegs.length; i++) v.horseLegs[i].rotation.x = Math.sin(e.walkPhase + (i % 2) * Math.PI) * 0.35 * Math.max(gait, 0.05);
  const bob = Math.abs(s) * 0.09 * gait + Math.sin(e.bobPhase) * 0.02 * (1 - gait);
  v.g.position.y = e.jumpY + (v.mounted ? bob * 0.5 : bob);
  v.body.rotation.x = -0.14 * gait + (e.dodgeTimer > 0 ? 0.45 : 0);
  v.body.rotation.y = s * 0.12 * gait;
  if (e.jumpY > 0.05 && !v.mounted) { v.legs[0].rotation.x = -0.5; v.legs[1].rotation.x = 0.35; }

  if (e.attackTimer > 0) applyAttackPose(e, v);
  // Çalışma: kazma / balta sallama.
  if (e.working) { const k = Math.sin(e.workTimer * 9); v.arms[1].rotation.x = -1.6 + k * 0.9; v.arms[1].rotation.z = -0.3; v.arms[0].rotation.x = -0.8 + k * 0.4; v.body.rotation.x = 0.18 + k * 0.08; }
  if (e.blocking) { v.arms[0].rotation.x = -1.15; v.arms[0].rotation.z = 0.15; }
}

/** Saldırı: geri çekme (windup) sonra hızlı savurma ve toparlanma. */
function applyAttackPose(e, v) {
  const { duration, windup, ranged } = e.stats.weapon;
  const elapsed = duration - e.attackTimer;
  const wr = windup / duration;
  const t = clamp(elapsed / duration, 0, 1);
  if (ranged) {
    // Yay: sol kol hedefe uzanır, sağ kol kirişi çeker ve bırakır.
    v.arms[0].rotation.x = -1.5;
    v.arms[1].rotation.x = t < wr ? -1.5 + 0.6 * (t / wr) : -1.5 + 0.6 * (1 - (t - wr) / (1 - wr));
    v.arms[1].rotation.z = -0.3;
    return;
  }
  let armAngle, twist;
  if (t < wr) { const k = t / wr; armAngle = 1.5 * k; twist = 0.5 * k; }
  else { const k = (t - wr) / (1 - wr); const ease = 1 - Math.pow(1 - k, 3); armAngle = 1.5 - 3.4 * ease; twist = 0.5 - 1.1 * ease; }
  v.arms[1].rotation.x = armAngle; v.arms[1].rotation.z = -0.35;
  v.arms[0].rotation.x = -armAngle * 0.35;
  v.body.rotation.y = twist;
}

function animateDeath(e, v) {
  const t = clamp(e.deathTimer / COMBAT.deathDuration, 0, 1);
  const ease = 1 - Math.pow(1 - t, 2);
  v.g.rotation.x = -Math.PI * 0.5 * ease; v.g.rotation.z = 0.25 * ease;
  if (!v.mounted) { v.legs[0].rotation.x = 0.4 * ease; v.legs[1].rotation.x = -0.3 * ease; }
  v.arms[0].rotation.x = -0.9 * ease; v.arms[1].rotation.x = -1.2 * ease;
  const sink = clamp((e.deathTimer - COMBAT.deathDuration) / COMBAT.sinkDuration, 0, 1);
  v.g.position.y = -sink * 2.2;
  v.g.visible = sink < 1;
}

function updateSwing(e, v) {
  if (!v.swing) return;
  const hero = e.isPlayer || e.isHero;
  const { duration, windup } = e.stats.weapon;
  const hide = () => { v.swing.visible = false; if (v.swingEdge) v.swingEdge.visible = false; };
  if (e.attackTimer <= 0 || !e.alive) { hide(); return; }
  const elapsed = duration - e.attackTimer;
  if (elapsed < windup) { hide(); return; }
  const k = clamp((elapsed - windup) / (duration - windup), 0, 1);
  v.swing.visible = true;
  // Kahramanda yay tam boyunda çizilir (vurduğu alanın tamamı görünür) ve daha koyu kalır.
  v.swing.material.opacity = (1 - k) * (hero ? 0.75 : 0.55);
  const s = hero ? 1 : 0.75 + k * 0.45;
  v.swing.scale.set(s, s, s);
  if (v.swingEdge) { v.swingEdge.visible = true; v.swingEdge.material.opacity = 1 - k * 0.55; }
}
