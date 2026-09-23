import { dampAngle, distXZ, yawFromDir } from './builders.js';
import { canAttack, heroReach, startAttack, nearestEnemyTower } from './combat.js';
import { ARMY, BUILD, CAMPS, ECONOMY, ENEMY, ENEMY_AI, ENEMY_HERO, POSITIONS, RALLY, TOWER, VISION, WORKER } from './config.js';
import { produceItem, heroGather } from './economy.js';
import { rrand } from './rng.js';
import { bannerShielded } from './structures.js';
import { botSoldier, nearestEnemyBanner, nearestEnemyPlayer } from './players.js';

/**
 * Asker beyni.
 * Komutan modunda mavi askerler kafasına göre hareket etmez: durduğu yeri tutar, yalnızca yakına gelen
 * düşmanla dövüşür ve emirle hareket eder. Kahraman modunda ise görünen tüm düşmanlara kendiliğinden saldırır.
 * Emirler: move (yürü; yolda düşman görürse durup dövüşür), attackmove (yürü, yolda çıkanla dövüş),
 * attack (hedefi kovala; birim ya da yapı), stop.
 * **Senin askerin** emir almaz (updateAggressive): görüşüne (e.vision) giren her düşman birimi, kahramanı, binası ve kulesiyle
 * savaşır; hiçbir şey görmüyorsa orta tıkla verilen saldırı hedefine (brain.focus), o da yoksa toplanma bayrağına yürür. **Bot askeri** emirle yürür: yolda ARMY.sight yarıçapında düşman
 * görürse durup saldırır, kendisine vuran olursa (uzaktan bile) ona döner; dövüşe başladığı noktadan ARMY.chase kadar
 * uzaklaşınca hedefi bırakıp yoluna devam eder.
 * **Takım oyunu**: düşmanlık takıma (faction), komuta sahibe (owner) bağlıdır. Senin askerlerin toplanma alanınla yönetilir;
 * **bot** askerleri (iki takımda da) sahiplerinin toplanma noktasında birikir, sahipleri saldırı kararı verince
 * kendiliğinden ilerler (kule -> sancak) ve rakip kule menziline girmez.
 * Botun kulesi / sancağı vurulunca savunma emri saldırıyı bile keser (bkz. economy.js updateBots).
 * Komutan modunda kahraman da bir asker gibi yönetilir.
 * Bot kahramanları ve işçiler toplayıcı beynini kullanır: savunma > inşa > **haydut avı** > keşif > toplama sırasıyla.
 */
