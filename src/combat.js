import * as T from '/vendor/three.module.js';
import { ballGeo, box, mat, mesh } from './builders.js';
import { ANTI, BLOCK, COMBAT, HERO_KNOCKBACK, HOMING_TURN, KNOCKBACK_SCALE, LEVEL, SHIELD, SPIN, TORNADO, TOWER, loadoutKey } from './config.js';
import { heroVolley } from './abilities.js';
import { dashMult, isEvading, levelReachMult, reachOf, chargeMult } from './characters.js';
import { applyImpulse } from './physics.js';
import { rrand } from './rng.js';
import { bannerShielded } from './structures.js';

export function canAttack(e) {
  return e.alive && e.cooldown <= 0 && e.attackTimer <= 0 && e.stun <= 0 && !e.blocking && e.dodgeTimer <= 0;
}

export function startAttack(e) {
  if (!canAttack(e)) return false;
  const w = e.stats.weapon;
  e.attackTimer = w.duration; e.cooldown = w.cooldown; e.didHit = false;
  return true;
}

/** Hasar çarpanı: kahraman seviyesi. */
/** Kahramanın (oyuncu ve rakip kahraman) yakın dövüş menzili / yayı seviyeyle büyür (yay silahı hariç). */
export function reachMult(e) {
  if (!isHeroUnit(e) || e.stats.weapon.ranged) return 1;
  return levelReachMult(e);
}
export const heroReach = e => reachOf(e);

/** Bir vuruşun hedefe hasarı: üstünlük çarpanı; kule oku ölümcül (TOWER.lethalVsSoldiers, kahramana lethalVsHeroes ise). */
export function hitDamage(attacker, target, base) {
  const w = attacker && attacker.stats && attacker.stats.weapon;
  let d;
  if (isAnti(attacker, target)) {
    // Anti vuruş: askerde canının ANTI.soldierMult katı, kahramanda sabit ANTI.heroDamage (vuran kahramansa seviye çarpanıyla).
    // Vuruşun türü (normal 1, dönerek vuruş 0.5, hortum 0.6) anti hasarı da aynı oranda ölçekler.
    const normal = (w ? w.damage : 0) * damageMult(attacker);
    const ratio = normal > 0 ? Math.min(1, base / normal) : 1;
    d = (isHeroUnit(target) ? ANTI.heroDamage * damageMult(attacker) : target.stats.maxHp * ANTI.soldierMult) * ratio;
  } else d = base * matchup(attacker, target);
  // Kuşatma taşı canlı hedefte dağılır: askere / kahramana tam hasarın yalnızca unitMult katı geçer (kuleye tam katlı).
  if (w && w.unitMult) d *= w.unitMult;
  if (attacker && attacker.isTower && (TOWER.lethalVsHeroes || !(target.isPlayer || target.isHero))) return Math.max(d, target.stats.maxHp * TOWER.lethalVsSoldiers);
  return d;
}

/** Kahramanın bir atışta attığı ok sayısı: **seviyesi kadar** (çizim yükü için en çok LEVEL.arrowsMax). */
export function heroArrows(e) { return isHeroUnit(e) ? Math.max(1, Math.min(e.level, LEVEL.arrowsMax)) : 1; }

/**
 * Vuruş kısıtı yoktur: her birim (kahraman, asker, işçi, mancınık, kule) her düşmana vurabilir; kalkanlı sancak dahil
 * her hedefe vuruş iner. Yalnızca iki istisna var: kulesi ayakta olan sancak **can kaybetmez** (vuruş kalkana çarpar ve
 * kuleleri ele verir, bkz. bannerShielded) ve zıplayan kahramana ne birlikler ne de kuleler vurabilir
 * (bkz. isEvading / towerTarget).
 */
export const isHeroUnit = e => Boolean(e && (e.isPlayer || e.isHero));

/** Kahramanın vuruş gücü seviyeyle büyür (sv 1 = 1x, seviye başına +LEVEL.damagePerLevel); askerlerde 1. */
export function damageMult(e) {
  return isHeroUnit(e) ? 1 + LEVEL.damagePerLevel * (e.level - 1) : 1;
}

/** Birimin tür anahtarı: asker / yaratıkta typeKey, kahramanda donanımdan (kule, mancınık, işçi: yok). */
export function unitKey(e) {
  if (!e) return null;
  if (e.isSiege || e.isWorker || e.isTower) return null;
  return e.typeKey || loadoutKey(e.loadout);
}
/** Saldıran, hedefin antisi mi (bkz. ANTI.table)? Anti vuruş tek atar. */
export function isAnti(attacker, target) {
  const a = unitKey(attacker), t = unitKey(target);
  return Boolean(a && t && ANTI.table[a] && ANTI.table[a].includes(t));
}
/** Anti dışı eşleşme çarpanı: yalnızca ok zayıftır (kalkana, atlıya); geri kalanı 1x. */
export function matchup(attacker, target) {
  if (!attacker || !attacker.loadout || !target || !target.loadout) return 1;
  let m = 1;
  if (attacker.loadout.weapon === 'bow') { if (target.loadout.shield) m *= ANTI.weak.bowVsShield; if (target.loadout.horse) m *= ANTI.weak.bowVsHorse; }
  return m;
}

