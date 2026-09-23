import { BLOCK, CHARGE, GRAVITY, PHYSICS, SPRINT_MULT } from './config.js';

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
    const mult = (e.blocking ? BLOCK.speedMult : e.sprinting ? SPRINT_MULT : 1) * (e.charging ? CHARGE.speedMult : 1);
    const target = e.stats.speed * control * mult;
    const k = Math.exp(-e.stats.accel * dt);
    e.vel.x = e.moveDir.x * target + (e.vel.x - e.moveDir.x * target) * k;
    e.vel.z = e.moveDir.z * target + (e.vel.z - e.moveDir.z * target) * k;

    if (e.jumpY > 0 || e.vy !== 0) {
      e.vy -= GRAVITY * dt;
      e.jumpY += e.vy * dt;
      if (e.jumpY <= 0) { e.jumpY = 0; e.vy = 0; e.airJumps = 0; }
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

/** Hücre anahtarı: (i, j) çifti tek sayıya (|j| < 50000 olduğu sürece tekil). */
const cellKey = (i, j) => i * 100003 + j;

/**
 * Daire-daire çarpışma: iç içe geçmeyi kütleye göre ayır, normal eksende impuls uygula.
 * Gövdeler her adımda CELL_E boyutlu hücrelere dizilir ve yalnızca aynı ya da komşu hücredeki çiftler denenir: 5v5'te
 * yüzlerce birimle maliyet n² yerine n x komşu olur. En büyük çift mesafesi (0.9 + 0.9) x unitSpacing = 3.4 < CELL_E,
 * bu yüzden 3x3 komşuluk yeter. Hücreler havuzdan alınır (adım başına yeni dizi yaratılmaz).
 */
const CELL_E = 4;
const cellPool = [], cellMap = new Map();
let cellUsed = 0;
function takeCell(i, j) {
  let c = cellPool[cellUsed];
  if (!c) { c = { i: 0, j: 0, list: [] }; cellPool[cellUsed] = c; }
  cellUsed++;
  c.i = i; c.j = j; c.list.length = 0;
  return c;
}
/** Her çift bir kez denensin diye yalnızca "ileri" komşular: (+1,-1), (+1,0), (+1,+1), (0,+1). */
const FORWARD = [[1, -1], [1, 0], [1, 1], [0, 1]];
export function resolveEntityCollisions(list) {
  cellMap.clear(); cellUsed = 0;
  for (const a of list) {
    // İşçiler diğer birimlerle çarpışmaz; iç içe geçebilir.
    if (a.isWorker || airborne(a)) continue;
    const i = Math.floor(a.pos.x / CELL_E), j = Math.floor(a.pos.z / CELL_E), k = cellKey(i, j);
    let c = cellMap.get(k);
    if (!c) { c = takeCell(i, j); cellMap.set(k, c); }
    c.list.push(a);
  }
  for (let n = 0; n < cellUsed; n++) {
    const c = cellPool[n], l = c.list;
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) collidePair(l[i], l[j]);
    for (const [di, dj] of FORWARD) {
      const o = cellMap.get(cellKey(c.i + di, c.j + dj));
      if (!o) continue;
      const ol = o.list;
      for (let i = 0; i < l.length; i++) for (let j = 0; j < ol.length; j++) collidePair(l[i], ol[j]);
    }
  }
}

function collidePair(a, b) {
  const invSum = a.invMass + b.invMass;
  if (invSum === 0) return;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const minDist = (a.radius + b.radius) * PHYSICS.unitSpacing;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist) return;

  let dist = Math.sqrt(distSq), nx, nz;
  if (dist < 1e-5) { const ang = Math.random() * Math.PI * 2; nx = Math.cos(ang); nz = Math.sin(ang); dist = 0; }
  else { nx = dx / dist; nz = dz / dist; }

  const push = ((minDist - dist) * PHYSICS.correction) / invSum;
  a.pos.x -= nx * push * a.invMass; a.pos.z -= nz * push * a.invMass;
  b.pos.x += nx * push * b.invMass; b.pos.z += nz * push * b.invMass;

  const rvx = b.vel.x + b.push.x - a.vel.x - a.push.x;
  const rvz = b.vel.z + b.push.z - a.vel.z - a.push.z;
  const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return;
  const impulse = (-(1 + PHYSICS.restitution) * vn) / invSum;
  a.push.x -= nx * impulse * a.invMass; a.push.z -= nz * impulse * a.invMass;
  b.push.x += nx * impulse * b.invMass; b.push.z += nz * impulse * b.invMass;
}

/**
 * Sabit engeller (ağaç, ev, yapılar): gövdeyi dışarı it, içe doğru hızı öldür. Havadayken geçilir.
 * Engeller CELL boyutlu hücre ızgarasına dizilir ve her gövde yalnızca 3x3 komşu hücreye bakar: büyük
 * arenada (5v5'te binlerce ağaç) maliyet gövde sayısıyla, engel sayısıyla değil büyür. En büyük engel yarıçapı
 * (kamp 2.2) + en büyük gövde (0.9) hücre boyunun altında kaldığı için komşuluk yeter.
 * Izgara engel listesi değişmedikçe (aynı dizi, aynı sürüm; bkz. structures.js world.obstacleVersion) yeniden kurulmaz.
 */
const CELL = 8;
let obstacleCache = { src: null, version: -1, grid: null };
function obstacleGrid(obstacles, version) {
  if (obstacleCache.src === obstacles && obstacleCache.version === version) return obstacleCache.grid;
  const grid = new Map();
  for (const o of obstacles) {
    const k = cellKey(Math.floor(o.pos.x / CELL), Math.floor(o.pos.z / CELL));
    let cell = grid.get(k);
    if (!cell) { cell = []; grid.set(k, cell); }
    cell.push(o);
  }
  obstacleCache = { src: obstacles, version, grid };
  return grid;
}
export function resolveObstacleCollisions(list, obstacles, version = 0) {
  const grid = obstacleGrid(obstacles, version);
  for (const e of list) {
    if (airborne(e)) continue;
    const ci = Math.floor(e.pos.x / CELL), cj = Math.floor(e.pos.z / CELL);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const cell = grid.get(cellKey(i, j));
      if (!cell) continue;
      for (const o of cell) {
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
}

/** Harita sınırı (arena yarı boyu `half`): konumu kıs, hızı yansıt. */
export function clampBounds(list, half) {
  for (const b of list) {
    const limit = half - b.radius;
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
