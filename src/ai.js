import { dampAngle, distXZ, yawFromDir } from './builders.js';
import { canAttack, heroReach, startAttack, nearestEnemyTower } from './combat.js';
import { ARMY, BUILD, CAMPS, ECONOMY, ENEMY, ENEMY_AI, ENEMY_HERO, POSITIONS, RALLY, TOWER, VISION, WORKER } from './config.js';
import { produceItem, heroGather } from './economy.js';
import { rrand } from './rng.js';
import { bannerOf, bannerShielded } from './structures.js';

/**
 * Asker beyni.
 * Komutan modunda mavi askerler kafasına göre hareket etmez: durduğu yeri tutar, yalnızca yakına gelen
 * düşmanla dövüşür ve emirle hareket eder. Kahraman modunda ise görünen tüm düşmanlara kendiliğinden saldırır. Emirler: move (yürü, dövüşme), attackmove (yürü, yolda
 * çıkanla dövüş), attack (hedefi kovala; birim ya da yapı), stop.
 * Kırmızı askerler toplanma noktasında birikir; rakip saldırı kararı verince kendiliğinden ilerler (kule -> sancak). Komutan modunda kahraman da bir asker gibi yönetilir.
 * Rakip kahraman ve işçiler toplayıcı beynini kullanır.
 */
export function updateUnit(world, e, dt) {
  const b = e.brain;
  if (!b || !e.alive) return;
  if (e.isPlayer && world.mode !== 'aoe') return;
  if (e.stun > 0) { e.moveDir.set(0, 0, 0); return; }
  if (e.isBeast) { updateBeast(world, e, dt); return; }
  if (e.isWorker && e.mergeTo) { updateMerging(world, e, dt); return; }
  if (e.isHero || e.isWorker) { updateGatherer(world, e, dt); return; }
  // Kırmızı ordu yalnızca saldırı kararı verilince ilerler; aksi hâlde toplanma noktasında birikir (aşağıdaki bekleme mantığı).
  if (e.faction === 'red' && world.enemyEco.attacking) { updateAutonomous(world, e, dt); return; }

  b.timer -= dt; b.retarget -= dt;
  const home = b.home || (b.home = { x: e.pos.x, z: e.pos.z });
  const o = b.order;
  // Mavi ordu iki modda da kendiliğinden dövüşür; tek tek yönetilmez, yalnızca toplanma alanıyla yönlendirilir.
  if (e.faction === 'blue' && !o && !e.isPlayer) { updateAggressive(world, e, dt); return; }

  if (o && o.kind === 'attack') {
    const t = o.target;
    if (!t || !t.alive) { b.order = null; b.home = { x: e.pos.x, z: e.pos.z }; b.target = null; return; }
    e.aim.copy(t.pos); engage(world, e, t.pos, t.radius, dt); return;
  }
  if (o && o.kind === 'move') {
    const d = distXZ(e.pos, o);
    if (d > ARMY.arrive) { steerTo(e, o.x, o.z, dt, 1); avoidStuck(e, dt); }
    else { b.order = null; b.home = { x: o.x, z: o.z }; e.moveDir.set(0, 0, 0); }
    return;
  }
  // attackmove ya da bekleme: yakındaki düşmanla dövüş; yoksa hedefe / eve yürü.
  const anchor = o ? o : home;
  if (b.retarget <= 0) { b.retarget = 0.3; b.target = findTarget(world, e, anchor); }
  const target = b.target && b.target.alive ? b.target : null;
  if (target) { e.aim.copy(target.pos); engage(world, e, target.pos, target.radius, dt); return; }
  // Mancınık: dövüşecek birim yoksa menzilindeki bilinen kuleyi yerinden döver.
  if (e.isSiege) { const tw = nearestEnemyTower(world, e, e.stats.weapon.range + 2); if (tw) { e.aim.copy(tw.pos); engage(world, e, tw.pos, tw.radius, dt); return; } }
  const d = distXZ(e.pos, anchor);
  if (d > ARMY.arrive) { steerTo(e, anchor.x, anchor.z, dt, 1); avoidStuck(e, dt); }
  else { e.moveDir.set(0, 0, 0); if (o) { b.order = null; b.home = { x: o.x, z: o.z }; } }
}

/** Askerin bağlı olduğu nokta: sınıfının toplanma bayrağı, yoksa doğduğu / son durduğu yer. */
const rallyAnchor = (world, e) => (e.faction === 'blue' && e.rallyClass && world.rally[e.rallyClass]) || e.brain.home;