/** Zamanlayıcıları ilerletir; windup dolduğunda vuruşu çözer ya da ok fırlatır. */
export function updateCombat(world, dt) {
  for (const e of world.entities) {
    if (e.cooldown > 0) e.cooldown -= dt;
    if (e.stun > 0) e.stun -= dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.attackTimer <= 0) continue;
    e.attackTimer -= dt;
    const w = e.stats.weapon;
    const elapsed = w.duration - e.attackTimer;
    if (!e.didHit && elapsed >= w.windup) {
      e.didHit = true;
      if (w.ranged) shootArrow(world, e); else resolveSwing(world, e);
    }
    if (e.attackTimer < 0) e.attackTimer = 0;
  }
  for (const s of world.structures) if (s.hitFlash > 0) s.hitFlash -= dt;
}

/** Mancınık hedefi: bilinen (görülmüş) en yakın düşman kulesi, menzil içinde. */
export function nearestEnemyTower(world, e, range) {
  let best = null, bd = Infinity;
  for (const s of world.structures) {
    if (!s.alive || s.faction === e.faction || s.kind !== 'tower') continue;
    if (e.faction === 'blue' ? !s.seen : !s.seenByRed) continue;
    const d = Math.hypot(s.pos.x - e.pos.x, s.pos.z - e.pos.z);
    if (d <= range + s.radius && d < bd) { bd = d; best = s; }
  }
  return best;
}

/** Kule hedefi: menzildeki en yakın asker / işçi; hiç yoksa kahraman. Zıplayan hedefe kule de atış yapmaz. */
export function towerTarget(world, sh, range) {
  let best = null, bd = Infinity, hero = null, hd = Infinity;
  for (const t of world.entities) {
    if (!t.alive || t.faction === sh.faction || t.jumpY > COMBAT.jumpDodgeHeight) continue;
    const d = Math.hypot(t.pos.x - sh.pos.x, t.pos.z - sh.pos.z);
    if (d > range + t.radius) continue;
    if (t.isPlayer || t.isHero) { if (d < hd) { hd = d; hero = t; } }
    else if (d < bd) { bd = d; best = t; }
  }
  return best || hero;
}

/** Menzildeki en yakın düşman; requireCone ile yalnızca bakış yönündekiler. */
export function nearestHostile(world, e, range, requireCone = false) {
  let best = null, bestDist = Infinity;
  const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
  for (const t of world.entities) {
    if (t === e || !t.alive || t.faction === e.faction) continue;
    const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range + t.radius) continue;
    if (requireCone && (fx * dx + fz * dz) / d < 0.3) continue;
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best;
}

/** Menzildeki ilk düşman yapı. Kalkanlı sancak da hedeflenir: canı gitmez ama vuruş kuleleri ele verir. */
export function nearestHostileStructure(world, e, range) {
  for (const s of world.structures) {
    if (!s.alive || s.faction === e.faction) continue;
    if (Math.hypot(s.pos.x - e.pos.x, s.pos.z - e.pos.z) <= range + s.radius) return s;
  }
  return null;
}

/** Koridor vuruşu (mızraklı kahraman): bakış yönünde length uzunluk, width genişlikte dikdörtgen; içindeki herkes vurulur. */
function resolveCorridor(world, attacker, corridor, damage, knockback, fx, fz) {
  const half = corridor.width / 2, len = corridor.length;
  let landed = false;
  const inside = (o, pad) => { const dx = o.pos.x - attacker.pos.x, dz = o.pos.z - attacker.pos.z; const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); return along > -pad * 0.5 && along <= len + pad && side <= half + pad; };
  for (const t of world.entities) {
    if (t === attacker || !t.alive || t.faction === attacker.faction || isEvading(t) || !inside(t, t.radius)) continue;
    landed = true;
    damageEntity(world, t, hitDamage(attacker, t, damage), fx, fz, knockback, attacker);
  }
  for (const s of world.structures) {
    if (!s.alive || s.faction === attacker.faction || !inside(s, s.radius)) continue;
    landed = true; damageStructure(world, s, damage, attacker);
  }
  if (attacker.isPlayer && world.nodes) for (const n of world.nodes) {
    if (!inside(n, n.radius * 0.8)) continue;
    landed = true; world.onNodeHit(n, attacker);
  }
  if (!landed) burst(world, attacker.pos.x + fx * 1.4, 0.9, attacker.pos.z + fz * 1.4, '#ffffff', 3, 0.25);
}

