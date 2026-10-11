import * as T from 'three';
import { CHARGE, DASH, KIT, TORNADO } from './config.js';
import { dashMult, isEvading, kitOf, reachOf } from './characters.js';
import { damageEntity, damageMult, damageStructure, fireArrow, heroArrows, hitDamage } from './combat.js';
import { applyImpulse } from './physics.js';

/**
 * Kahraman yetenek setleri (bkz. config KIT): set silah x at ile belirlenir, kalkan atılma vurulmazlığını uzatır.
 *  - Sol tık: silahın kendi vuruşu (characters.reachOf): Kılıçlı çevresine 360°, Mızraklı önüne koridor, Okçu yelpaze
 *    yaylımı (heroVolley). Basılı tutup bırakma şarjlı vuruştur (heroCharged).
 *  - Sağ tık: her sette **ileri atılma** + silaha göre durduğun yerde 2 sn süren alan: kılıç fırtınası, kazık alanı, ok yağmuru.
 *    Atlı setlerde alan açılırken **vakum** çevredeki düşmanları merkeze çeker. Süreli etkiler world.zones'da yaşar (updateZones).
 * Bölgeler yalnızca veridir; görünümleri view/zones.js kind'e göre çizer (blades / spikes / rain, vakum kıvılcımları).
 */

/** Ok atan kahramanın yaylımı: seviyesi kadar ok (atlı okçuda iki katı) yelpaze halinde, her ok kendi yönündeki düşmana kilitlenir. */
export function heroVolley(world, e, dir) {
  const k = KIT[kitOf(e)] || KIT.bow;
  const n = Math.max(1, Math.round(heroArrows(e) * (k.arrowMult || 1)));
  const fan = Math.min(k.fanMax, k.fanStep * (n - 1)) * Math.PI / 180;
  const base = Math.atan2(dir.x, dir.z), range = reachOf(e).range, cosTol = Math.cos(k.homingDeg * Math.PI / 180);
  // Ok sayısı çiftse simetrik yelpazede nişana (imlece) giden ok olmaz: yelpaze yarım aralık kayar, bir ok tam nişana
  // gider. Ok sayısı (hasar) değişmez; yalnız dağılım bir yana yarım aralık kayar.
  const shift = n > 1 && n % 2 === 0 ? fan / (n - 1) / 2 : 0;
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i / (n - 1) - 0.5) * fan : 0) + shift;
    const d = new T.Vector3(Math.sin(a), 0, Math.cos(a));
    fireArrow(world, e, d, hostileAlong(world, e, d.x, d.z, range * 1.1, cosTol), 1, 0);
  }
}

/**
 * Şarjlı vuruş (sol tık basılı tutup bırakma). Silahın **normal vuruşunu peş peşe** k.shots kez, k.gap sn arayla yapar;
 * şarj oranı c atış sayısını ölçekler (en az 1). İlk dalga hemen, kalanlar 'burst' bölgesiyle (updateZones) iner.
 */
export function heroCharged(world, p, c) {
  const w = p.stats.weapon;
  if (!kitOf(p)) return;
  const k = chargeSpec(p), n = Math.max(1, Math.round(k.shots * c));
  p.aimLocked = false;
  p.cooldown = w.cooldown * CHARGE.cooldownMult;
  chargePulse(world, p, 0, n === 1);
  if (n > 1) world.zones.push({ id: world.ids.zone++, kind: 'burst', source: p, faction: p.faction, left: n - 1, i: 1, gap: k.gap, tick: k.gap, life: (n - 1) * k.gap + 0.05, view: null });
  if (p.isPlayer && p.owner) {
    const label = w.ranged ? 'Hızlı yaylım' : 'Şok dalgası';
    world.fx.float(p.owner, `${label} x${n}`, { x: p.pos.x, y: 2.6, z: p.pos.z }, w.ranged ? '#ffd86b' : '#ffe9a8');
  }
}

/** Kahramanın silahına göre şarj ayarları (bkz. CHARGE). */
function chargeSpec(p) {
  const w = p.stats.weapon;
  return w.ranged ? CHARGE.bow : w.label === 'Mızrak' ? CHARGE.spear : CHARGE.sword;
}

