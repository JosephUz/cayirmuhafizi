import * as T from 'three';
import { ballGeo, mat } from '../builders.js';
import { PERF } from '../config.js';
import { rrand } from '../rng.js';

/**
 * Parçacık efektleri (yalnızca tarayıcı): patlama, genişleyen halka, can baloncuğu, şerit ve gökten inen ok görselleri.
 * world.effects listesinde yaşar, updateEffects her karede ilerletir. Ekran dışında yaratılmaz (world.inView).
 */
export function burst(world, x, y, z, color, count = 6, size = 0.1) {
  if (world.inView && !world.inView(x, z, 2)) return;
  const room = PERF.effectsMax - world.effects.length;
  if (room <= 0) return;
  if (count > room) count = room;
  for (let i = 0; i < count; i++) {
    const m = new T.Mesh(ballGeo, mat(color));
    m.position.set(x, y, z); m.scale.setScalar(size); m.castShadow = false;
    world.scene.add(m);
    world.effects.push({ m, life: 0.45, v: new T.Vector3(rrand(-2, 2), rrand(1, 3), rrand(-2, 2)), size });
  }
}

/** Can baloncuğu: kahramanın tepesinden çıkıp yükselerek sönen küçük yeşil küre (üstünde beyaz artı). */
export function healBubble(world, x, y, z) {
  if (world.inView && !world.inView(x, z, 2)) return;
  const g = new T.Group();
  const bodyMat = new T.MeshBasicMaterial({ color: '#7ee787', transparent: true, opacity: 0.85, depthWrite: false });
  const b = new T.Mesh(ballGeo, bodyMat); b.scale.setScalar(0.22); g.add(b);
  const crossMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false });
  const bar1 = new T.Mesh(new T.BoxGeometry(0.22, 0.07, 0.07), crossMat); g.add(bar1);
  const bar2 = new T.Mesh(new T.BoxGeometry(0.07, 0.22, 0.07), crossMat); g.add(bar2);
  g.position.set(x + rrand(-0.45, 0.45), y, z + rrand(-0.45, 0.45));
  world.scene.add(g);
  world.effects.push({ m: g, life: 0.95, maxLife: 0.95, rise: rrand(1.3, 2.1), mats: [bodyMat, crossMat] });
}

/** Yere paralel genişleyen halka. Geometri paylaşılır; ekran dışında yaratılmaz. */
const ringGeo = new T.RingGeometry(0.7, 1, 40);
export function ring(world, x, z, color, radius, life = 0.5) {
  if (world.inView && !world.inView(x, z, radius)) return;
  const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); m.scale.setScalar(0.3);
  world.scene.add(m);
  world.effects.push({ m, life, maxLife: life, ring: radius });
}

/** Yerden az yukarıda, yön boyunca uzanan ve sönen parlak şerit (mızrak şarj dalgası). */
export function strip(world, x, z, ux, uz, len, width, color, life) {
  const m = new T.Mesh(new T.BoxGeometry(width, 0.08, len), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.set(x + ux * len / 2, 1.0, z + uz * len / 2);
  m.rotation.y = Math.atan2(ux, uz);
  world.scene.add(m);
  world.effects.push({ m, life, maxLife: life, fade: 0.85 });
}

/** Ok yağmuru görseli: gökten yarıçapa inen kısa oklar (yalnızca görsel; hasar zone tick'inde). */
export function rainArrows(world, x, z, radius, count) {
  if (world.inView && !world.inView(x, z, radius)) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    const m = new T.Mesh(new T.BoxGeometry(0.06, 0.9, 0.06), new T.MeshBasicMaterial({ color: '#65482f', transparent: true, opacity: 0.95, depthWrite: false }));
    m.position.set(x + Math.sin(a) * r, 7 + Math.random() * 2, z + Math.cos(a) * r);
    world.scene.add(m);
    world.effects.push({ m, life: 0.3, maxLife: 0.3, rise: -26, mats: [m.material] });
  }
}

export function updateEffects(world, dt) {
  const fx = world.effects;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.rise) {
      f.m.position.y += f.rise * dt;
      const k = Math.max(0, f.life) / f.maxLife;
      for (const mt of f.mats) mt.opacity = k * 0.9;
      f.m.scale.setScalar(0.85 + (1 - k) * 0.5);
      if (f.life <= 0) { world.scene.remove(f.m); for (const mt of f.mats) mt.dispose(); fx.splice(i, 1); }
      continue;
    }
    if (f.fade) {
      f.m.material.opacity = f.fade * Math.max(0, f.life) / f.maxLife;
      if (f.life <= 0) { world.scene.remove(f.m); f.m.material.dispose(); f.m.geometry.dispose(); fx.splice(i, 1); }
      continue;
    }
    if (f.ring) {
      const k = 1 - Math.max(0, f.life) / f.maxLife;
      f.m.scale.setScalar(0.3 + k * f.ring); f.m.material.opacity = (1 - k) * 0.7;
      if (f.life <= 0) { world.scene.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); }
      continue;
    }
    f.m.position.addScaledVector(f.v, dt); f.v.y -= dt * 8;
    f.m.scale.setScalar(Math.max(0.01, f.life * 2.2 * f.size));
    if (f.life <= 0) { world.scene.remove(f.m); fx.splice(i, 1); }
  }
}

export function clearEffects(world) {
  for (const f of world.effects) world.scene.remove(f.m);
  world.effects.length = 0;
}