function resolveSwing(world, attacker) {
  const { knockback } = attacker.stats.weapon;
  const { range, arc, corridor } = heroReach(attacker);
  // Mızraklı Atlı hücumu: hasar o anki hıza göre artar (chargeMult); öbür setlerde 1.
  const damage = attacker.stats.weapon.damage * damageMult(attacker) * chargeMult(attacker);
  const fx = Math.sin(attacker.facing), fz = Math.cos(attacker.facing);
  if (corridor) { resolveCorridor(world, attacker, corridor, damage, knockback, fx, fz); return; }
  const cosHalf = Math.cos(arc * 0.5);
  let landed = false;

  for (const t of world.entities) {
    if (t === attacker || !t.alive || t.faction === attacker.faction || isEvading(t)) continue;
    const dx = t.pos.x - attacker.pos.x, dz = t.pos.z - attacker.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + t.radius || dist < 1e-4) continue;
    const nx = dx / dist, nz = dz / dist;
    if (fx * nx + fz * nz < cosHalf) continue;
    landed = true;
    damageEntity(world, t, hitDamage(attacker, t, damage), nx, nz, knockback, attacker);
  }
  for (const s of world.structures) {
    if (!s.alive || s.faction === attacker.faction) continue;
    const dx = s.pos.x - attacker.pos.x, dz = s.pos.z - attacker.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + s.radius) continue;
    if ((fx * dx + fz * dz) / dist < cosHalf * 0.6) continue;
    landed = true;
    damageStructure(world, s, damage, attacker);
  }
  // Kahraman kaynak düğümlerine (maden, ağaç, tarla) vurunca ürün düşer.
  if (attacker.isPlayer && world.nodes) for (const n of world.nodes) {
    const dx = n.pos.x - attacker.pos.x, dz = n.pos.z - attacker.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + n.radius) continue;
    if (dist > n.radius && (fx * dx + fz * dz) / dist < cosHalf * 0.6) continue;
    landed = true;
    world.onNodeHit(n, attacker);
  }
  if (!landed) burst(world, attacker.pos.x + fx * 1.4, 0.9, attacker.pos.z + fz * 1.4, '#ffffff', 3, 0.25);
}

/**
 * Hasar: kalkanla önden karşılanırsa büyük ölçüde emilir, yapay zekâ kalkanlıları
 * pasif ön koruma alır. Yalnızca kahramanın vuruşları biraz iter; diğerleri itmez.
 */
export function damageEntity(world, target, amount, nx, nz, knockback, source) {
  knockback *= source && source.isPlayer ? HERO_KNOCKBACK : KNOCKBACK_SCALE;
  let mult = 1, blocked = false;
  const fx = Math.sin(target.facing), fz = Math.cos(target.facing);
  const frontal = -(fx * nx + fz * nz) > BLOCK.frontDot;
  if (target.blocking && target.loadout.shield && frontal) { mult = BLOCK.damageMult; knockback *= BLOCK.knockMult; blocked = true; }
  else if (!target.isPlayer && target.loadout.shield && frontal) mult = SHIELD.passiveFrontMult;

  // Kim vurdu: yürüyüşteki asker karşılık vermek için bunu okur (bkz. ai.js retaliator).
  if (source && source !== target && source.faction !== target.faction) { target.lastHitBy = source; target.lastHitAt = world.time; }
  target.hp -= amount * mult;
  target.hitFlash = blocked ? COMBAT.hitFlash * 0.4 : COMBAT.hitFlash;
  if (COMBAT.stunOnHit > 0) target.stun = Math.max(target.stun, blocked ? COMBAT.stunOnHit * 0.3 : COMBAT.stunOnHit);
  applyImpulse(target, nx, nz, knockback);
  burst(world, target.pos.x, 1 + target.jumpY, target.pos.z, blocked ? '#e3ca82' : target.isPlayer ? '#ff6a4a' : target.faction === 'blue' ? '#9fd6ff' : '#f5d38a', blocked ? 4 : 6);

  if (target.hp <= 0) {
    target.hp = 0; target.alive = false; target.deathTimer = 0;
    target.moveDir.set(0, 0, 0); target.blocking = false; target.sprinting = false;
    applyImpulse(target, nx, nz, knockback * 0.6);
    world.onDeath(target, source);
  }
  return blocked;
}

