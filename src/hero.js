import { dampAngle, yawFromDir } from './builders.js';
import { startAttack } from './combat.js';
import { heroCharged, heroDash } from './abilities.js';
import { dashDistance } from './characters.js';
import { CHARGE, JUMP_AIR, JUMP_SPEED, PHYSICS } from './config.js';
import { applyImpulse } from './physics.js';

/**
 * Kahraman kontrolü, simülasyon tarafı. Girdi **çözülmüş** biçimde gelir (bkz. input.js resolveHeroInput): hareket yönü
 * dünya uzayındadır (kamera moduna göre istemci çözer), nişan zemin noktasıdır, tuşlar kenar / durum bayraklarıdır.
 * Tek başına oyunda istemci her adımda kendi girdisini çözer; çevrim içi oyunda aynı yapı ağdan gelir ve sunucu burada
 * uygular. Şarj zamanlaması simülasyon saatiyle (world.time) tutulur.
 *   mv: [dx, dz] hareket (birim vektör ya da 0), aim: [x, z] nişan, ha: nişan var, sp: koşu,
 *   aq: vuruş (kenar), ah: sol tık basılı, ar: sol tık bırakıldı (kenar), dq: atılma (kenar), jq: zıplama (kenar),
 *   yaw: kilitli omuz üstü bakış açısı, ly: yüz bakışa dönsün (kilitli omuz üstü).
 */
export function createHeroInput() {
  return { mv: [0, 0], aim: [0, 1], ha: false, sp: false, aq: false, ah: false, ar: false, dq: false, jq: false, yaw: 0, ly: false, heldAt: -1 };
}

/** Ağdan gelen girdiyi oyuncunun girdisine işler: kenar bayrakları **birikir** (paket arasında basılıp bırakılan tuş kaybolmaz). */
export function mergeHeroInput(dst, src) {
  if (Array.isArray(src.mv)) { dst.mv[0] = +src.mv[0] || 0; dst.mv[1] = +src.mv[1] || 0; }
  if (Array.isArray(src.aim)) { dst.aim[0] = +src.aim[0] || 0; dst.aim[1] = +src.aim[1] || 0; }
  dst.ha = Boolean(src.ha); dst.sp = Boolean(src.sp); dst.ah = Boolean(src.ah); dst.ly = Boolean(src.ly);
  dst.yaw = +src.yaw || 0;
  if (src.aq) dst.aq = true; if (src.ar) dst.ar = true; if (src.dq) dst.dq = true; if (src.jq) dst.jq = true;
}

export function applyHeroInput(world, player, dt) {
  const p = player.hero, inp = player.input;
  if (!p || !inp) return;
  if (!p.alive) {
    p.moveDir.set(0, 0, 0); p.blocking = false; p.sprinting = false; p.charging = false;
    inp.aq = inp.dq = inp.jq = inp.ar = false; inp.heldAt = -1;
    return;
  }
  let dx = inp.mv[0], dz = inp.mv[1];
  const len = Math.hypot(dx, dz);
  if (len > 1e-6) { dx /= len; dz /= len; } else { dx = 0; dz = 0; }
  const moving = len > 1e-6;
  p.moveDir.set(dx, 0, dz);
  const ax = inp.aim[0], az = inp.aim[1];

  // Kalkan tutma yok: sağ tık her kahraman türünde atılma + set etkisidir.
  p.blocking = false;
  p.sprinting = inp.sp && moving;

  // Sağ tık: imlece doğru ileri atılma + sete özel alan etkisi (bkz. abilities.heroDash). Mesafe seviyeyle büyür.
  if (inp.dq) {
    inp.dq = false;
    if (p.dodgeCd <= 0 && p.stun <= 0) {
      let bx = moving ? dx : Math.sin(p.facing), bz = moving ? dz : Math.cos(p.facing);
      if (inp.ha) { const vx = ax - p.pos.x, vz = az - p.pos.z, vd = Math.hypot(vx, vz); if (vd > 0.6) { bx = vx / vd; bz = vz / vd; } }
      p.facing = yawFromDir(bx, bz);
      heroDash(world, p, bx, bz);
      applyImpulse(p, bx, bz, dashDistance(p) * PHYSICS.pushDrag / p.invMass);
      world.fx.flash(player, 'dodge');
    }
  }
  if (inp.jq) {
    inp.jq = false;
    if (p.stun <= 0) {
      if (p.jumpY === 0 && p.vy === 0) { p.vy = JUMP_SPEED; p.airJumps = 0; }
      else if ((p.airJumps || 0) < JUMP_AIR.count) {
        // Havada ikinci zıplama: yeni hız verilir, yani yükseliş sıfırdan başlar ve tepe noktası yukarı taşınır.
        p.airJumps = (p.airJumps || 0) + 1;
        p.vy = JUMP_SPEED * JUMP_AIR.speedMult;
        world.fx.burst(p.pos.x, 0.4 + p.jumpY, p.pos.z, '#dff0ff', 8, 0.09);
      }
    }
  }

  // Şarjlı vuruş: sol tık CHARGE.delay sn'den uzun basılı kalırsa şarj dolar; bırakınca silaha özgü güçlü vuruş.
  if (inp.ah && inp.heldAt < 0) inp.heldAt = world.time;
  if (inp.ah && !p.charging && p.stun <= 0 && world.time - inp.heldAt >= CHARGE.delay) { p.charging = true; p.charge = 0; }
  if (p.charging) {
    if (!inp.ah && !inp.ar) p.charging = false;
    else p.charge = Math.min(1, (world.time - inp.heldAt - CHARGE.delay) / CHARGE.full);
  }
  if (inp.ar) {
    inp.ar = false; inp.heldAt = -1;
    if (p.charging) {
      const c = p.charge; p.charging = false;
      if (c >= CHARGE.minRelease && p.stun <= 0) { if (inp.ha) p.aim.set(ax, 0, az); heroCharged(world, p, c); }
    }
  }
  if (!inp.ah && !p.charging) inp.heldAt = -1;

  const locked = p.attackTimer > 0 && p.aimLocked && !p.charging;
  if (!locked) { p.aimLocked = false; p.aim.set(ax, 0, az); }
  if (locked) p.facing = dampAngle(p.facing, yawFromDir(p.aim.x - p.pos.x, p.aim.z - p.pos.z), 20, dt);
  else if (p.blocking || p.attackTimer > 0 || p.charging) { if (inp.ha) p.facing = dampAngle(p.facing, yawFromDir(ax - p.pos.x, az - p.pos.z), 14, dt); }
  else if (inp.ly) p.facing = dampAngle(p.facing, inp.yaw, 18, dt);
  else if (moving) p.facing = dampAngle(p.facing, yawFromDir(dx, dz), 16, dt);

  // Kahraman kendiliğinden vurmaz: yalnızca sol tıkla, tıklanan noktaya doğru; nişan vuruş boyunca kilitlenir.
  if (inp.aq) {
    inp.aq = false;
    if (inp.ha) {
      const vx = ax - p.pos.x, vz = az - p.pos.z;
      p.aim.set(ax, 0, az); p.aimLocked = true;
      if (Math.hypot(vx, vz) > 0.2) p.facing = yawFromDir(vx, vz);
    }
    startAttack(p);
  }
}