/**
 * Mavi asker: toplanma alanı hem üssü hem hedefidir. Bayrağa yürür ve yalnızca bayrağın RALLY.engageRadius
 * yarıçapı içinde, sisin kalktığı yerdeki hedeflerle dövüşür: önce görünen düşman birimleri, sonra kuleler,
 * sonra binalar, en son (kuleler yıkılınca) sancak. Bu alanın dışında haritada başıboş gezmez.
 */
function updateAggressive(world, e, dt) {
  const b = e.brain, fog = world.fog;
  const anchor = rallyAnchor(world, e) || (b.home = { x: e.pos.x, z: e.pos.z });
  const R = RALLY.engageRadius;
  if (b.retarget <= 0) {
    b.retarget = 0.3; b.target = null;
    let bd = Infinity;
    for (const t of world.entities) {
      if (!t.alive || t.faction === e.faction || !fog.isVisible(t.pos.x, t.pos.z)) continue;
      if (distXZ(t.pos, anchor) > R) continue;
      const d = distXZ(e.pos, t.pos);
      if (d < bd) { bd = d; b.target = t; }
    }
  }
  const target = b.target && b.target.alive && distXZ(b.target.pos, anchor) <= R ? b.target : null;
  if (target) { e.aim.copy(target.pos); engage(world, e, target.pos, target.radius, dt); return; }
  const s = nearestStructure(world, e, anchor, R);
  if (s) { e.aim.copy(s.pos); engage(world, e, s.pos, s.radius, dt); return; }
  if (distXZ(e.pos, anchor) > ARMY.arrive) { steerTo(e, anchor.x, anchor.z, dt, 1); avoidStuck(e, dt); } else e.moveDir.set(0, 0, 0);
}

/** Bu nokta ayakta bir mavi kulenin menzilinde (pay dahil) mi? Kırmızı askerler oraya girmez. */
export function inBlueTowerRange(world, pos, margin = ENEMY_AI.towerMargin) {
  for (const s of world.structures) {
    if (!s.alive || s.faction !== 'blue' || s.kind !== 'tower') continue;
    if (distXZ(pos, s.pos) <= TOWER.range + margin) return true;
  }
  return false;
}

/**
 * Kırmızı asker (saldırıda): yakındaki düşmanı kovala (kule menziline girmeden) -> mancınık varsa onun yanında ilerle ve
 * koru -> bilinen kule dışı yapıya yürü -> hiçbiri yoksa keşfet. Kulelere asla vurmaz; kuleleri mancınık döver.
 */
function updateAutonomous(world, e, dt) {
  const b = e.brain;
  b.timer -= dt; b.retarget -= dt;
  if (b.retarget <= 0) { b.retarget = 0.3; b.target = findTarget(world, e, null); }
  const target = b.target && b.target.alive ? b.target : null;
  if (target) { e.aim.copy(target.pos); engage(world, e, target.pos, target.radius, dt); return; }
  if (!e.isSiege) {
    // Mancınığa eşlik: ordunun en yakın mancınığının yanında dur.
    let cat = null, cd = Infinity;
    for (const o of world.entities) { if (!o.alive || o.faction !== 'red' || !o.isSiege) continue; const d = distXZ(e.pos, o.pos); if (d < cd) { cd = d; cat = o; } }
    if (cat) {
      if (cd > ENEMY_AI.escortDist) { steerTo(e, cat.pos.x, cat.pos.z, dt, 1); avoidStuck(e, dt); } else e.moveDir.set(0, 0, 0);
      return;
    }
  }
  // Yalnızca görülmüş (bilinen) mavi yapılara saldırır; asker kuleye vurmaz ve kule menziline girmez.
  const s = nearestStructure(world, e);
  if (s) { e.aim.copy(s.pos); engage(world, e, s.pos, s.radius, dt); return; }
  // Bilinen hedef yok: hat kulesi yerlerine, sonra mavi sancağa doğru yürüyerek keşfet (kule menzilinin dışında kalır).
  const p = nextMarchPoint(world, e);
  if (!p || (!e.isSiege && inBlueTowerRange(world, e.pos, ENEMY_AI.towerMargin - 1))) { e.moveDir.set(0, 0, 0); return; }
  steerTo(e, p.x, p.z, dt, 1); avoidStuck(e, dt);
}