export function updateUnit(world, e, dt) {
  const b = e.brain;
  if (!b || !e.alive) return;
  if (e.isPlayer && world.mode !== 'aoe') return;
  if (e.stun > 0) { e.moveDir.set(0, 0, 0); return; }
  if (e.isBeast) { updateBeast(world, e, dt); return; }
  if (e.isWorker && e.mergeTo) { updateMerging(world, e, dt); return; }
  if (e.isHero || e.isWorker) { updateGatherer(world, e, dt); return; }
  // Bot ordusu yalnızca sahibi saldırı kararı verince ilerler; aksi hâlde toplanma noktasında birikir (aşağıdaki bekleme mantığı).
  // Savunma emri saldırı düzenini keser: kulesi vurulan botun askeri geri döner (bkz. economy.js updateBots).
  if (botSoldier(e) && e.owner.ai.attacking && !(b.order && b.order.defend)) { updateAutonomous(world, e, dt); return; }

  b.timer -= dt; b.retarget -= dt;
  const home = b.home || (b.home = { x: e.pos.x, z: e.pos.z });
  const o = b.order;
  // Senin ordun iki modda da kendiliğinden dövüşür; tek tek yönetilmez, yalnızca toplanma alanıyla yönlendirilir.
  if (e.owner && e.owner.human && !o && !e.isPlayer) { updateAggressive(world, e, dt); return; }

  if (o && o.kind === 'attack') {
    const t = o.target;
    if (!t || !t.alive) { b.order = null; b.home = { x: e.pos.x, z: e.pos.z }; b.target = null; return; }
    e.aim.copy(t.pos); engage(world, e, t.pos, t.radius, dt); return;
  }
  if (o && o.kind === 'move') {
    // Yolda düşman gören ya da vurulan asker durup dövüşür; hedef düşünce yürüyüşe kaldığı yerden devam eder.
    const foe = enrouteTarget(world, e);
    if (foe) { e.aim.copy(foe.pos); engage(world, e, foe.pos, foe.radius, dt); return; }
    const d = distXZ(e.pos, o);
    if (d > ARMY.arrive) { steerTo(e, o.x, o.z, dt, 1); avoidStuck(e, dt); }
    else { b.order = null; b.home = { x: o.x, z: o.z }; e.moveDir.set(0, 0, 0); }
    return;
  }
  // attackmove ya da bekleme: yakındaki düşmanla dövüş; yoksa hedefe / eve yürü.
  const anchor = o ? o : home;
  if (b.retarget <= 0) {
    b.retarget = 0.3;
    const hit = retaliator(world, e);
    b.target = hit || findTarget(world, e, anchor);
    b.fightAt = hit ? { x: e.pos.x, z: e.pos.z } : null;
  }
  const target = b.target && b.target.alive && (!b.fightAt || withinChase(e, b.target)) ? b.target : null;
  if (target) { e.aim.copy(target.pos); engage(world, e, target.pos, target.radius, dt); return; }
  // Mancınık: dövüşecek birim yoksa menzilindeki bilinen kuleyi yerinden döver.
  if (e.isSiege) { const tw = nearestEnemyTower(world, e, e.stats.weapon.range + 2); if (tw) { e.aim.copy(tw.pos); engage(world, e, tw.pos, tw.radius, dt); return; } }
  const d = distXZ(e.pos, anchor);
  if (d > ARMY.arrive) { steerTo(e, anchor.x, anchor.z, dt, 1); avoidStuck(e, dt); }
  else { e.moveDir.set(0, 0, 0); if (o) { b.order = null; b.home = { x: o.x, z: o.z }; } }
}

/** Askerin bağlı olduğu nokta: senin ordunun toplanma bayrağı, yoksa doğduğu / son durduğu yer. */
const rallyAnchor = (world, e) => (e.owner && e.owner.rally) || e.brain.home;

/**
 * Senin askerin: **görüşü savaşa girme mesafesidir**. Görüşüne (e.vision: asker 10, mancınık 36) giren her düşmanla savaşır:
 * önce kendisine vuran, sonra en yakın düşman birimi (asker, kahraman, işçi, haydut), birim yoksa görüşündeki rakip yapı
 * (kule > bina > sancak). Hedefi görüşünün ARMY.holdMult katına kadar kovalar; daha uzağa kaçarsa bırakır. Görüşünde
 * dövüşecek bir şey yoksa orta tıkla verilen **saldırı hedefine** (brain.focus) yürüyüp onu döver, o da yoksa toplanma
 * bayrağına (yoksa durduğu yere) gider. Yürümek savaşı hiçbir zaman bölmez.
 */
function updateAggressive(world, e, dt) {
  const b = e.brain;
  const anchor = rallyAnchor(world, e) || (b.home = { x: e.pos.x, z: e.pos.z });
  const V = e.vision || VISION.soldier;
  if (b.retarget <= 0) {
    b.retarget = 0.3;
    // Eldeki hedef tutma mesafesindeyse (görüşün holdMult katı) bırakılmaz; yoksa görüşteki en yakın düşman birimi seçilir.
    const cur = b.target && b.target.alive && distXZ(e.pos, b.target.pos) <= V * ARMY.holdMult + b.target.radius ? b.target : null;
    let best = retaliator(world, e) || cur, bd = Infinity;
    if (!best) for (const t of world.entities) {
      if (!t.alive || t.faction === e.faction) continue;
      const d = distXZ(e.pos, t.pos);
      if (d > V + t.radius || d >= bd) continue;
      bd = d; best = t;
    }
    b.target = best;
    // Birim yoksa görüşündeki rakip yapı (kule, bina, sancak); her adımda değil hedef aramayla birlikte seçilir.
    b.structTarget = best ? null : nearestStructure(world, e, e.pos, V);
  }
  const target = b.target && b.target.alive && distXZ(e.pos, b.target.pos) <= V * ARMY.holdMult + b.target.radius ? b.target : null;
  if (target) { e.aim.copy(target.pos); engage(world, e, target.pos, target.radius, dt); return; }
  const s = b.structTarget && b.structTarget.alive ? b.structTarget : null;
  if (s) { e.aim.copy(s.pos); engage(world, e, s.pos, s.radius, dt); return; }
  // Orta tıkla verilen saldırı hedefi (birim ya da yapı): görüşünde dövüşecek bir şey kalmayınca hedefe yürünür ve dövülür.
  // Hedef düşünce silinir; asker bayrağa (hedefin yerine dikilmiştir) döner.
  const focus = b.focus && b.focus.alive ? b.focus : (b.focus = null);
  if (focus) { e.aim.copy(focus.pos); engage(world, e, focus.pos, focus.radius, dt); return; }
  if (distXZ(e.pos, anchor) > ARMY.arrive) { steerTo(e, anchor.x, anchor.z, dt, 1); avoidStuck(e, dt); } else e.moveDir.set(0, 0, 0);
}

