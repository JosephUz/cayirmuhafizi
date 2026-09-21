import * as T from '/vendor/three.module.js';
import { DASH, KIT, TORNADO } from './config.js';
import { dashMult, isEvading, kitOf, reachOf } from './characters.js';
import { burst, damageEntity, damageMult, damageStructure, fireArrow, heroArrows, hitDamage, ring, spawnSpin } from './combat.js';

/**
 * Kahraman yetenek setleri (bkz. config KIT): set silah x at ile belirlenir, kalkan atılma vurulmazlığını uzatır.
 *  - Sol tık: silahın kendi vuruşunun (yay / ok) **üstüne** sete özel etki: Kılıçlı girdap (dönen bıçak çemberi),
 *    Mızraklı saplama (uzun şerit), Okçu yelpaze yaylımı, Kılıçlı Atlı geniş kesik (silah değerlerinde), Mızraklı Atlı
 *    hücum (hıza bağlı hasar, characters.chargeMult), Atlı Okçu koşarken çift ok.
 *  - Sağ tık: her sette **ileri atılma** + sete özel ikinci etki: kılıç fırtınası, kazık alanı, ok yağmuru (üçü de durduğun
 *    yerde 2 sn süren alan), yarıp geçme, mızrak hücumu, geriye yaylım. Süreli etkiler world.zones listesinde yaşar (updateZones).
 */

/** Sol tık: silah vuruşundan sonra sete özel ek etki. */
export function heroPrimary(world, e) {
  const kit = kitOf(e);
  if (kit === 'sword') spawnSpin(world, e);
  else if (kit === 'spear') spearThrust(world, e);
  // bow / horsebow: yaylım heroVolley'de; horsesword / horsespear: silah değerleri (yay, itme) ve chargeMult.
}

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

/** Mızraklı: saplama. Bakış yönünde menzilin thrustLen katı uzunlukta ince şerit; yayın dışında kalanları deler. */
function spearThrust(world, e) {
  const k = KIT.spear, r = reachOf(e), len = r.range * k.thrustLen, half = k.thrustWidth / 2;
  const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
  const dmg = e.stats.weapon.damage * damageMult(e) * k.thrustDamage;
  for (const t of world.entities) {
    if (t === e || !t.alive || t.faction === e.faction || isEvading(t)) continue;
    const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z;
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    // Yakındakiler zaten yay vuruşunda vurulmuştur: şerit menzilin ötesini deler.
    if (along < r.range * 0.8 || along > len || side > half + t.radius) continue;
    damageEntity(world, t, hitDamage(e, t, dmg), fx, fz, e.stats.weapon.knockback * 0.5, e);
  }
  for (const s of world.structures) {
    if (!s.alive || s.faction === e.faction) continue;
    const dx = s.pos.x - e.pos.x, dz = s.pos.z - e.pos.z;
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (along < r.range * 0.8 || along > len + s.radius || side > half + s.radius) continue;
    damageStructure(world, s, dmg, e);
  }
  strip(world, e.pos.x, e.pos.z, fx, fz, len, 0.28, '#ffe9a8', 0.3);
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
 * Sağ tık: atılma zamanlayıcıları + sete özel ikinci etki. (bx, bz) atılma yönü. Çağıran ardından itmeyi uygular.
 * Kalkanlı setlerde vurulmazlık DASH.shieldInvulnMult kat uzundur.
 */
export function heroDash(world, p, bx, bz) {
  const kit = kitOf(p), k = KIT[kit] || KIT.sword;
  p.dodgeCd = TORNADO.cooldown; p.dodgeTimer = DASH.duration; p.attackTimer = 0;
  p.invuln = DASH.invuln * (p.loadout.shield ? DASH.shieldInvulnMult : 1);
  const dmg = p.stats.weapon.damage * damageMult(p);
  switch (kit) {
    case 'spear': spawnField(world, p, k, dmg, 'spikes'); break;
    case 'bow': spawnField(world, p, k, dmg, 'rain'); break;
    case 'horsesword':
      world.zones.push({ kind: 'trail', source: p, faction: p.faction, life: Math.max(DASH.duration, k.trailLife), hit: new Set(), damage: dmg * k.trailDamage, radius: k.trailRadius, x0: p.pos.x, z0: p.pos.z, knock: p.stats.weapon.knockback });
      break;
    case 'horsespear':
      world.zones.push({ kind: 'impact', source: p, faction: p.faction, life: DASH.duration + 0.02, damage: dmg * k.impactDamage, k });
      break;
    case 'horsebow': parthian(world, p, bx, bz, k); break;
    default: spawnField(world, p, k, dmg, 'blades');
  }
}

/**
 * Durduğun yerde açılan alan etkisi (üç yakın dövüş / okçu setinde aynı mantık): kind 'blades' (Kılıçlı: savrulan kılıçlar),
 * 'spikes' (Mızraklı: yerden yükselen kazıklar) ya da 'rain' (Okçu: gökten ok yağmuru). fieldLife boyunca fieldTick'te bir
 * yarıçaptaki bütün düşmanlara (birim ve yapı) vurur.
 */
const FIELD_COLOR = { blades: '#ffe9a8', spikes: '#d9c98a', rain: '#ffd86b' };
function spawnField(world, p, k, dmg, kind) {
  const radius = k.fieldRadius * dashMult(p), x = p.pos.x, z = p.pos.z;
  const g = new T.Group(), mats = [], stakes = [], blades = [];
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
  world.zones.push({ kind, source: p, faction: p.faction, g, mats, stakes, blades, x, z, radius, life: k.fieldLife, maxLife: k.fieldLife, tick: 0, tickEvery: k.fieldTick, damage: dmg * k.fieldDamage, knock: k.fieldKnock, arrows: heroArrows(p) });
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

/** Atlı okçu: atılırken arkaya (geldiği yöne) seviyesi kadar takipli ok. */
function parthian(world, p, bx, bz, k) {
  const n = heroArrows(p), fan = Math.min(k.backFan, k.fanStep * 2 * (n - 1)) * Math.PI / 180;
  const base = Math.atan2(-bx, -bz), range = reachOf(p).range, cosTol = Math.cos(k.homingDeg * 2 * Math.PI / 180);
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i / (n - 1) - 0.5) * fan : 0);
    const d = new T.Vector3(Math.sin(a), 0, Math.cos(a));
    fireArrow(world, p, d, hostileAlong(world, p, d.x, d.z, range * 1.1, cosTol), 1, 0);
  }
}