/** Kırmızı ordunun keşif rotası: henüz 6 birimden yakın olunmayan en yakın mavi kule yeri, hepsi gezildiyse mavi sancak. */
function nextMarchPoint(world, e) {
  let best = null, bd = Infinity;
  // Mancınık kule yerine menzilinin %90'ına kadar yaklaşır; asker kule menzilinin dışında (pay) durur.
  const stop = e.isSiege ? e.stats.weapon.range * 0.9 : TOWER.range + ENEMY_AI.towerMargin;
  for (const t of world.towerSpots) {
    if (t.faction !== 'blue') continue;
    const d = distXZ(e.pos, t);
    if (d < stop) continue;
    if (d < bd) { bd = d; best = t; }
  }
  const banner = bannerOf(world, 'blue');
  if (!best || (banner.alive && distXZ(e.pos, banner.pos) < bd * 0.7)) return banner.alive && distXZ(e.pos, banner.pos) > 6 ? banner.pos : best;
  return best;
}

/** Rakip kahramanın keşif noktaları: mavi kule yerleri, mavi üs binaları ve sancak. */
function scoutPoints(world) {
  const base = world.bases.blue;
  const pts = world.towerSpots.filter(t => t.faction === 'blue').map(t => ({ x: t.x, z: t.z }));
  for (const k of ['barracks', 'archery', 'stable', 'farm', 'mine']) pts.push(base.at(POSITIONS.base[k]));
  pts.push({ x: base.pos.x, z: base.pos.z });
  return pts;
}

/** Emir ver: birden fazla birim varsa hedef nokta hafifçe dağıtılır (üst üste yığılmasınlar). */
export function giveOrder(world, units, order) {
  const list = [...units].filter(e => e.alive && e.brain && !e.isWorker && !e.isHero);
  list.forEach((e, i) => {
    const o = { ...order };
    if (o.kind !== 'attack' && list.length > 1) { const a = i * 2.4, r = i === 0 ? 0 : 2.2 * Math.sqrt(i); o.x += Math.cos(a) * r; o.z += Math.sin(a) * r; }
    e.brain.order = o; e.brain.target = o.kind === 'attack' && !o.target.kind ? o.target : null; e.brain.retarget = 0;
  });
  return list.length;
}

/** Dur: emri sil, bulunduğu yeri ev yap. */
export function stopUnits(world, units) {
  let n = 0;
  for (const e of units) { if (!e.alive || !e.brain || e.isWorker) continue; e.brain.order = null; e.brain.target = null; e.brain.home = { x: e.pos.x, z: e.pos.z }; e.moveDir.set(0, 0, 0); n++; }
  return n;
}

/** Yapı o taraf için bilinir mi? Mavi sisle görür (seen), kırmızı gördüğünü hatırlar (seenByRed). */
const knownTo = (e, st) => (e.faction === 'blue' ? st.seen : st.seenByRed);

/**
 * Hedef yapı önceliği: önce **kuleler**, sonra diğer **binalar**, en son **sancak** (yalnızca o tarafın kulesi
 * kalmayınca, bkz. bannerShielded). anchor verilirse yalnızca o noktanın radius yarıçapındaki yapılar sayılır.
 * Mancınık her yapıya vurabilir (kuleyi yeğler); kırmızı asker kuleye hiç gitmez ve kule menzilindeki yapıyı hedeflemez.
 */
function nearestStructure(world, e, anchor = null, radius = Infinity) {
  let tower = null, td = Infinity, other = null, od = Infinity, banner = null, bnd = Infinity;
  for (const st of world.structures) {
    if (!st.alive || st.faction === e.faction || !knownTo(e, st)) continue;
    if (anchor && distXZ(st.pos, anchor) > radius) continue;
    if (e.faction === 'red' && !e.isSiege && (st.kind === 'tower' || inBlueTowerRange(world, st.pos))) continue;
    const d = distXZ(e.pos, st.pos);
    if (st.kind === 'tower') { if (d < td) { td = d; tower = st; } }
    else if (st.kind === 'banner') { if (d < bnd) { bnd = d; banner = st; } }
    else if (d < od) { od = d; other = st; }
  }
  // Kule kalmadıysa ve sancak görüş mesafesindeyse asker başka binaya gitmez, sancağı dövmeye devam eder.
  // Kalkanlı sancak (kulesi ayakta) can kaybetmediği için öne geçmez; yalnızca başka hedef yoksa dövülür (kuleleri ele verir).
  const bannerSeen = banner && !bannerShielded(world, banner) && bnd <= (e.vision || VISION.soldier) + banner.radius;
  return tower || (bannerSeen ? banner : null) || other || banner;
}