export function damageStructure(world, s, amount, source) {
  if (!s.alive) return;
  // Kahraman yapılara türünün asker hasarıyla vurur; seviye başına artar.
  if (isHeroUnit(source)) amount *= 1 + LEVEL.structureDamagePerLevel * ((source.level || 1) - 1);
  // Kim vurdu: botun kulesi / sancağı vurulunca ordusunu ve kahramanını savunmaya çağırır (bkz. economy.js updateBots).
  if (source && source.faction !== s.faction) { s.lastHitBy = source; s.lastHitAt = world.time; }
  // Kendi sancağın / kulen vuruldu: ekran kenarı kızarır, haritada kırmızı halka çıkar.
  if (s.owner === world.me && (s.kind === 'banner' || s.kind === 'tower') && world.onOwnStructureHit) world.onOwnStructureHit(s, source);
  // Kuleler ayaktayken sancağın canı azalmaz: vuruş iner, kalkana çarpar ve hasar vermez.
  if (bannerShielded(world, s)) {
    s.hitFlash = 0.18;
    burst(world, s.pos.x + (Math.random() - 0.5), 1.8, s.pos.z + (Math.random() - 0.5), '#9fd6ff', 3, 0.14);
    if (source && source.faction === 'blue' && world.time - (world.shieldMsgAt ?? -9) > 2.5) {
      world.shieldMsgAt = world.time;
      // Sancağa vurmak kalkanı besleyen kuleleri (sahibinin kuleleri) ele verir: hepsi haritada açılır ve yerleri işaretlenir.
      const towers = world.structures.filter(t => t.alive && t.kind === 'tower' && t.owner === s.owner);
      for (const t of towers) {
        t.seen = true; t.g.visible = true;
        ring(world, t.pos.x, t.pos.z, '#ff8a6a', 3.2, 2.5);
        ring(world, t.pos.x, t.pos.z, '#ffd12e', 1.6, 2.5);
        burst(world, t.pos.x, 3.2, t.pos.z, '#ffd12e', 8, 0.12);
      }
      world.ui.say(`Kalkan: sancağın canı azalmıyor · ${towers.length} kule koruyor, yerleri haritada işaretlendi`, 2600);
      world.ui.ping('tower');
    }
    return;
  }
  // Askerler kuleyi zor yıkar: kahraman dışı birimlerin kuleye hasarı düşük çarpanla gider.
  if (s.kind === 'tower' && source && !isHeroUnit(source) && !source.isSiege) amount *= TOWER.soldierDamageMult;
  // Mancınık kuleye tam hasarın katını verir: kuşatma aleti kule kırmak içindir.
  else if (s.kind === 'tower' && source && source.isSiege) amount *= TOWER.siegeDamageMult;
  s.hp -= amount; s.hitFlash = 0.18;
  burst(world, s.pos.x + (Math.random() - 0.5), 1.5, s.pos.z + (Math.random() - 0.5), '#d9c4a0', 5);
  if (s.hp <= 0) { s.hp = 0; s.alive = false; world.onStructureDestroyed(s, source); }
}

// ---------- Oklar ----------

/** Nişan yönündeki (koni) düşmanlar, yakından uzağa. */
function hostilesInCone(world, e, range) {
  const fx = Math.sin(e.facing), fz = Math.cos(e.facing), out = [];
  for (const t of world.entities) {
    if (t === e || !t.alive || t.faction === e.faction) continue;
    const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d > range + t.radius || (fx * dx + fz * dz) / d < 0.3) continue;
    out.push({ t, d });
  }
  return out.sort((a, b) => a.d - b.d).map(o => o.t);
}

/**
 * Ok atışı. Kahraman seviyeye göre birden çok ok atar: oklar **dağılmaz**, hepsi aynı yöne ve **aynı hedefe** gider
 * (yelpaze yok). Yan yana çıksınlar diye yalnızca çıkış noktaları birkaç santim kaydırılır; hedef varsa hepsi onu
 * takip eder, yoksa tıklanan noktaya paralel uçarlar.
 */
function shootArrow(world, e) {
  const dir = new T.Vector3().subVectors(e.aim, e.pos); dir.y = 0;
  if (dir.lengthSq() < 1e-4) dir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  dir.normalize();
  // Mancınık da her hedefe atar: dövüştüğü birim varsa ona, yoksa menzilindeki bilinen kuleye nişan alır.
  // Yalnızca **kahraman** mancınığının taşı hedefi takip eder; asker mancınığın taşı atış anındaki konuma **düz** uçar
  // (hedef yer değiştirirse ıskalar), kule oku ise her zaman kesindir.
  if (e.isSiege) {
    const foe = e.brain && e.brain.target && e.brain.target.alive ? e.brain.target : null;
    const target = foe || nearestEnemyTower(world, e, e.stats.weapon.range * 1.1);
    if (isHeroUnit(e)) { fireArrow(world, e, dir, target); return; }
    if (target) {
      const tx = target.pos.x - e.pos.x, tz = target.pos.z - e.pos.z, dist = Math.hypot(tx, tz);
      if (dist > 1e-3) dir.set(tx / dist, 0, tz / dist);
      fireArrow(world, e, dir, null);
      // Taşın ömrü hedefe yetsin: düz atış menzilin biraz ötesindeki kuleye de ulaşır.
      const a = world.arrows[world.arrows.length - 1]; a.life = Math.max(a.life, dist / a.speed + 0.2);
    } else fireArrow(world, e, dir, null);
    return;
  }
  if (!isHeroUnit(e)) { fireArrow(world, e, dir, null); return; }
  // Kahraman: sete göre yaylım (Okçu geniş yelpaze, Atlı Okçu iki kat ok dar yelpazede; bkz. abilities.heroVolley).
  heroVolley(world, e, dir);
}