/** Süreli set etkileri: kılıç fırtınası, kazık alanı, ok yağmuru, yarıp geçme, mızrak hücumu. */
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
      const fade = k < 0.2 ? k / 0.2 : 1;
      for (const it of z.mats) it.m.opacity = it.o * fade;
      z.tick -= dt;
      if (z.tick <= 0 && z.life > 0) { z.tick = z.tickEvery; fieldTick(world, z); }
    } else if (z.kind === 'trail') {
      // Atılma boyunca yolda geçilen her düşmana bir kez vurulur; itme geçiş yönüne dik (yana savurur).
      const vx = e.vel.x + e.push.x, vz = e.vel.z + e.push.z, sp = Math.hypot(vx, vz) || 1;
      const ux = vx / sp, uz = vz / sp;
      for (const t of world.entities) {
        if (t === e || !t.alive || t.faction === z.faction || z.hit.has(t) || isEvading(t)) continue;
        const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d > z.radius + t.radius) continue;
        z.hit.add(t);
        const side = dx * uz - dz * ux >= 0 ? 1 : -1;
        damageEntity(world, t, hitDamage(e, t, z.damage), uz * side, -ux * side, z.knock, e);
        burst(world, t.pos.x, 1.1, t.pos.z, '#ffe9a8', 6, 0.1);
      }
      for (const s of world.structures) {
        if (!s.alive || s.faction === z.faction || z.hit.has(s)) continue;
        if (Math.hypot(s.pos.x - e.pos.x, s.pos.z - e.pos.z) > z.radius + s.radius) continue;
        z.hit.add(s); damageStructure(world, s, z.damage, e);
      }
      if (z.life <= 0) { const dx = e.pos.x - z.x0, dz = e.pos.z - z.z0, len = Math.hypot(dx, dz); if (len > 0.5) strip(world, z.x0, z.z0, dx / len, dz / len, len, 0.5, '#ffe9a8', 0.35); }
    } else if (z.kind === 'impact' && z.life <= 0) {
      // Atılma bitti: vardığı noktada önüne koni vuruşu (2x hasar, sert itme).
      const k = z.k, r = reachOf(e).range * k.impactRange, cosHalf = Math.cos(k.impactArc / 2);
      const fx = Math.sin(e.facing), fz = Math.cos(e.facing), knock = e.stats.weapon.knockback * k.impactKnock;
      for (const t of world.entities) {
        if (t === e || !t.alive || t.faction === z.faction || isEvading(t)) continue;
        const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d > r + t.radius || (fx * dx + fz * dz) / d < cosHalf) continue;
        damageEntity(world, t, hitDamage(e, t, z.damage), dx / d, dz / d, knock, e);
      }
      for (const s of world.structures) {
        if (!s.alive || s.faction === z.faction) continue;
        const dx = s.pos.x - e.pos.x, dz = s.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d > r + s.radius || (fx * dx + fz * dz) / d < cosHalf * 0.6) continue;
        damageStructure(world, s, z.damage, e);
      }
      ring(world, e.pos.x + fx * r * 0.5, e.pos.z + fz * r * 0.5, '#ffd27a', r, 0.4);
      burst(world, e.pos.x + fx * 1.2, 1, e.pos.z + fz * 1.2, '#ffd27a', 12, 0.12);
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