function findTarget(world, e, anchor) {
  const aggro = e.faction === 'blue' ? ARMY.aggro : ENEMY.aggro;
  const own = bannerOf(world, e.faction);
  let best = null, bestScore = Infinity;
  for (const t of world.entities) {
    if (!t.alive || t.faction === e.faction || (e.isPlayer && t.isWorker)) continue;
    // Kırmızı asker kule menzilindeki düşmanı kovalamaz.
    if (e.faction === 'red' && !e.isHero && inBlueTowerRange(world, t.pos)) continue;
    const d = distXZ(e.pos, t.pos);
    if (anchor) {
      // Bekleyen / emirli asker: yalnızca kendi menzilindeki ve durduğu noktaya yakın düşmanlar.
      if (d > aggro || distXZ(t.pos, anchor) > ARMY.leash) continue;
      if (d < bestScore) { bestScore = d; best = t; }
      continue;
    }
    // Kendi sancağına yaklaşan düşman, uzakta olsa da öncelikli.
    const threat = own && own.alive && distXZ(t.pos, own.pos) < 14;
    if (d > aggro && !threat) continue;
    const score = threat ? d * 0.5 : d;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function engage(world, e, pos, radius, dt) {
  const b = e.brain, w = e.stats.weapon;
  const dist = distXZ(e.pos, pos);
  if (w.ranged) {
    // Yaylı kahramanın menzili seviyeyle büyür; mancınık kule menzilinin dışında (menzilinin %90'ında) durur.
    const rng = heroReach(e).range;
    if (dist > rng * (e.isSiege ? 0.9 : 0.7)) steerTo(e, pos.x, pos.z, dt, 1);
    else if (dist < rng * 0.3) steerTo(e, e.pos.x * 2 - pos.x, e.pos.z * 2 - pos.z, dt, 0.8, pos);
    else { e.moveDir.set(0, 0, 0); faceTowards(e, pos.x, pos.z, dt, 12); }
    if (dist < rng && b.timer <= 0 && canAttack(e) && facingError(e, pos) < 0.35) { startAttack(e); b.timer = rrand(0.2, 0.6); }
  } else {
    const stopAt = w.range * 0.7 + radius;
    if (dist > stopAt) steerTo(e, pos.x, pos.z, dt, 1);
    else {
      e.moveDir.set(0, 0, 0); faceTowards(e, pos.x, pos.z, dt, 12);
      if (dist <= w.range + radius && b.timer <= 0 && canAttack(e)) { startAttack(e); b.timer = rrand(0.15, 0.45); }
    }
  }
  avoidStuck(e, dt);
}

function steerTo(e, x, z, dt, throttle, face = null) {
  const dx = x - e.pos.x, dz = z - e.pos.z, len = Math.hypot(dx, dz);
  if (len < 1e-4) { e.moveDir.set(0, 0, 0); return; }
  e.moveDir.set((dx / len) * throttle, 0, (dz / len) * throttle);
  if (face) faceTowards(e, face.x, face.z, dt, 10); else faceTowards(e, x, z, dt, 9);
}

function faceTowards(e, x, z, dt, lambda) {
  const dx = x - e.pos.x, dz = z - e.pos.z;
  if (Math.hypot(dx, dz) < 1e-4) return;
  e.facing = dampAngle(e.facing, yawFromDir(dx, dz), lambda, dt);
}

function facingError(e, pos) {
  const want = yawFromDir(pos.x - e.pos.x, pos.z - e.pos.z);
  let d = (want - e.facing) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Ağaca takılan birim kısa süre yana kayar. */
function avoidStuck(e, dt) {
  const b = e.brain;
  const wants = e.moveDir.lengthSq() > 0.01;
  const speed = Math.hypot(e.vel.x, e.vel.z);
  if (wants && speed < e.stats.speed * 0.25 && e.attackTimer <= 0) b.stuck = (b.stuck || 0) + dt; else b.stuck = 0;
  if (b.stuck > 0.5) { b.stuck = 0; b.side = Math.random() < 0.5 ? 1 : -1; b.sideTimer = 0.7; }
  if (b.sideTimer > 0) {
    b.sideTimer -= dt;
    const mx = e.moveDir.x, mz = e.moveDir.z;
    e.moveDir.set(mx * 0.4 + mz * b.side, 0, mz * 0.4 - mx * b.side);
    if (e.moveDir.lengthSq() > 1) e.moveDir.normalize();
  }
}

/**
 * Tarafsız kamp askeri. İki roldedir:
 *  - **Muhafız** (raidSide yok): kampını bekler, CAMPS.aggro yarıçapına gireni döver, kamptan CAMPS.leash'ten
 *    fazla uzaklaşmaz; boştayken kampın çevresinde ağır ağır dolaşır.
 *  - **Akıncı** (raidSide 'blue' / 'red'): kamptan çıkar, o tarafın **kulelerine** yürür ve döver; kule kalmadıysa
 *    o tarafın öbür yapılarına gider. Yolda karşısına çıkan düşmanla dövüşür.
 */
function updateBeast(world, e, dt) {
  const b = e.brain, den = b.den || (b.den = { x: e.pos.x, z: e.pos.z });
  // b.timer vuruşlar arası beklemedir (engage kullanır); gezinme için ayrı bir sayaç var.
  b.timer -= dt; b.retarget -= dt;
  if (e.raidSide) { updateRaider(world, e, dt); return; }
  // Nöbet yarıçapı birime göre: kamp muhafızı geniş, araziye serpiştirilmiş haydut dar bir alanı korur.
  const guard = e.guard || { aggro: CAMPS.aggro, leash: CAMPS.leash };
  if (b.retarget <= 0) {
    b.retarget = 0.4; b.target = null;
    let bd = Infinity;
    for (const t of world.entities) {
      if (!t.alive || t.isBeast) continue;
      const d = distXZ(t.pos, den);
      if (d > guard.aggro) continue;
      const de = distXZ(t.pos, e.pos);
      if (de < bd) { bd = de; b.target = t; }
    }
  }
  const t = b.target && b.target.alive && distXZ(b.target.pos, den) <= guard.leash ? b.target : null;
  if (t) { e.aim.copy(t.pos); engage(world, e, t.pos, t.radius, dt); return; }
  // Haydut yerinden kıpırdamaz; kamp muhafızı kampın çevresinde ağır ağır dolaşır.
  const d = distXZ(e.pos, den);
  if (d > (e.isBandit ? 1.2 : guard.leash * 0.5)) { steerTo(e, den.x, den.z, dt, 0.6); avoidStuck(e, dt); return; }
  if (e.isBandit) { e.moveDir.set(0, 0, 0); return; }
  b.wanderTimer = (b.wanderTimer || 0) - dt;
  if (b.wanderTimer <= 0) { b.wanderTimer = 2 + Math.random() * 3; b.wander = { x: den.x + (Math.random() - 0.5) * 8, z: den.z + (Math.random() - 0.5) * 8 }; }
  if (b.wander && distXZ(e.pos, b.wander) > 1) steerTo(e, b.wander.x, b.wander.z, dt, 0.35);
  else e.moveDir.set(0, 0, 0);
}

/** Akıncı: hedef tarafın en yakın kulesine (yoksa öbür yapısına) yürür; yanına gelen düşmanı da döver. */
function updateRaider(world, e, dt) {
  const b = e.brain;
  if (b.retarget <= 0) {
    b.retarget = 0.5;
    // Yakındaki düşman birimi: mancınık dahil her akıncı yanına geleni döver.
    b.target = null;
    let bd = ARMY.aggro;
    for (const t of world.entities) {
      if (!t.alive || t.isBeast || t.faction !== e.raidSide) continue;
      const d = distXZ(t.pos, e.pos);
      if (d < bd) { bd = d; b.target = t; }
    }
    // Yapı hedefi: önce kuleler, sonra öbür yapılar, en son sancak.
    let tower = null, td = Infinity, other = null, od = Infinity, banner = null;
    for (const st of world.structures) {
      if (!st.alive || st.faction !== e.raidSide) continue;
      const d = distXZ(st.pos, e.pos);
      if (st.kind === 'tower') { if (d < td) { td = d; tower = st; } }
      else if (st.kind === 'banner') banner = st;
      else if (d < od) { od = d; other = st; }
    }
    b.structure = tower || other || banner;
  }
  const t = b.target && b.target.alive ? b.target : null;
  if (t) { e.aim.copy(t.pos); engage(world, e, t.pos, t.radius, dt); return; }
  const st = b.structure && b.structure.alive ? b.structure : null;
  if (st) { e.aim.copy(st.pos); engage(world, e, st.pos, st.radius, dt); return; }
  e.moveDir.set(0, 0, 0);
}

/**
 * Yeni işçi: aynı türdeki sahadaki işçiye yürür ve yanına varınca onunla birleşir; o işçinin kademesi (üretimi) artar.
 * Hedef işçi ölürse ya da kendisi de birleşmeye gidiyorsa yeni işçi sahada kalan ilk işçi olur.
 */
function updateMerging(world, e, dt) {
  const t = e.mergeTo;
  if (!t || !t.alive || t.merged || t === e) { e.mergeTo = null; return; }
  if (t.mergeTo) { e.mergeTo = t.mergeTo; return; }
  e.working = false; e.workTimer = 0;
  const d = distXZ(e.pos, t.pos);
  if (d > WORKER.mergeDist) { steerTo(e, t.pos.x, t.pos.z, dt, 1); avoidStuck(e, dt); return; }
  // Birleş: kademe aktarılır, yeni işçi sahneden kalkar (ölüm değil).
  t.tier = (t.tier || 1) + (e.tier || 1);
  e.merged = true; e.mergeTo = null; e.moveDir.set(0, 0, 0);
  world.onWorkerMerged(t, e);
}

/**
 * Toplayıcı (rakip kahraman ve işçiler): hiç saldırmaz. Kendi üssünde boş bir çalışma
 * yerine gider, orada çalışır; fırlayan ürünü alır ve hemen yeniden çalışır (taşıma yok).
 * Düşman yaklaşınca işi bırakıp uzaklaşır.
 */
function updateGatherer(world, e, dt) {
  const own = bannerOf(world, e.faction);
  const w = e.work || (e.work = { spot: null, item: null });
  const release = () => { w.spot = null; e.working = false; e.workTimer = 0; };

  // Rakip kahraman savaşır: görüşündeki en yakın düşman askerine saldırır (alan vuruşu, asker hasarı);
  // canı azalınca aşağıdaki kaçış mantığına döner.
  if (e.isHero && e.hp > e.stats.maxHp * ENEMY_HERO.fightHpRatio) {
    let foe = null, fd = e.vision || VISION.hero;
    for (const t of world.entities) {
      if (!t.alive || t.faction === e.faction || t.isWorker) continue;
      const d = distXZ(e.pos, t.pos);
      if (d < fd) { fd = d; foe = t; }
    }
    if (foe) {
      release(); e.sprinting = false; e.brain.timer -= dt;
      e.aim.copy(foe.pos); engage(world, e, foe.pos, foe.radius, dt);
      return;
    }
  }

  const fleeR = e.isWorker ? WORKER.fleeRadius : ENEMY_HERO.fleeRadius;
  let threat = null, td = fleeR;
  for (const t of world.entities) {
    if (!t.alive || t.faction === e.faction) continue;
    const d = distXZ(e.pos, t.pos);
    if (d < td) { td = d; threat = t; }
  }
  if (threat) {
    release();
    const ax = e.pos.x - threat.pos.x, az = e.pos.z - threat.pos.z, al = Math.hypot(ax, az) || 1;
    const hx = own.pos.x - e.pos.x, hz = own.pos.z - e.pos.z, hl = Math.hypot(hx, hz) || 1;
    steerTo(e, e.pos.x + ax / al * 4 + hx / hl * 2, e.pos.z + az / al * 4 + hz / hl * 2, dt, 1);
    e.sprinting = e.isHero; avoidStuck(e, dt);
    // Keşifteyken kovalanan kahraman keşfi bırakır (gördüğü zaten kaydedildi).
    if (e.isHero && e.scout && e.scout.target) { e.scout.target = null; e.scout.timer = ENEMY_AI.scoutEvery; }
    return;
  }
  e.sprinting = false;

  // İnşa görevi: bina yalnızca kahramanın yakınına dikilir; rakip kahraman yerine gider ve inşa kararını bekler.
  if (e.isHero && e.errand) {
    const er = e.errand; er.ttl -= dt;
    if (er.ttl <= 0) e.errand = null;
    else {
      release(); e.working = false;
      if (distXZ(e.pos, er) > BUILD.heroRadius * 0.5) { e.sprinting = true; steerTo(e, er.x, er.z, dt, 1); avoidStuck(e, dt); }
      else e.moveDir.set(0, 0, 0);
      return;
    }
  }

  // Rakip kahraman aralıklarla keşfe çıkar: mavi kule yerleri ve üs binalarını gezip gördüğünü rakibe bildirir.
  if (e.isHero) {
    const sc = e.scout || (e.scout = { timer: ENEMY_AI.scoutFirst, target: null, ttl: 0, visited: new Set() });
    if (!sc.target) {
      sc.timer -= dt;
      if (sc.timer <= 0) {
        const pts = scoutPoints(world);
        if (sc.visited.size >= pts.length) sc.visited.clear();
        let best = null, bd = Infinity;
        pts.forEach((p, i) => { if (sc.visited.has(i)) return; const d = distXZ(e.pos, p); if (d < bd) { bd = d; best = i; } });
        if (best !== null) { sc.target = pts[best]; sc.index = best; sc.ttl = ENEMY_AI.scoutTime; release(); }
        else sc.timer = ENEMY_AI.scoutEvery;
      }
    }
    if (sc.target) {
      sc.ttl -= dt;
      const d = distXZ(e.pos, sc.target);
      if (d < 5 || sc.ttl <= 0) { sc.visited.add(sc.index); sc.target = null; sc.timer = ENEMY_AI.scoutEvery; }
      else { e.working = false; e.sprinting = true; steerTo(e, sc.target.x, sc.target.z, dt, 1); avoidStuck(e, dt); return; }
    }
  }

  if (w.item && (w.item.taken || (w.item.claimedBy && w.item.claimedBy !== e))) w.item = null;
  if (!w.item) {
    const loose = pickItem(world, e);
    if (loose) { w.item = loose; loose.claimedBy = e; }
  }
  if (w.item) {
    e.working = false;
    if (!w.item.fly) steerTo(e, w.item.pos.x, w.item.pos.z, dt, 1); else e.moveDir.set(0, 0, 0);
    avoidStuck(e, dt); return;
  }

  if (!w.spot) w.spot = pickSpot(world, e);
  if (!w.spot) {
    if (distXZ(e.pos, own.pos) > 6) steerTo(e, own.pos.x, own.pos.z, dt, 0.6); else e.moveDir.set(0, 0, 0);
    e.working = false; avoidStuck(e, dt); return;
  }
  const d = distXZ(e.pos, w.spot.pos);
  if (d > 0.8) { e.working = false; steerTo(e, w.spot.pos.x, w.spot.pos.z, dt, 1); avoidStuck(e, dt); return; }
  e.moveDir.set(0, 0, 0);
  e.working = true; e.workTimer += dt;
  if (e.workTimer >= ECONOMY.work.time) {
    e.workTimer = 0;
    // Kahraman seviyesine göre, işçi kademesine göre bir çalışmada birden çok ürün çıkar; ilkini kendine ayırır.
    const n = e.isWorker ? (e.tier || 1) : heroGather(e);
    for (let i = 1; i < n; i++) produceItem(world, w.spot);
    w.item = produceItem(world, w.spot, e);
  }
}

/** Çalışma yeri: kilit yok, sınır yok. Kalabalık yerler uzak sayılır ki işçiler dağılsın; rakip kahraman altını tercih eder. */
function pickSpot(world, e) {
  const load = new Map();
  for (const o of world.entities) if (o !== e && o.alive && o.work && o.work.spot) load.set(o.work.spot, (load.get(o.work.spot) || 0) + 1);
  let best = null, bd = Infinity;
  for (const s of world.spots) {
    if (s.base !== e.faction) continue;
    if (e.workerKind ? s.kind !== e.workerKind : false) continue;
    const d = distXZ(e.pos, s.pos) + (load.get(s) || 0) * 4 + (!e.workerKind && s.kind !== 'gold' ? 6 : 0);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function pickItem(world, e) {
  let best = null, bd = 8;
  for (const it of world.items) {
    if (it.taken) continue;
    // İşçi kendi üssünün ürününü alır; kahraman ganimeti (base=null) de toplar.
    if (!(it.base === e.faction || (e.isHero && it.base === null))) continue;
    if (e.workerKind && it.kind !== e.workerKind) continue;
    if (it.claimedBy && it.claimedBy !== e && it.claimedBy.alive) continue;
    const d = distXZ(e.pos, it.pos);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