/** `side`: çıkış noktasının yana kaydırması (toplu atışta oklar üst üste binmesin diye); uçuş yönünü değiştirmez. */
/** opts: pierce (çarptığı birimleri delip geçer, yapıda durur), scale (ok boyutu), rangeMult (ömür / menzil çarpanı). */
export function fireArrow(world, e, dir, target = null, dmgMult = 1, side = 0, opts = {}) {
  const w = e.stats.weapon;
  const g = new T.Group();
  if (w.siege) mesh(g, new T.IcosahedronGeometry(0.34, 0), '#6a6f74', 0, 0, 0);
  else {
    box(g, '#65482f', 0, 0, 0, 0.055, 0.055, 0.9);
    mesh(g, new T.ConeGeometry(0.09, 0.23, 4), target ? '#ffd86b' : '#d8d7b7', 0, 0, 0.56).rotation.x = Math.PI / 2;
  }
  g.position.set(e.pos.x + dir.x * 0.6 + dir.z * side, (w.siege ? 2.2 : 1.25) + e.jumpY + (e.view && e.view.mounted ? 0.8 : 0), e.pos.z + dir.z * 0.6 - dir.x * side);
  g.rotation.y = Math.atan2(dir.x, dir.z);
  if (opts.scale) g.scale.setScalar(opts.scale);
  world.scene.add(g);
  const speed = w.arrowSpeed || 17;
  // Kule oku "kesin": hedefi anında döner, kaçış / zıplama / vurulmazlık savuşturamaz, hedef ölmedikçe ömrü bitmez.
  const sure = Boolean(e.isTower && target);
  world.arrows.push({
    g, vel: dir.clone().multiplyScalar(speed), speed, target, faction: e.faction, sure, siege: Boolean(w.siege),
    damage: w.damage * damageMult(e) * dmgMult, knock: w.knockback, life: (heroReach(e).range || 14) * (opts.rangeMult || 1) / speed + (target ? 1.2 : 0.2), source: e,
    pierce: Boolean(opts.pierce), pierced: opts.pierce ? new Set() : null,
  });
}

export function updateArrows(world, dt) {
  const arrows = world.arrows;
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (a.target) {
      if (!a.target.alive) { a.target = null; a.sure = false; }
      // Hedef zıpladıysa kesin ok kilidini kaybeder: zıplayan kahramanı kule oku da ıskalar.
      else if (a.sure && a.target.jumpY > COMBAT.jumpDodgeHeight) { a.sure = false; a.target = null; }
      else if (a.sure) {
        // Kesin ok: doğrudan hedefe kilitli, dönüş sınırı yok; hedefin yüksekliğine de uyar.
        const tp = a.target.pos, yaw = Math.atan2(tp.x - a.g.position.x, tp.z - a.g.position.z);
        a.vel.set(Math.sin(yaw) * a.speed, 0, Math.cos(yaw) * a.speed); a.g.rotation.y = yaw;
        a.g.position.y += (1.1 + a.target.jumpY - a.g.position.y) * Math.min(1, dt * 6);
        a.life = Math.max(a.life, 1);
      } else {
        // Takipli ok: hız vektörünü hedefe doğru sınırlı hızla döndür.
        const want = Math.atan2(a.target.pos.x - a.g.position.x, a.target.pos.z - a.g.position.z);
        const cur = Math.atan2(a.vel.x, a.vel.z);
        let d = (want - cur) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        const maxTurn = HOMING_TURN * dt;
        const yaw = cur + Math.max(-maxTurn, Math.min(maxTurn, d));
        a.vel.set(Math.sin(yaw) * a.speed, 0, Math.cos(yaw) * a.speed);
        a.g.rotation.y = yaw;
      }
    }
    a.g.position.addScaledVector(a.vel, dt);
    a.life -= dt;
    let hit = a.life <= 0;
    if (!hit && a.sure) {
      const t = a.target, p = a.g.position;
      if (Math.hypot(p.x - t.pos.x, p.z - t.pos.z) <= t.radius + 0.3 + a.speed * dt * 0.5) {
        const len = Math.hypot(a.vel.x, a.vel.z) || 1;
        damageEntity(world, t, hitDamage(a.source, t, a.damage), a.vel.x / len, a.vel.z / len, a.knock, a.source);
        hit = true;
      }
    } else if (!hit) {
      const p = a.g.position;
      for (const t of world.entities) {
        if (!t.alive || t.faction === a.faction || t.dodgeTimer > 0 || t.invuln > 0) continue;
        if (Math.hypot(p.x - t.pos.x, p.z - t.pos.z) > t.radius + 0.25) continue;
        // Yerdeyken ok göğüs hizasında; zıplayan karakter oku altında bırakır.
        if (t.jumpY > COMBAT.jumpDodgeHeight) continue;
        const len = Math.hypot(a.vel.x, a.vel.z);
        // Delici ok: birimi vurur ve durmadan yoluna devam eder (aynı birime bir kez).
        if (a.pierce) { if (a.pierced.has(t)) continue; a.pierced.add(t); damageEntity(world, t, hitDamage(a.source, t, a.damage), a.vel.x / len, a.vel.z / len, a.knock, a.source); continue; }
        damageEntity(world, t, hitDamage(a.source, t, a.damage), a.vel.x / len, a.vel.z / len, a.knock, a.source);
        hit = true; break;
      }
      if (!hit) for (const s of world.structures) {
        if (!s.alive || s.faction === a.faction) continue;
        if (Math.hypot(p.x - s.pos.x, p.z - s.pos.z) > s.radius + 0.3) continue;
        damageStructure(world, s, a.damage, a.source); hit = true; break;
      }
      // Kahramanın oku kaynak düğümüne çarpınca da ürün düşer.
      if (!hit && a.source && a.source.isPlayer && world.nodes) for (const n of world.nodes) {
        if (Math.hypot(p.x - n.pos.x, p.z - n.pos.z) > n.radius * 0.8 + 0.2) continue;
        world.onNodeHit(n, a.source); hit = true; break;
      }
    }
    if (hit) { world.scene.remove(a.g); arrows.splice(i, 1); }
  }
}

