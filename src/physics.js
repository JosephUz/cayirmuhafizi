import { BLOCK, GRAVITY, HALF, PHYSICS, SPRINT_MULT } from './config.js';

/**
 * Her gövdenin iki hızı var: kendi yürüyüş hızı (vel) ve darbe / çarpışma kaynaklı
 * itme (push). İkincisi kendi sürtünmesiyle söner; böylece bir vuruş karakteri
 * gerçekten savurur ama kontrolü tamamen kaybettirmez.
 */
export function integrate(entities, dt) {
  for (const e of entities) {
    if (!e.alive) { e.vel.set(0, 0, 0); decayPush(e, dt); applyVelocity(e, dt); continue; }

    // Sersemken ve savururken kontrol kısıtlı; kalkan yavaşlatır, koşu hızlandırır.
    // Vururken yavaşlama; bazı kahraman setleri (hücum, koşarken atış) yavaşlamaz (stats.attackControl = 1).
    const control = e.stun > 0 ? 0 : e.attackTimer > 0 ? (e.stats.attackControl != null ? e.stats.attackControl : e.stats.weapon.ranged ? 0.35 : 0.22) : 1;
    const mult = e.blocking ? BLOCK.speedMult : e.sprinting ? SPRINT_MULT : 1;
    const target = e.stats.speed * control * mult;
    const k = Math.exp(-e.stats.accel * dt);
    e.vel.x = e.moveDir.x * target + (e.vel.x - e.moveDir.x * target) * k;
    e.vel.z = e.moveDir.z * target + (e.vel.z - e.moveDir.z * target) * k;

    if (e.jumpY > 0 || e.vy !== 0) {
      e.vy -= GRAVITY * dt;
      e.jumpY += e.vy * dt;
      if (e.jumpY <= 0) { e.jumpY = 0; e.vy = 0; }
    }
    if (e.dodgeTimer > 0) e.dodgeTimer -= dt;
    if (e.dodgeCd > 0) e.dodgeCd -= dt;
    if (e.invuln > 0) e.invuln -= dt;

    decayPush(e, dt);
    applyVelocity(e, dt);
  }
}

function decayPush(b, dt) {
  const k = Math.exp(-PHYSICS.pushDrag * dt);
  b.push.x *= k; b.push.z *= k;
  if (Math.abs(b.push.x) < 0.001) b.push.x = 0;
  if (Math.abs(b.push.z) < 0.001) b.push.z = 0;
}

function applyVelocity(b, dt) {
  b.pos.x += (b.vel.x + b.push.x) * dt;
  b.pos.z += (b.vel.z + b.push.z) * dt;
}

/** Havadaki gövde hiçbir şeye takılmaz (zıplama). */
const airborne = e => e.jumpY > 0.05;

/** Daire-daire çarpışma: iç içe geçmeyi kütleye göre ayır, normal eksende impuls uygula. */
export function resolveEntityCollisions(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.isWorker || airborne(a)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      // İşçiler diğer birimlerle çarpışmaz; iç içe geçebilir.
      if (b.isWorker || airborne(b)) continue;
      const invSum = a.invMass + b.invMass;
      if (invSum === 0) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const minDist = (a.radius + b.radius) * PHYSICS.unitSpacing;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;

      let dist = Math.sqrt(distSq), nx, nz;
      if (dist < 1e-5) { const ang = Math.random() * Math.PI * 2; nx = Math.cos(ang); nz = Math.sin(ang); dist = 0; }
      else { nx = dx / dist; nz = dz / dist; }

      const push = ((minDist - dist) * PHYSICS.correction) / invSum;
      a.pos.x -= nx * push * a.invMass; a.pos.z -= nz * push * a.invMass;
      b.pos.x += nx * push * b.invMass; b.pos.z += nz * push * b.invMass;

      const rvx = b.vel.x + b.push.x - a.vel.x - a.push.x;
      const rvz = b.vel.z + b.push.z - a.vel.z - a.push.z;
      const vn = rvx * nx + rvz * nz;
      if (vn >= 0) continue;
      const impulse = (-(1 + PHYSICS.restitution) * vn) / invSum;
      a.push.x -= nx * impulse * a.invMass; a.push.z -= nz * impulse * a.invMass;
      b.push.x += nx * impulse * b.invMass; b.push.z += nz * impulse * b.invMass;
    }
  }
}

/** Sabit engeller (ağaç, ev, yapılar): gövdeyi dışarı it, içe doğru hızı öldür. Havadayken geçilir. */
export function resolveObstacleCollisions(list, obstacles) {
  for (const e of list) {
    if (airborne(e)) continue;
    for (const o of obstacles) {
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const minDist = e.radius + o.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;
      let dist = Math.sqrt(distSq), nx, nz;
      if (dist < 1e-5) { nx = 1; nz = 0; } else { nx = dx / dist; nz = dz / dist; }
      e.pos.x = o.pos.x + nx * minDist; e.pos.z = o.pos.z + nz * minDist;
      const vn = e.vel.x * nx + e.vel.z * nz;
      if (vn < 0) { e.vel.x -= nx * vn; e.vel.z -= nz * vn; }
      const pn = e.push.x * nx + e.push.z * nz;
      if (pn < 0) { e.push.x -= nx * pn * (1 + PHYSICS.restitution); e.push.z -= nz * pn * (1 + PHYSICS.restitution); }
    }
  }
}

/** Harita sınırı: konumu kıs, hızı yansıt. */
export function clampBounds(list) {
  for (const b of list) {
    const limit = HALF - b.radius;
    if (b.pos.x > limit) { b.pos.x = limit; if (b.push.x > 0) b.push.x *= -PHYSICS.restitution; if (b.vel.x > 0) b.vel.x = 0; }
    else if (b.pos.x < -limit) { b.pos.x = -limit; if (b.push.x < 0) b.push.x *= -PHYSICS.restitution; if (b.vel.x < 0) b.vel.x = 0; }
    if (b.pos.z > limit) { b.pos.z = limit; if (b.push.z > 0) b.push.z *= -PHYSICS.restitution; if (b.vel.z > 0) b.vel.z = 0; }
    else if (b.pos.z < -limit) { b.pos.z = -limit; if (b.push.z < 0) b.push.z *= -PHYSICS.restitution; if (b.vel.z < 0) b.vel.z = 0; }
  }
}

/** Anlık itme; kütleyle ölçeklenir. */
export function applyImpulse(b, dirX, dirZ, strength) {
  b.push.x += dirX * strength * b.invMass;
  b.push.z += dirZ * strength * b.invMass;
}