/**
 * Orta tıkla hedef seçimi: (x, z) noktasının altındaki **düşman** — ekranda görünen bir birim / kahraman ya da
 * **görülmüş** bir rakip yapı (kule, bina, sancak, haydut kampı). Kenar uzaklığı pad payı içindekilerin en yakını
 * seçilir; sisin altındaki hedef seçilemez. Hiçbiri yoksa null döner, nokta toplanma alanı olur (bkz. main.js setRallyPoint).
 */
export function pickHostile(world, x, z, pad = RALLY.pickRadius) {
  let best = null, bd = pad;
  for (const t of world.entities) {
    if (!t.alive || t.faction === 'blue' || !(t.view && t.view.g.visible)) continue;
    const d = distXZ(t.pos, { x, z }) - t.radius;
    if (d < bd) { bd = d; best = t; }
  }
  for (const st of world.structures) {
    if (!st.alive || st.faction === 'blue' || !st.seen) continue;
    const d = distXZ(st.pos, { x, z }) - st.radius;
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}

/** Bu nokta ayakta bir **rakip** kulenin menzilinde (pay dahil) mi? Bot askerleri oraya girmez. */
export function inEnemyTowerRange(world, faction, pos, margin = ENEMY_AI.towerMargin) {
  const r = TOWER.range + margin, r2 = r * r;
  for (const s of enemyTowers(world, faction)) {
    const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}
/** Takım için ayakta rakip kuleler; aynı simülasyon adımında (world.time) bir kez çıkarılır (yüzlerce asker sorar). */
const towerCache = { world: null, time: -1, lists: null };
function enemyTowers(world, faction) {
  if (towerCache.world !== world || towerCache.time !== world.time) {
    towerCache.world = world; towerCache.time = world.time;
    const lists = { blue: [], red: [], beast: [] };
    for (const s of world.structures) {
      if (!s.alive || s.kind !== 'tower') continue;
      for (const f in lists) if (f !== s.faction) lists[f].push(s);
    }
    towerCache.lists = lists;
  }
  return towerCache.lists[faction] || towerCache.lists.beast;
}

/**
 * Bot askeri (saldırıda): yakındaki düşmanı kovala (kule menziline girmeden) -> mancınık varsa onun yanında ilerle ve
 * koru -> bilinen kule dışı yapıya yürü -> hiçbiri yoksa keşfet. Kulelere asla vurmaz; kuleleri mancınık döver.
 */
function updateAutonomous(world, e, dt) {
  const b = e.brain;
  b.timer -= dt; b.retarget -= dt;
  if (b.retarget <= 0) {
    b.retarget = 0.3; b.target = retaliator(world, e) || findTarget(world, e, null);
    // Boşta planı (eşlik edilecek mancınık, bilinen yapı, keşif noktası) her adımda değil burada, hedef aramayla birlikte
    // seçilir: yüzlerce bot askerinin her adımda bütün birim ve yapıları taraması 5v5'i tıkıyordu.
    b.escort = null; b.structTarget = null; b.march = null;
    if (!b.target) {
      if (!e.isSiege) {
        // Mancınığa eşlik: ordunun en yakın mancınığının yanında dur.
        let cat = null, cd = Infinity;
        for (const o of world.entities) { if (!o.alive || o.faction !== e.faction || !o.isSiege) continue; const d = distXZ(e.pos, o.pos); if (d < cd) { cd = d; cat = o; } }
        b.escort = cat;
      }
      // Yalnızca görülmüş (bilinen) rakip yapılara saldırır; asker kuleye vurmaz ve kule menziline girmez.
      if (!b.escort) { b.structTarget = nearestStructure(world, e); if (!b.structTarget) b.march = nextMarchPoint(world, e); }
    }
  }
  const target = b.target && b.target.alive ? b.target : null;
  if (target) { e.aim.copy(target.pos); engage(world, e, target.pos, target.radius, dt); return; }
  const cat = b.escort && b.escort.alive ? b.escort : null;
  if (cat) {
    if (distXZ(e.pos, cat.pos) > ENEMY_AI.escortDist) { steerTo(e, cat.pos.x, cat.pos.z, dt, 1); avoidStuck(e, dt); } else e.moveDir.set(0, 0, 0);
    return;
  }
  const s = b.structTarget && b.structTarget.alive ? b.structTarget : null;
  if (s) { e.aim.copy(s.pos); engage(world, e, s.pos, s.radius, dt); return; }
  // Bilinen hedef yok: rakip kule yerlerine, sonra en yakın rakip sancağa doğru yürüyerek keşfet (kule menzilinin dışında kalır).
  const p = b.march;
  if (!p || (!e.isSiege && inEnemyTowerRange(world, e.faction, e.pos, ENEMY_AI.towerMargin - 1))) { e.moveDir.set(0, 0, 0); return; }
  steerTo(e, p.x, p.z, dt, 1); avoidStuck(e, dt);
}

/** Bot ordusunun keşif rotası: henüz yakınına varılmayan en yakın rakip kule yeri, hepsi gezildiyse en yakın rakip sancak. */
function nextMarchPoint(world, e) {
  let best = null, bd = Infinity;
  // Mancınık kule yerine menzilinin %90'ına kadar yaklaşır; asker kule menzilinin dışında (pay) durur.
  const stop = e.isSiege ? e.stats.weapon.range * 0.9 : TOWER.range + ENEMY_AI.towerMargin;
  for (const t of world.towerSpots) {
    if (t.faction === e.faction) continue;
    const d = distXZ(e.pos, t);
    if (d < stop) continue;
    if (d < bd) { bd = d; best = t; }
  }
  const banner = nearestEnemyBanner(world, e.faction, e.pos);
  if (!best || (banner && distXZ(e.pos, banner.pos) < bd * 0.7)) return banner && distXZ(e.pos, banner.pos) > 6 ? banner.pos : best;
  return best;
}

/** Bot kahramanının keşif noktaları: rakip takımın kule yerleri, en yakın rakip oyuncunun üs binaları ve sancağı. */
function scoutPoints(world, e) {
  const foe = nearestEnemyPlayer(world, e.faction, e.pos);
  const pts = world.towerSpots.filter(t => t.faction !== e.faction).map(t => ({ x: t.x, z: t.z }));
  if (foe) {
    const base = foe.base;
    for (const k of ['barracks', 'archery', 'stable', 'farm', 'mine']) pts.push(base.at(POSITIONS.base[k]));
    pts.push({ x: base.pos.x, z: base.pos.z });
  }
  return pts;
}

/**
 * Bot kahramanının av hedefi: önce ENEMY_AI.hunt.radius içindeki en yakın haydut / kamp muhafızı (mancınık hariç),
 * yakında haydut kalmadıysa campRadius içindeki ayakta duran haydut kampı. Kamp yıkılınca yıkıntısı hedef olmaz.
 */
function pickHunt(world, e) {
  const H = ENEMY_AI.hunt;
  let best = null, bd = H.radius;
  for (const t of world.entities) {
    if (!t.alive || !t.isBeast || t.isSiege) continue;
    const d = distXZ(e.pos, t.pos);
    if (d < bd) { bd = d; best = t; }
  }
  if (best) return best;
  let camp = null, cd = H.campRadius;
  for (const s of world.structures) {
    if (!s.alive || s.kind !== 'camp') continue;
    const d = distXZ(e.pos, s.pos);
    if (d < cd) { cd = d; camp = s; }
  }
  return camp;
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

/**
 * Yapı o taraf için bilinir mi? Mavi sisle görür (seen), kırmızı gördüğünü hatırlar (seenByRed). Mavi asker kendi
 * görüşündeki yapıyı hemen bilir (ve haritada açar): sis dokusunun bir sonraki güncellemesini beklemez.
 */
const knownTo = (e, st, d = Infinity) => {
  if (e.faction !== 'blue') return st.seenByRed;
  if (st.seen) return true;
  if (d > (e.vision || VISION.soldier) + st.radius) return false;
  st.seen = true;
  return true;
};

/**
 * Hedef yapı önceliği: önce **kuleler**, sonra diğer **binalar**, en son **sancak** (yalnızca o tarafın kulesi
 * kalmayınca, bkz. bannerShielded). anchor verilirse yalnızca o noktanın radius (+ yapı yarıçapı) içindeki yapılar sayılır.
 * Mancınık her yapıya vurabilir (kuleyi yeğler); bot askeri kuleye hiç gitmez ve rakip kule menzilindeki yapıyı hedeflemez.
 */
function nearestStructure(world, e, anchor = null, radius = Infinity) {
  let tower = null, td = Infinity, other = null, od = Infinity, banner = null, bnd = Infinity;
  const bot = botSoldier(e) && !e.isSiege;
  for (const st of world.structures) {
    if (!st.alive || st.faction === e.faction) continue;
    if (bot && st.kind === 'tower') continue;
    if (anchor && distXZ(st.pos, anchor) > radius + st.radius) continue;
    const d = distXZ(e.pos, st.pos);
    if (!knownTo(e, st, d)) continue;
    // Önce uzaklık: yalnızca kendi türünün en yakını olabilecek aday (pahalı) rakip kule menzili denetiminden geçer.
    if (st.kind === 'tower') { if (d >= td) continue; }
    else if (st.kind === 'banner') { if (d >= bnd) continue; }
    else if (d >= od) continue;
    if (bot && inEnemyTowerRange(world, e.faction, st.pos)) continue;
    if (st.kind === 'tower') { td = d; tower = st; }
    else if (st.kind === 'banner') { bnd = d; banner = st; }
    else { od = d; other = st; }
  }
  // Kule kalmadıysa ve sancak görüş mesafesindeyse asker başka binaya gitmez, sancağı dövmeye devam eder.
  // Kalkanlı sancak (kulesi ayakta) can kaybetmediği için öne geçmez; yalnızca başka hedef yoksa dövülür (kuleleri ele verir).
  const bannerSeen = banner && !bannerShielded(world, banner) && bnd <= (e.vision || VISION.soldier) + banner.radius;
  return tower || (bannerSeen ? banner : null) || other || banner;
}

/**
 * Kendisine son vuran düşman: ARMY.retaliate saniye hatırlanır, ARMY.retaliateRange içindeyse hedef olur.
 * Uzaktan vuran okçu / mancınık da böylece karşılık görür. Bot askeri rakip kule menzilindekinin peşine düşmez.
 */
function retaliator(world, e) {
  const t = e.lastHitBy;
  if (!t || !t.alive || t.faction === e.faction) return null;
  if (world.time - (e.lastHitAt || -99) > ARMY.retaliate) return null;
  if (distXZ(e.pos, t.pos) > ARMY.retaliateRange) return null;
  if (botSoldier(e) && inEnemyTowerRange(world, e.faction, t.pos)) return null;
  return t;
}

/** Dövüşe başlanan noktadan ARMY.chase kadar uzaklaşılınca hedef bırakılır (peşinden haritada sürüklenme yok). */
function withinChase(e, t) {
  const f = e.brain.fightAt;
  if (f && distXZ(e.pos, f) > ARMY.chase) return false;
  return distXZ(e.pos, t.pos) <= ARMY.chase + 6;
}

/**
 * Yürüyüşteki askerin hedefi: önce kendisine vuran (karşılık), sonra ARMY.sight yarıçapında görülen en yakın düşman.
 * Hedefe kilitlenince dövüşe başlanan nokta hatırlanır ve kovalama oradan ARMY.chase ile sınırlanır.
 */
function enrouteTarget(world, e) {
  const b = e.brain;
  if (b.target && !(b.target.alive && b.target.faction !== e.faction && withinChase(e, b.target))) { b.target = null; b.fightAt = null; }
  if (!b.target && b.retarget <= 0) {
    b.retarget = 0.3;
    let best = retaliator(world, e), bd = ARMY.sight;
    if (!best) for (const t of world.entities) {
      if (!t.alive || t.faction === e.faction || t.isWorker) continue;
      const d = distXZ(e.pos, t.pos);
      if (d >= bd) continue;
      if (e.faction === 'blue' && !world.fog.isVisible(t.pos.x, t.pos.z)) continue;
      if (botSoldier(e) && inEnemyTowerRange(world, e.faction, t.pos)) continue;
      bd = d; best = t;
    }
    if (best) { b.target = best; b.fightAt = { x: e.pos.x, z: e.pos.z }; }
  }
  return b.target;
}

function findTarget(world, e, anchor) {
  const aggro = e.owner && e.owner.human ? ARMY.aggro : ENEMY.aggro;
  const own = e.owner ? e.owner.banner : null;
  let best = null, bestScore = Infinity;
  const bot = botSoldier(e);
  for (const t of world.entities) {
    if (!t.alive || t.faction === e.faction || (e.isPlayer && t.isWorker)) continue;
    const d = distXZ(e.pos, t.pos);
    if (anchor) {
      // Bekleyen / emirli asker: yalnızca kendi menzilindeki ve durduğu noktaya yakın düşmanlar.
      if (d > aggro || d >= bestScore || distXZ(t.pos, anchor) > ARMY.leash) continue;
      // Bot askeri rakip kule menzilindeki düşmanı kovalamaz (pahalı denetim: yalnızca en yakın adaylar için).
      if (bot && inEnemyTowerRange(world, e.faction, t.pos)) continue;
      bestScore = d; best = t;
      continue;
    }
    // Kendi sancağına yaklaşan düşman, uzakta olsa da öncelikli.
    const threat = own && own.alive && distXZ(t.pos, own.pos) < 14;
    if (d > aggro && !threat) continue;
    const score = threat ? d * 0.5 : d;
    if (score >= bestScore) continue;
    if (bot && inEnemyTowerRange(world, e.faction, t.pos)) continue;
    bestScore = score; best = t;
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
 * Toplayıcı (bot kahramanları ve işçiler): hiç saldırmaz. Kendi üssünde boş bir çalışma
 * yerine gider, orada çalışır; fırlayan ürünü alır ve hemen yeniden çalışır (taşıma yok).
 * Düşman yaklaşınca işi bırakıp uzaklaşır.
 */
function updateGatherer(world, e, dt) {
  const own = e.owner.banner;
  const w = e.work || (e.work = { spot: null, item: null });
  const release = () => { w.spot = null; e.working = false; e.workTimer = 0; };

  // Düşman taraması her adımda değil 0.1 sn'de bir: en yakın savaşçı (kahramanın dövüşü) ve en yakın herhangi düşman (kaçış)
  // tek geçişte bulunur; aradaki adımlarda aynı adayın güncel uzaklığına bakılır.
  e.scanTimer = (e.scanTimer || 0) - dt;
  if (e.scanTimer <= 0) {
    e.scanTimer = 0.1;
    let foe = null, fd = Infinity, any = null, ad = Infinity;
    for (const t of world.entities) {
      if (!t.alive || t.faction === e.faction) continue;
      const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < ad) { ad = d2; any = t; }
      if (!t.isWorker && d2 < fd) { fd = d2; foe = t; }
    }
    e.scan = { foe, any };
  }
  const scan = e.scan;

  // Bot kahramanı savaşır: görüşündeki en yakın düşman askerine saldırır (alan vuruşu, asker hasarı);
  // canı azalınca aşağıdaki kaçış mantığına döner.
  if (e.isHero && e.hp > e.stats.maxHp * ENEMY_HERO.fightHpRatio) {
    const foe = scan.foe && scan.foe.alive && distXZ(e.pos, scan.foe.pos) < (e.vision || VISION.hero) ? scan.foe : null;
    if (foe) {
      release(); e.sprinting = false; e.brain.timer -= dt;
      e.aim.copy(foe.pos); engage(world, e, foe.pos, foe.radius, dt);
      return;
    }
  }

  const fleeR = e.isWorker ? WORKER.fleeRadius : ENEMY_HERO.fleeRadius;
  const threat = scan.any && scan.any.alive && distXZ(e.pos, scan.any.pos) < fleeR ? scan.any : null;
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

  // Kule savunması: bot kahramanı vurulan kulesine / sancağına koşar ve orada bekler; yakındaki düşmanla
  // dövüşmeyi yukarıdaki dövüş mantığı üstlenir. Savunma hatırası bitince (ENEMY_AI.defend.memory) işine döner.
  const def = e.isHero && !e.isPlayer && e.owner.ai ? e.owner.ai.defend : null;
  if (def && e.hp > e.stats.maxHp * ENEMY_HERO.fightHpRatio) {
    release(); e.working = false;
    if (e.scout) e.scout.target = null;
    if (e.hunt) e.hunt.target = null;
    if (distXZ(e.pos, def) > ENEMY_AI.defend.heroHold) { e.sprinting = true; steerTo(e, def.x, def.z, dt, 1); avoidStuck(e, dt); }
    else e.moveDir.set(0, 0, 0);
    return;
  }

  // İnşa görevi: bina yalnızca kahramanın yakınına dikilir; bot kahramanı yerine gider ve inşa kararını bekler.
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

  // Haydut avı: bot kahramanı çevrede dolaşıp haydutları avlar; yakında haydut kalmayınca kampı yıkmaya gider.
  if (e.isHero && !e.isPlayer && e.hp > e.stats.maxHp * ENEMY_HERO.fightHpRatio) {
    const H = ENEMY_AI.hunt, h = e.hunt || (e.hunt = { timer: H.first, target: null, ttl: 0 });
    if (h.target && !h.target.alive) { h.target = null; h.timer = H.every; }
    if (!h.target) {
      h.timer -= dt;
      // Kampı yıkmak uzun sürer: yapı hedefine (kind) daha uzun süre verilir.
      if (h.timer <= 0) { h.target = pickHunt(world, e); h.ttl = h.target && h.target.kind ? H.campTtl : H.ttl; if (!h.target) h.timer = H.every; }
    }
    if (h.target) {
      h.ttl -= dt;
      if (h.ttl <= 0) { h.target = null; h.timer = H.every; }
      else {
        release(); e.working = false; e.sprinting = distXZ(e.pos, h.target.pos) > 8;
        e.brain.timer -= dt; e.aim.copy(h.target.pos);
        engage(world, e, h.target.pos, h.target.radius, dt);
        return;
      }
    }
  }

  // Bot kahramanı aralıklarla keşfe çıkar: rakip kule yerleri ve üs binalarını gezip gördüğünü takımına bildirir.
  if (e.isHero) {
    const sc = e.scout || (e.scout = { timer: ENEMY_AI.scoutFirst, target: null, ttl: 0, visited: new Set() });
    if (!sc.target) {
      sc.timer -= dt;
      if (sc.timer <= 0) {
        const pts = scoutPoints(world, e);
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

/** Çalışma yeri (yalnızca sahibinin üssünde): kilit yok, sınır yok. Kalabalık yerler uzak sayılır ki işçiler dağılsın; bot kahramanı altını tercih eder. */
function pickSpot(world, e) {
  const load = new Map();
  for (const o of world.entities) if (o !== e && o.alive && o.work && o.work.spot) load.set(o.work.spot, (load.get(o.work.spot) || 0) + 1);
  let best = null, bd = Infinity;
  for (const s of world.spots) {
    if (s.owner !== e.owner) continue;
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
    // İşçi sahibinin ürününü alır; kahraman ganimeti (owner=null) de toplar.
    if (!(it.owner === e.owner || (e.isHero && it.owner === null))) continue;
    if (e.workerKind && it.kind !== e.workerKind) continue;
    if (it.claimedBy && it.claimedBy !== e && it.claimedBy.alive) continue;
    const d = distXZ(e.pos, it.pos);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