// ---------- Parçacık efektleri ----------

export function burst(world, x, y, z, color, count = 6, size = 0.1) {
  for (let i = 0; i < count; i++) {
    const m = new T.Mesh(ballGeo, mat(color));
    m.position.set(x, y, z); m.scale.setScalar(size); m.castShadow = false;
    world.scene.add(m);
    world.effects.push({ m, life: 0.45, v: new T.Vector3(rrand(-2, 2), rrand(1, 3), rrand(-2, 2)), size });
  }
}

/**
 * Dönerek vuruş çemberi: kahramanın **çevresinde** dönen, onu takip eden ve SPIN.duration boyunca her SPIN.tick
 * saniyede içindeki bütün düşmanlara (birim ve yapı) vuran halka. Yakın dövüşte dönen bıçak izleri, yayda
 * kahramanın **seviyesi kadar** dönen oktan oluşur. Çember zaten varsa yenilenir (üst üste binmez).
 */
const spinShaftGeo = new T.BoxGeometry(0.05, 0.05, 0.8);
const spinTipGeo = new T.ConeGeometry(0.085, 0.22, 4);
const spinBladeGeo = new T.BoxGeometry(0.12, 0.06, 1.1);

export function spawnSpin(world, e) {
  const bow = Boolean(e.stats.weapon.ranged);
  const radius = bow ? SPIN.bowRadius : Math.max(SPIN.minRadius, heroReach(e).range);
  const count = bow ? heroArrows(e) : 3;
  const damage = e.stats.weapon.damage * damageMult(e) * SPIN.damageMult;
  const old = world.spins.find(s => s.owner === e);
  if (old && old.bow === bow && old.count === count) {
    // Aynı çember: yeniden kurmak yerine ömrü ve gücü tazelenir (peş peşe tıklamada üst üste binmez).
    old.life = SPIN.duration; old.radius = radius; old.damage = damage;
    return old;
  }
  if (old) removeSpin(world, old);
  const g = new T.Group(), mats = [];
  // Parçalar kendi (paylaşılmayan) malzemesini kullanır: sönerken başka nesnelerin malzemesi bozulmasın.
  const piece = (parent, geo, color, opacity, z = 0) => {
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.z = z; mats.push({ m: m.material, o: opacity }); parent.add(m); return m;
  };
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const item = new T.Group();
    if (bow) {
      // Çemberde dönen ok: gövde + uç, ucu dışa bakar.
      piece(item, spinShaftGeo, '#65482f', 0.95);
      piece(item, spinTipGeo, '#ffd86b', 0.95, 0.5).rotation.x = Math.PI / 2;
    } else {
      // Dönen bıçak izi: ince, parlak bir dilim.
      piece(item, spinBladeGeo, '#ffe9a8', 0.9);
    }
    item.position.set(Math.sin(a) * radius, 1.05, Math.cos(a) * radius);
    item.rotation.y = a;
    g.add(item);
  }
  // Yerdeki halka: çemberin gerçek sınırını gösterir (yarıçapa bağlı, çemberle birlikte atılır).
  const ringGeo = new T.RingGeometry(radius * 0.92, radius, 44);
  const ringMesh = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: bow ? '#ffd86b' : '#ffe9a8', transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
  ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.y = 0.07;
  mats.push({ m: ringMesh.material, o: 0.35 });
  g.add(ringMesh);
  g.position.set(e.pos.x, 0, e.pos.z);
  world.scene.add(g);
  const s = { g, mats, ringGeo, owner: e, faction: e.faction, bow, count, radius, damage, life: SPIN.duration, maxLife: SPIN.duration, tick: 0, spin: 0 };
  world.spins.push(s);
  return s;
}