/**
 * Şarjın i. dalgası (0 tabanlı): kahraman o anki nişanına döner, silahın normal vuruşunu yapar ve animasyonu oynar.
 * Kılıçta çember, mızrakta koridor her dalgada k.growth kadar büyür. Kılıçta itme yalnızca **son** dalgadadır (last).
 */
function chargePulse(world, p, i, last = false) {
  const w = p.stats.weapon, k = chargeSpec(p), grow = 1 + (k.growth || 0) * i;
  const ax = p.aim.x - p.pos.x, az = p.aim.z - p.pos.z, ad = Math.hypot(ax, az);
  const fx = ad > 0.2 ? ax / ad : Math.sin(p.facing), fz = ad > 0.2 ? az / ad : Math.cos(p.facing);
  p.facing = Math.atan2(fx, fz);
  p.attackTimer = w.duration; p.didHit = true;
  const dmg = w.damage * damageMult(p);

  if (w.ranged) { heroVolley(world, p, new T.Vector3(fx, 0, fz)); world.fx.burst(p.pos.x + fx * 0.8, 1.3, p.pos.z + fz * 0.8, '#ffd86b', 6, 0.08); return; }

  if (w.label === 'Mızrak') {
    // Koridor dalgası: her dalga bir öncekinden uzun; hattaki herkes vurulur, en yakını kahramana çekilir.
    const r = reachOf(p), cor = r.corridor || { length: r.range * 2, width: 1.8 };
    const len = cor.length * grow, half = cor.width / 2;
    let nearest = null, nd = Infinity;
    for (const t of world.entities) {
      if (t === p || !t.alive || t.faction === p.faction || isEvading(t)) continue;
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (along < 0.2 || along > len || side > half + t.radius) continue;
      damageEntity(world, t, hitDamage(p, t, dmg), fx, fz, 0, p);
      if (t.alive && along < nd) { nd = along; nearest = t; }
    }
    for (const s of world.structures) {
      if (!s.alive || s.faction === p.faction) continue;
      const dx = s.pos.x - p.pos.x, dz = s.pos.z - p.pos.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (along < 0 || along > len + s.radius || side > half + s.radius) continue;
      damageStructure(world, s, dmg, p);
    }
    if (nearest) { applyImpulse(nearest, -fx, -fz, k.pull / (nearest.invMass || 1)); world.fx.burst(nearest.pos.x, 1.1, nearest.pos.z, '#ffe9a8', 6, 0.1); }
    world.fx.strip(p.pos.x, p.pos.z, fx, fz, len, cor.width, '#ffd27a', 0.3);
    return;
  }

  // Kılıç: 360° şok dalgası, her dalga daha geniş.
  const range = reachOf(p).range * grow, knock = last ? w.knockback * k.knockMult : 0;
  for (const t of world.entities) {
    if (t === p || !t.alive || t.faction === p.faction || isEvading(t)) continue;
    const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d > range + t.radius) continue;
    damageEntity(world, t, hitDamage(p, t, dmg), dx / d, dz / d, knock, p);
  }
  for (const s of world.structures) {
    if (!s.alive || s.faction === p.faction) continue;
    if (Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) > range + s.radius) continue;
    damageStructure(world, s, dmg, p);
  }
  if (i === 0) applyImpulse(p, fx, fz, k.lunge * 4.2 / p.invMass);
  world.fx.ring(p.pos.x, p.pos.z, '#ffe9a8', range, 0.3);
}

