import * as T from '/vendor/three.module.js';
import { CHARGE, DASH, KIT, TORNADO } from './config.js';
import { dashMult, isEvading, kitOf, reachOf } from './characters.js';
import { burst, damageEntity, damageMult, damageStructure, fireArrow, heroArrows, hitDamage, ring } from './combat.js';
import { applyImpulse } from './physics.js';

/**
 * Kahraman yetenek setleri (bkz. config KIT): set silah x at ile belirlenir, kalkan atılma vurulmazlığını uzatır.
 *  - Sol tık: silahın kendi vuruşu, silaha göre şekli farklı (characters.reachOf): Kılıçlı çevresine 360°, Mızraklı önüne
 *    koridor, Okçu yelpaze yaylımı (heroVolley). Atlılarda üstüne geniş kesik (silah değerlerinde), hücum (hıza bağlı hasar,
 *    characters.chargeMult) ya da koşarken çift ok biner. Basılı tutup bırakma şarjlı vuruştur (heroCharged).
 *  - Sağ tık: her sette **ileri atılma** + silaha göre durduğun yerde 2 sn süren alan: kılıç fırtınası, kazık alanı, ok yağmuru.
 *    Atlı setlerde alan açılırken **vakum** çevredeki düşmanları merkeze çeker. Süreli etkiler world.zones'da yaşar (updateZones).
 */

/** Ok atan kahramanın yaylımı: seviyesi kadar ok (atlı okçuda iki katı) yelpaze halinde, her ok kendi yönündeki düşmana kilitlenir. */
export function heroVolley(world, e, dir) {
  const k = KIT[kitOf(e)] || KIT.bow;
  const n = Math.max(1, Math.round(heroArrows(e) * (k.arrowMult || 1)));
  const fan = Math.min(k.fanMax, k.fanStep * (n - 1)) * Math.PI / 180;
  const base = Math.atan2(dir.x, dir.z), range = reachOf(e).range, cosTol = Math.cos(k.homingDeg * Math.PI / 180);
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i / (n - 1) - 0.5) * fan : 0);
    const d = new T.Vector3(Math.sin(a), 0, Math.cos(a));
    fireArrow(world, e, d, hostileAlong(world, e, d.x, d.z, range * 1.1, cosTol), 1, 0);
  }
}

/**
 * Şarjlı vuruş (sol tık basılı tutup bırakma). c: şarj oranı 0..1; hasar 1 + (damage - 1) x c. Vuruş anında iner, silahın
 * vuruş animasyonu oynar (attackTimer), normal vuruş tetiklenmez (didHit) ve bekleme CHARGE.cooldownMult kat uzar.
 *  - Kılıç: ağır kesik (360°, uzun menzil, sert itme, öne kayma).
 *  - Mızrak: delici saplama (koridor uzar, herkesi deler, en yakını çeker).
 *  - Yay: hızlı yaylım (normal atışı peş peşe CHARGE.bow.shots kez; sürerken nişan imleci izler, bkz. updateZones 'volley').
 */
export function heroCharged(world, p, c) {
  const w = p.stats.weapon, kit = kitOf(p);
  if (!kit) return;
  const ax = p.aim.x - p.pos.x, az = p.aim.z - p.pos.z, ad = Math.hypot(ax, az);
  const fx = ad > 0.2 ? ax / ad : Math.sin(p.facing), fz = ad > 0.2 ? az / ad : Math.cos(p.facing);
  p.facing = Math.atan2(fx, fz); p.aimLocked = true;
  p.attackTimer = w.duration; p.didHit = true; p.cooldown = w.cooldown * CHARGE.cooldownMult;
  const base = w.damage * damageMult(p);
  if (w.ranged) {
    // Hızlı yaylım: ilki hemen, kalanı gap aralıklarla (updateZones 'volley'). Nişan kilitlenmez ki yaylımı süpürebilesin.
    const k = CHARGE.bow, n = Math.max(1, Math.round(k.shots * c));
    p.aimLocked = false;
    heroVolley(world, p, new T.Vector3(fx, 0, fz));
    burst(world, p.pos.x + fx * 0.8, 1.3, p.pos.z + fz * 0.8, '#ffd86b', 6, 0.08);
    if (n > 1) world.zones.push({ kind: 'volley', source: p, faction: p.faction, left: n - 1, gap: k.gap, tick: k.gap, life: (n - 1) * k.gap + 0.05 });
    if (p.isPlayer && world.ui) world.ui.float(`Hızlı yaylım x${n}`, { x: p.pos.x, y: 2.6, z: p.pos.z }, '#ffd86b');
    return;
  }
  if (w.label === 'Mızrak') {
    const k = CHARGE.spear, r = reachOf(p), cor = r.corridor || { length: r.range * 2, width: 1.8 };
    const len = cor.length * (k.lenMin + (k.lenMax - k.lenMin) * c), half = cor.width / 2;
    const dmg = base * (1 + (k.damage - 1) * c);
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
    // En yakın delinen hedef mızrağın ucundan kahramana doğru çekilir.
    if (nearest) { applyImpulse(nearest, -fx, -fz, k.pull * (0.5 + 0.5 * c) / nearest.invMass); burst(world, nearest.pos.x, 1.1, nearest.pos.z, '#ffe9a8', 6, 0.1); }
    strip(world, p.pos.x, p.pos.z, fx, fz, len, cor.width, '#ffd27a', 0.35);
    return;
  }
  // Kılıç: 360° ağır kesik, menzil uzar.
  const k = CHARGE.sword, range = reachOf(p).range * k.rangeMult;
  const dmg = base * (1 + (k.damage - 1) * c), knock = w.knockback * k.knockMult;
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
  applyImpulse(p, fx, fz, k.lunge * 4.2 / p.invMass);
  ring(world, p.pos.x, p.pos.z, '#ffe9a8', range, 0.35);
}