function removeSpin(world, s) {
  world.scene.remove(s.g);
  for (const it of s.mats) it.m.dispose();
  s.ringGeo.dispose();
  const i = world.spins.indexOf(s);
  if (i >= 0) world.spins.splice(i, 1);
}

/** Vuruş çemberleri: sahibini takip eder, döner, her tick içindekilere vurur; ömrü bitince ya da sahibi ölünce kalkar. */
export function updateSpins(world, dt) {
  const list = world.spins;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.life -= dt;
    const e = s.owner;
    if (!e.alive || s.life <= 0) { removeSpin(world, s); continue; }
    s.spin += dt * SPIN.spin;
    s.g.position.set(e.pos.x, e.jumpY, e.pos.z);
    s.g.rotation.y = s.spin;
    const k = Math.max(0, s.life) / s.maxLife;
    for (const it of s.mats) it.m.opacity = it.o * (k < 0.3 ? k / 0.3 : 1);
    s.tick -= dt;
    if (s.tick > 0) continue;
    s.tick = SPIN.tick;
    for (const t of world.entities) {
      if (t === e || !t.alive || t.faction === s.faction || isEvading(t)) continue;
      const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
      if (d > s.radius + t.radius) continue;
      damageEntity(world, t, hitDamage(e, t, s.damage), dx / d, dz / d, SPIN.knockback, e);
    }
    for (const st of world.structures) {
      if (!st.alive || st.faction === s.faction) continue;
      if (Math.hypot(st.pos.x - e.pos.x, st.pos.z - e.pos.z) > s.radius + st.radius) continue;
      damageStructure(world, st, s.damage, e);
    }
  }
}

/**
 * Hortum: sağ tıkla kahramanın **durduğu yerde** açılan alan vuruşu. Çağrıldığı noktada kalır (kahraman uzaklaşabilir),
 * TORNADO.duration boyunca döner ve her TORNADO.tick saniyede yarıçapındaki bütün düşmanlara — birim ve yapı —
 * yeniden vurur. Yarıçapı seviyeyle büyür (dashMult), hasarı vuruş gücünün TORNADO.damageMult katıdır.
 */