/** Verilen yönde (cosTol açı payıyla) menzildeki en yakın düşman birim. */
function hostileAlong(world, e, ux, uz, range, cosTol) {
  let best = null, bd = Infinity;
  for (const t of world.entities) {
    if (t === e || !t.alive || t.faction === e.faction) continue;
    const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3 || d > range + t.radius || (dx * ux + dz * uz) / d < cosTol) continue;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/**
 * Sağ tık: atılma zamanlayıcıları + silaha göre alan etkisi (atlıda vakumlu). (bx, bz) atılma yönü. Çağıran ardından itmeyi uygular.
 */
export function heroDash(world, p, bx, bz) {
  const kit = kitOf(p), k = KIT[kit] || KIT.sword;
  p.dodgeCd = TORNADO.cooldown; p.dodgeTimer = DASH.duration; p.attackTimer = 0;
  p.invuln = DASH.invuln * (p.loadout.shield ? DASH.shieldInvulnMult : 1);
  const dmg = p.stats.weapon.damage * damageMult(p);
  const weapon = p.loadout.weapon, base = KIT[weapon] || KIT.sword;
  const kind = base === KIT.sword ? 'blades' : base === KIT.spear ? 'spikes' : 'rain';
  spawnField(world, p, base, dmg, kind, k.vacuum || null);
  void bx; void bz;
}

export const FIELD_COLOR = { blades: '#ffe9a8', spikes: '#d9c98a', rain: '#ffd86b' };
/**
 * Durduğun yerde açılan alan etkisi: kind 'blades' (savrulan kılıçlar), 'spikes' (yerden yükselen kazıklar) ya da
 * 'rain' (gökten ok yağmuru). fieldLife boyunca fieldTick'te bir yarıçaptaki bütün düşmanlara vurur.
 */
function spawnField(world, p, k, dmg, kind, vacuum = null) {
  const radius = k.fieldRadius * dashMult(p), x = p.pos.x, z = p.pos.z;
  const z0 = {
    id: world.ids.zone++, kind, source: p, faction: p.faction, x, z, radius,
    vacuum: vacuum ? { radius: radius * vacuum.radius, life: vacuum.life, maxLife: vacuum.life, pull: vacuum.pull } : null,
    life: k.fieldLife, maxLife: k.fieldLife, tick: 0, tickEvery: k.fieldTick, damage: dmg * k.fieldDamage, knock: k.fieldKnock,
    arrows: heroArrows(p), blades: k.blades || 0, stakes: k.stakes || 0, view: null,
  };
  world.zones.push(z0);
  world.fx.addZone(z0);
  if (vacuum) world.fx.ring(x, z, FIELD_COLOR[kind], z0.vacuum.radius, vacuum.life);
  world.fx.burst(x, 0.6, z, FIELD_COLOR[kind], 10, 0.12);
}

/** Alan etkisinin bir vuruşu: yarıçaptaki düşman birim ve yapılara hasar. */
function fieldTick(world, z) {
  const e = z.source;
  for (const t of world.entities) {
    if (t === e || !t.alive || t.faction === z.faction || isEvading(t)) continue;
    const dx = t.pos.x - z.x, dz = t.pos.z - z.z, d = Math.hypot(dx, dz) || 1;
    if (d > z.radius + t.radius) continue;
    damageEntity(world, t, hitDamage(e, t, z.damage), dx / d, dz / d, z.knock, e);
  }
  for (const s of world.structures) {
    if (!s.alive || s.faction === z.faction) continue;
    if (Math.hypot(s.pos.x - z.x, s.pos.z - z.z) > z.radius + s.radius) continue;
    damageStructure(world, s, z.damage, e);
  }
}

/** Süreli set etkileri: kılıç fırtınası, kazık alanı, ok yağmuru (atlıda vakumlu) ve şarjın kalan dalgaları. */
export function updateZones(world, dt) {
  const list = world.zones;
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i], e = z.source;
    z.life -= dt;
    if (!e.alive) { world.fx.removeZone(z); list.splice(i, 1); continue; }
    if (z.kind === 'blades' || z.kind === 'spikes' || z.kind === 'rain') {
      // Vakum (atlı setler): ilk vacuum.life sn boyunca çekme yarıçapındaki düşmanlar merkeze çekilir (kütleden bağımsız).
      if (z.vacuum && z.vacuum.life > 0) {
        const v = z.vacuum; v.life -= dt;
        for (const t of world.entities) {
          if (t === e || !t.alive || t.faction === z.faction || t.isWorker) continue;
          const dx = z.x - t.pos.x, dz = z.z - t.pos.z, d = Math.hypot(dx, dz);
          if (d > v.radius || d < 0.4) continue;
          applyImpulse(t, dx / d, dz / d, v.pull * dt / t.invMass);
        }
      }
      z.tick -= dt;
      if (z.tick <= 0 && z.life > 0) { z.tick = z.tickEvery; fieldTick(world, z); }
    } else if (z.kind === 'burst') {
      // Şarjın kalan dalgaları: her biri silahın normal vuruşudur ve o anki nişana gider.
      z.tick -= dt;
      if (z.tick <= 0 && z.left > 0) { z.tick = z.gap; z.left--; chargePulse(world, e, z.i++, z.left === 0); }
    }
    if (z.life <= 0) { world.fx.removeZone(z); list.splice(i, 1); }
  }
}