/** Hızlı yaylımın bir atışı: kahraman o anki nişanına döner, yaylımı atar, yay animasyonu oynar (vuruş yeniden çözülmez). */
function burstVolley(world, p) {
  const ax = p.aim.x - p.pos.x, az = p.aim.z - p.pos.z, ad = Math.hypot(ax, az);
  const fx = ad > 0.2 ? ax / ad : Math.sin(p.facing), fz = ad > 0.2 ? az / ad : Math.cos(p.facing);
  p.facing = Math.atan2(fx, fz);
  p.attackTimer = p.stats.weapon.duration; p.didHit = true;
  heroVolley(world, p, new T.Vector3(fx, 0, fz));
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

/** Yerden az yukarıda, yön boyunca uzanan ve sönen parlak şerit. */
function strip(world, x, z, ux, uz, len, width, color, life) {
  const m = new T.Mesh(new T.BoxGeometry(width, 0.08, len), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.set(x + ux * len / 2, 1.0, z + uz * len / 2);
  m.rotation.y = Math.atan2(ux, uz);
  world.scene.add(m);
  world.effects.push({ m, life, maxLife: life, fade: 0.85 });
}

/**
 * Sağ tık: atılma zamanlayıcıları + silaha göre alan etkisi (atlıda vakumlu). (bx, bz) atılma yönü. Çağıran ardından itmeyi uygular.
 * Kalkanlı setlerde vurulmazlık DASH.shieldInvulnMult kat uzundur.
 */
export function heroDash(world, p, bx, bz) {
  const kit = kitOf(p), k = KIT[kit] || KIT.sword;
  p.dodgeCd = TORNADO.cooldown; p.dodgeTimer = DASH.duration; p.attackTimer = 0;
  p.invuln = DASH.invuln * (p.loadout.shield ? DASH.shieldInvulnMult : 1);
  const dmg = p.stats.weapon.damage * damageMult(p);
  // Alan etkisi silaha göre (kılıç fırtınası / kazık alanı / ok yağmuru); atlı setlerde üstüne vakum biner.
  const weapon = p.loadout.weapon, base = KIT[weapon] || KIT.sword;
  const kind = base === KIT.sword ? 'blades' : base === KIT.spear ? 'spikes' : 'rain';
  spawnField(world, p, base, dmg, kind, k.vacuum || null);
}


/**
 * Durduğun yerde açılan alan etkisi (üç yakın dövüş / okçu setinde aynı mantık): kind 'blades' (Kılıçlı: savrulan kılıçlar),
 * 'spikes' (Mızraklı: yerden yükselen kazıklar) ya da 'rain' (Okçu: gökten ok yağmuru). fieldLife boyunca fieldTick'te bir
 * yarıçaptaki bütün düşmanlara (birim ve yapı) vurur.
 */
const FIELD_COLOR = { blades: '#ffe9a8', spikes: '#d9c98a', rain: '#ffd86b' };
function spawnField(world, p, k, dmg, kind, vacuum = null) {
  const radius = k.fieldRadius * dashMult(p), x = p.pos.x, z = p.pos.z;
  const g = new T.Group(), mats = [], stakes = [], blades = [], sparks = [];
  if (vacuum) {
    // Vakum kıvılcımları: çekme yarıçapından merkeze süzülen küçük noktalar (görsel).
    const vr = radius * vacuum.radius;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4, r = vr * (0.7 + Math.random() * 0.3);
      const m = new T.Mesh(new T.SphereGeometry(0.09, 6, 5), new T.MeshBasicMaterial({ color: FIELD_COLOR[kind], transparent: true, opacity: 0.9, depthWrite: false }));
      m.position.set(Math.sin(a) * r, 0.5 + Math.random() * 1.2, Math.cos(a) * r);
      mats.push({ m: m.material, o: 0.9 }); sparks.push({ m, x0: m.position.x, z0: m.position.z, y0: m.position.y, delay: Math.random() * 0.15 });
      g.add(m);
    }
    ring(world, x, z, FIELD_COLOR[kind], vr, vacuum.life);
  }
  const base = new T.Mesh(new T.RingGeometry(radius * 0.55, radius, 40),
    new T.MeshBasicMaterial({ color: FIELD_COLOR[kind], transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.07; mats.push({ m: base.material, o: 0.4 }); g.add(base);
  if (kind === 'blades') {
    // Savrulan kılıçlar: her biri kendi yarıçapında ve hızında merkez çevresinde döner, yükselip alçalır ve takla atar.
    for (let i = 0; i < k.blades; i++) {
      const item = new T.Group();
      const blade = new T.Mesh(new T.BoxGeometry(0.09, 0.035, 1.05), new T.MeshBasicMaterial({ color: '#e8eef5', transparent: true, opacity: 0.95, depthWrite: false }));
      blade.position.z = 0.35;
      const guard = new T.Mesh(new T.BoxGeometry(0.34, 0.06, 0.07), new T.MeshBasicMaterial({ color: '#c9a13d', transparent: true, opacity: 0.95, depthWrite: false }));
      guard.position.z = -0.2;
      const grip = new T.Mesh(new T.BoxGeometry(0.07, 0.07, 0.3), new T.MeshBasicMaterial({ color: '#5a3a24', transparent: true, opacity: 0.95, depthWrite: false }));
      grip.position.z = -0.38;
      item.add(blade, guard, grip);
      mats.push({ m: blade.material, o: 0.95 }, { m: guard.material, o: 0.95 }, { m: grip.material, o: 0.95 });
      blades.push({ item, a0: (i / k.blades) * Math.PI * 2, r: radius * (0.35 + 0.6 * ((i * 7) % k.blades) / k.blades), w: (i % 2 ? 1 : -1) * (5 + (i % 3) * 1.4), h: 0.7 + (i % 4) * 0.35, phase: i * 1.3, tumble: 6 + (i % 3) * 2 });
      g.add(item);
    }
  } else if (kind === 'spikes') {
    // Kazıklar: yarıçapa dağılmış, hafif eğik ahşap kazıklar; ilk 0.3 sn yerden yükselir, sonda geri gömülür.
    for (let i = 0; i < k.stakes; i++) {
      const a = (i / k.stakes) * Math.PI * 2 + (i % 2) * 0.2, r = radius * (i % 3 === 0 ? 0.35 : i % 3 === 1 ? 0.65 : 0.92);
      const shaft = new T.Mesh(new T.BoxGeometry(0.14, 1.9, 0.14), new T.MeshBasicMaterial({ color: '#8b6a3f', transparent: true, opacity: 0.95, depthWrite: false }));
      const tip = new T.Mesh(new T.ConeGeometry(0.14, 0.4, 5), new T.MeshBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.95, depthWrite: false }));
      tip.position.y = 1.15; shaft.position.y = 0;
      const item = new T.Group(); item.add(shaft, tip);
      item.position.set(Math.sin(a) * r, -1.2, Math.cos(a) * r);
      item.rotation.set((Math.random() - 0.5) * 0.4, a, (Math.random() - 0.5) * 0.4);
      mats.push({ m: shaft.material, o: 0.95 }, { m: tip.material, o: 0.95 });
      stakes.push(item); g.add(item);
    }
  }
  g.position.set(x, 0, z);
  world.scene.add(g);
  world.zones.push({ kind, source: p, faction: p.faction, g, mats, stakes, blades, sparks, vacuum: vacuum ? { radius: radius * vacuum.radius, life: vacuum.life, maxLife: vacuum.life, pull: vacuum.pull } : null, x, z, radius, life: k.fieldLife, maxLife: k.fieldLife, tick: 0, tickEvery: k.fieldTick, damage: dmg * k.fieldDamage, knock: k.fieldKnock, arrows: heroArrows(p) });
  burst(world, x, 0.6, z, FIELD_COLOR[kind], 10, 0.12);
}

/** Alan etkisinin bir vuruşu: yarıçaptaki düşman birim ve yapılara hasar; okçuda gökten inen ok görselleri. */
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
  if (z.kind === 'rain') {
    const count = Math.min(16, 3 + z.arrows);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.radius;
      const m = new T.Mesh(new T.BoxGeometry(0.06, 0.9, 0.06), new T.MeshBasicMaterial({ color: '#65482f', transparent: true, opacity: 0.95, depthWrite: false }));
      m.position.set(z.x + Math.sin(a) * r, 7 + Math.random() * 2, z.z + Math.cos(a) * r);
      world.scene.add(m);
      world.effects.push({ m, life: 0.3, maxLife: 0.3, rise: -26, mats: [m.material] });
    }
  }
}