export function spawnTornado(world, e) {
  const radius = TORNADO.radius * dashMult(e);
  const g = new T.Group(), mats = [];
  // Huni: aşağıdan yukarı genişleyen, hafifçe kaçık merkezli dönen halkalar.
  for (let i = 0; i < TORNADO.rings; i++) {
    const k = i / (TORNADO.rings - 1);
    const o = 0.55 - k * 0.22;
    const m = new T.Mesh(new T.TorusGeometry(radius * (0.22 + k * 0.85), radius * 0.06 + 0.04, 6, 22),
      new T.MeshBasicMaterial({ color: k < 0.5 ? '#e2e8f0' : '#9fb4cc', transparent: true, opacity: o, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(rrand(-0.14, 0.14), 0.22 + k * TORNADO.height, rrand(-0.14, 0.14));
    mats.push({ m: m.material, o }); g.add(m);
  }
  // Tabandaki toz halkası: hortumun bastığı alanı gösterir.
  const base = new T.Mesh(new T.RingGeometry(radius * 0.5, radius, 40),
    new T.MeshBasicMaterial({ color: '#e8e2c6', transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.07;
  mats.push({ m: base.material, o: 0.45 }); g.add(base);
  g.position.set(e.pos.x, 0, e.pos.z);
  world.scene.add(g);
  world.tornadoes.push({
    g, mats, x: e.pos.x, z: e.pos.z, radius, source: e, faction: e.faction,
    damage: e.stats.weapon.damage * damageMult(e) * TORNADO.damageMult,
    life: TORNADO.duration, maxLife: TORNADO.duration, tick: 0, spin: 0, hits: 0,
  });
  burst(world, e.pos.x, 0.6, e.pos.z, '#e8e2c6', 10, 0.12);
}

/** Hortumlar: yerlerinde döner, her tick yarıçapındaki düşmanlara vurur, ömrü bitince söner. */
export function updateTornadoes(world, dt) {
  const list = world.tornadoes;
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    t.life -= dt;
    t.spin += dt * TORNADO.spin;
    const k = Math.max(0, t.life) / t.maxLife;
    // Hızla açılır, sonuna doğru söner; halkalar farklı hızlarda döner ki burgaç dursun.
    const grow = Math.min(1, (1 - k) * 5) * 0.35 + 0.65;
    t.g.scale.set(grow, grow, grow);
    t.g.rotation.y = t.spin;
    t.g.children.forEach((m, j) => { m.rotation.z = t.spin * (1 + j * 0.4); });
    const fade = k < 0.25 ? k / 0.25 : 1;
    for (const it of t.mats) it.m.opacity = it.o * fade;
    t.tick -= dt;
    if (t.tick <= 0 && t.life > 0) {
      t.tick = TORNADO.tick;
      for (const o of world.entities) {
        if (!o.alive || o.faction === t.faction || isEvading(o)) continue;
        const dx = o.pos.x - t.x, dz = o.pos.z - t.z, d = Math.hypot(dx, dz) || 1;
        if (d > t.radius + o.radius) continue;
        damageEntity(world, o, hitDamage(t.source, o, t.damage), dx / d, dz / d, TORNADO.knockback, t.source);
        t.hits++;
      }
      for (const s of world.structures) {
        if (!s.alive || s.faction === t.faction) continue;
        if (Math.hypot(s.pos.x - t.x, s.pos.z - t.z) > t.radius + s.radius) continue;
        damageStructure(world, s, t.damage, t.source); t.hits++;
      }
    }
    if (t.life <= 0) {
      world.scene.remove(t.g);
      for (const m of t.g.children) m.geometry.dispose();
      for (const it of t.mats) it.m.dispose();
      list.splice(i, 1);
    }
  }
}


/** Can baloncuğu: kahramanın tepesinden çıkıp yükselerek sönen küçük yeşil küre (üstünde beyaz artı). */
export function healBubble(world, x, y, z) {
  const g = new T.Group();
  const bodyMat = new T.MeshBasicMaterial({ color: '#7ee787', transparent: true, opacity: 0.85, depthWrite: false });
  const ball = new T.Mesh(ballGeo, bodyMat); ball.scale.setScalar(0.22); g.add(ball);
  const crossMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false });
  const bar1 = new T.Mesh(new T.BoxGeometry(0.22, 0.07, 0.07), crossMat); g.add(bar1);
  const bar2 = new T.Mesh(new T.BoxGeometry(0.07, 0.22, 0.07), crossMat); g.add(bar2);
  g.position.set(x + rrand(-0.45, 0.45), y, z + rrand(-0.45, 0.45));
  world.scene.add(g);
  world.effects.push({ m: g, life: 0.95, maxLife: 0.95, rise: rrand(1.3, 2.1), mats: [bodyMat, crossMat] });
}

/** Yere paralel genişleyen halka (yetenek efektleri). */
export function ring(world, x, z, color, radius, life = 0.5) {
  const m = new T.Mesh(new T.RingGeometry(0.7, 1, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); m.scale.setScalar(0.3);
  world.scene.add(m);
  world.effects.push({ m, life, maxLife: life, ring: radius });
}

export function updateEffects(world, dt) {
  const fx = world.effects;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.rise) {
      // Yükselen baloncuk: yukarı süzülür, hafifçe büyüyüp söner.
      f.m.position.y += f.rise * dt;
      const k = Math.max(0, f.life) / f.maxLife;
      for (const mt of f.mats) mt.opacity = k * 0.9;
      f.m.scale.setScalar(0.85 + (1 - k) * 0.5);
      if (f.life <= 0) { world.scene.remove(f.m); for (const mt of f.mats) mt.dispose(); fx.splice(i, 1); }
      continue;
    }
    if (f.fade) {
      f.m.material.opacity = f.fade * Math.max(0, f.life) / f.maxLife;
      if (f.life <= 0) { world.scene.remove(f.parent || f.m); f.m.material.dispose(); f.m.geometry.dispose(); fx.splice(i, 1); }
      continue;
    }
    if (f.ring) {
      const k = 1 - Math.max(0, f.life) / f.maxLife;
      f.m.scale.setScalar(0.3 + k * f.ring); f.m.material.opacity = (1 - k) * 0.7;
      if (f.life <= 0) { world.scene.remove(f.m); f.m.material.dispose(); f.m.geometry.dispose(); fx.splice(i, 1); }
      continue;
    }
    f.m.position.addScaledVector(f.v, dt); f.v.y -= dt * 8;
    f.m.scale.setScalar(Math.max(0.01, f.life * 2.2 * f.size));
    if (f.life <= 0) { world.scene.remove(f.m); fx.splice(i, 1); }
  }
}