/** Süreli set etkileri: kılıç fırtınası, kazık alanı, ok yağmuru (atlıda vakumlu). */
export function updateZones(world, dt) {
  const list = world.zones;
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i], e = z.source;
    z.life -= dt;
    if (!e.alive) { dispose(world, z); list.splice(i, 1); continue; }
    if (z.kind === 'blades' || z.kind === 'spikes' || z.kind === 'rain') {
      const k = Math.max(0, z.life) / z.maxLife, age = z.maxLife - z.life;
      // Kazıklar ilk 0.3 sn yerden çıkar, son 0.3 sn geri gömülür; halka ve kazıklar sonda söner.
      if (z.stakes.length) { const up = Math.min(1, age / 0.3, Math.max(0, z.life) / 0.3); for (const st of z.stakes) st.position.y = -1.2 + up * 2.15; }
      // Kılıçlar: ilk 0.25 sn merkezden dışa saçılır, sonra kendi yarıçaplarında döner, dalgalanır ve takla atar.
      if (z.blades.length) {
        const out = Math.min(1, age / 0.25);
        for (const b of z.blades) {
          const a = b.a0 + age * b.w, r = b.r * out;
          b.item.position.set(Math.sin(a) * r, b.h + Math.sin(age * 4 + b.phase) * 0.45, Math.cos(a) * r);
          // Uç dönüş yönüne bakar (yatay savrulma), gövde uzun ekseni etrafında takla atar.
          b.item.rotation.set(Math.sin(age * 2.3 + b.phase) * 0.6, a + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2), age * b.tumble);
        }
      }
      // Vakum (atlı setler): ilk vacuum.life sn boyunca çekme yarıçapındaki düşmanlar merkeze çekilir (kütleden bağımsız).
      if (z.vacuum && z.vacuum.life > 0) {
        const v = z.vacuum; v.life -= dt;
        for (const t of world.entities) {
          if (t === e || !t.alive || t.faction === z.faction || t.isWorker) continue;
          const dx = z.x - t.pos.x, dz = z.z - t.pos.z, d = Math.hypot(dx, dz);
          if (d > v.radius || d < 0.4) continue;
          applyImpulse(t, dx / d, dz / d, v.pull * dt / t.invMass);
        }
        const prog = 1 - Math.max(0, v.life) / v.maxLife;
        for (const sp of z.sparks) { const q = Math.min(1, Math.max(0, (prog - sp.delay) / (1 - sp.delay))); sp.m.position.set(sp.x0 * (1 - q), sp.y0 + q * 0.4, sp.z0 * (1 - q)); sp.m.material.opacity = 0.9 * (1 - q * q); }
      } else for (const sp of z.sparks) sp.m.material.opacity = 0;
      const fade = k < 0.2 ? k / 0.2 : 1;
      for (const it of z.mats) if (!z.sparks.some(sp => sp.m.material === it.m)) it.m.opacity = it.o * fade;
      z.tick -= dt;
      if (z.tick <= 0 && z.life > 0) { z.tick = z.tickEvery; fieldTick(world, z); }
    } else if (z.kind === 'volley') {
      // Hızlı yaylımın kalan atışları: her biri normal sol tık atışıdır ve o anki nişana gider.
      z.tick -= dt;
      if (z.tick <= 0 && z.left > 0) { z.tick = z.gap; z.left--; burstVolley(world, e); }
    }
    if (z.life <= 0) { dispose(world, z); list.splice(i, 1); }
  }
}

function dispose(world, z) {
  if (!z.g) return;
  world.scene.remove(z.g);
  z.g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  for (const it of z.mats) it.m.dispose();
}
