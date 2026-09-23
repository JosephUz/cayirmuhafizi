import * as T from 'three';
import { FIELD_COLOR } from '../abilities.js';
import { SPIN, TORNADO } from '../config.js';
import { rrand } from '../rng.js';
import { rainArrows } from './effects.js';

/**
 * Bölge görünümleri (yalnızca tarayıcı): dönerek vuruş çemberi (spin), hortum (tornado) ve alan etkileri (blades / spikes /
 * rain, atlıda vakum kıvılcımları). Simülasyon verisinden (kind, x, z, radius, life, maxLife, vacuum) her karede çizilir;
 * görsel saatler (dönüş açısı, yaş) görünümün kendisinde tutulur.
 */
const spinShaftGeo = new T.BoxGeometry(0.05, 0.05, 0.8);
const spinTipGeo = new T.ConeGeometry(0.085, 0.22, 4);
const spinBladeGeo = new T.BoxGeometry(0.12, 0.06, 1.1);
const piece = (parent, geo, color, opacity, mats, z = 0) => {
  const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.position.z = z; mats.push({ m: m.material, o: opacity }); parent.add(m); return m;
};

export function attachZoneView(scene, z) {
  if (z.kind === 'burst') return null;
  const g = new T.Group(), mats = [], v = { g, mats, age: 0, spin: 0, stakes: [], blades: [], sparks: [] };
  if (z.kind === 'spin') {
    for (let i = 0; i < z.count; i++) {
      const a = (i / z.count) * Math.PI * 2, item = new T.Group();
      if (z.bow) { piece(item, spinShaftGeo, '#65482f', 0.95, mats); piece(item, spinTipGeo, '#ffd86b', 0.95, mats, 0.5).rotation.x = Math.PI / 2; }
      else piece(item, spinBladeGeo, '#ffe9a8', 0.9, mats);
      item.position.set(Math.sin(a) * z.radius, 1.05, Math.cos(a) * z.radius); item.rotation.y = a; g.add(item);
    }
    const ringMesh = new T.Mesh(new T.RingGeometry(z.radius * 0.92, z.radius, 44), new T.MeshBasicMaterial({ color: z.bow ? '#ffd86b' : '#ffe9a8', transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
    ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.y = 0.07; mats.push({ m: ringMesh.material, o: 0.35 }); g.add(ringMesh);
  } else if (z.kind === 'tornado') {
    for (let i = 0; i < TORNADO.rings; i++) {
      const k = i / (TORNADO.rings - 1), o = 0.55 - k * 0.22;
      const m = new T.Mesh(new T.TorusGeometry(z.radius * (0.22 + k * 0.85), z.radius * 0.06 + 0.04, 6, 22), new T.MeshBasicMaterial({ color: k < 0.5 ? '#e2e8f0' : '#9fb4cc', transparent: true, opacity: o, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(rrand(-0.14, 0.14), 0.22 + k * TORNADO.height, rrand(-0.14, 0.14));
      mats.push({ m: m.material, o }); g.add(m);
    }
    const base = new T.Mesh(new T.RingGeometry(z.radius * 0.5, z.radius, 40), new T.MeshBasicMaterial({ color: '#e8e2c6', transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.07; mats.push({ m: base.material, o: 0.45 }); g.add(base);
  } else {
    const color = FIELD_COLOR[z.kind] || '#ffe9a8';
    if (z.vacuum) {
      const vr = z.vacuum.radius;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4, r = vr * (0.7 + Math.random() * 0.3);
        const m = new T.Mesh(new T.SphereGeometry(0.09, 6, 5), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
        m.position.set(Math.sin(a) * r, 0.5 + Math.random() * 1.2, Math.cos(a) * r);
        v.sparks.push({ m, x0: m.position.x, z0: m.position.z, y0: m.position.y, delay: Math.random() * 0.15 }); g.add(m);
      }
    }
    const base = new T.Mesh(new T.RingGeometry(z.radius * 0.55, z.radius, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.07; mats.push({ m: base.material, o: 0.4 }); g.add(base);
    if (z.kind === 'blades') {
      for (let i = 0; i < z.blades; i++) {
        const item = new T.Group();
        const blade = new T.Mesh(new T.BoxGeometry(0.09, 0.035, 1.05), new T.MeshBasicMaterial({ color: '#e8eef5', transparent: true, opacity: 0.95, depthWrite: false })); blade.position.z = 0.35;
        const guard = new T.Mesh(new T.BoxGeometry(0.34, 0.06, 0.07), new T.MeshBasicMaterial({ color: '#c9a13d', transparent: true, opacity: 0.95, depthWrite: false })); guard.position.z = -0.2;
        const grip = new T.Mesh(new T.BoxGeometry(0.07, 0.07, 0.3), new T.MeshBasicMaterial({ color: '#5a3a24', transparent: true, opacity: 0.95, depthWrite: false })); grip.position.z = -0.38;
        item.add(blade, guard, grip);
        mats.push({ m: blade.material, o: 0.95 }, { m: guard.material, o: 0.95 }, { m: grip.material, o: 0.95 });
        v.blades.push({ item, a0: (i / z.blades) * Math.PI * 2, r: z.radius * (0.35 + 0.6 * ((i * 7) % z.blades) / z.blades), w: (i % 2 ? 1 : -1) * (5 + (i % 3) * 1.4), h: 0.7 + (i % 4) * 0.35, phase: i * 1.3, tumble: 6 + (i % 3) * 2 });
        g.add(item);
      }
    } else if (z.kind === 'spikes') {
      for (let i = 0; i < z.stakes; i++) {
        const a = (i / z.stakes) * Math.PI * 2 + (i % 2) * 0.2, r = z.radius * (i % 3 === 0 ? 0.35 : i % 3 === 1 ? 0.65 : 0.92);
        const shaft = new T.Mesh(new T.BoxGeometry(0.14, 1.9, 0.14), new T.MeshBasicMaterial({ color: '#8b6a3f', transparent: true, opacity: 0.95, depthWrite: false }));
        const tip = new T.Mesh(new T.ConeGeometry(0.14, 0.4, 5), new T.MeshBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.95, depthWrite: false }));
        tip.position.y = 1.15;
        const item = new T.Group(); item.add(shaft, tip);
        item.position.set(Math.sin(a) * r, -1.2, Math.cos(a) * r);
        item.rotation.set((Math.random() - 0.5) * 0.4, a, (Math.random() - 0.5) * 0.4);
        mats.push({ m: shaft.material, o: 0.95 }, { m: tip.material, o: 0.95 });
        v.stakes.push(item); g.add(item);
      }
    }
    v.rainTick = 0;
  }
  g.position.set(z.owner ? z.owner.pos.x : z.x, 0, z.owner ? z.owner.pos.z : z.z);
  scene.add(g);
  z.view = v;
  return v;
}

export function detachZoneView(z) {
  const v = z.view; if (!v) return;
  if (v.g.parent) v.g.parent.remove(v.g);
  v.g.traverse(o => { if (o.geometry && o.geometry.type !== 'BoxGeometry' && o.geometry !== spinShaftGeo && o.geometry !== spinTipGeo && o.geometry !== spinBladeGeo) o.geometry.dispose(); });
  for (const it of v.mats) it.m.dispose();
  for (const sp of v.sparks) sp.m.material.dispose();
  z.view = null;
}

/** Her karede: veriden görünüm. */
export function syncZoneView(world, z, dt) {
  const v = z.view; if (!v) return;
  v.age += dt;
  const k = Math.max(0, z.life) / z.maxLife;
  if (z.kind === 'spin') {
    const e = z.owner; if (e) v.g.position.set(e.pos.x, e.jumpY, e.pos.z);
    v.spin += dt * SPIN.spin; v.g.rotation.y = v.spin;
    for (const it of v.mats) it.m.opacity = it.o * (k < 0.3 ? k / 0.3 : 1);
    return;
  }
  if (z.kind === 'tornado') {
    v.spin += dt * TORNADO.spin;
    const grow = Math.min(1, (1 - k) * 5) * 0.35 + 0.65;
    v.g.scale.set(grow, grow, grow); v.g.rotation.y = v.spin;
    v.g.children.forEach((m, j) => { m.rotation.z = v.spin * (1 + j * 0.4); });
    const fade = k < 0.25 ? k / 0.25 : 1;
    for (const it of v.mats) it.m.opacity = it.o * fade;
    return;
  }
  const age = v.age;
  if (v.stakes.length) { const up = Math.min(1, age / 0.3, Math.max(0, z.life) / 0.3); for (const st of v.stakes) st.position.y = -1.2 + up * 2.15; }
  if (v.blades.length) {
    const out = Math.min(1, age / 0.25);
    for (const b of v.blades) {
      const a = b.a0 + age * b.w, r = b.r * out;
      b.item.position.set(Math.sin(a) * r, b.h + Math.sin(age * 4 + b.phase) * 0.45, Math.cos(a) * r);
      b.item.rotation.set(Math.sin(age * 2.3 + b.phase) * 0.6, a + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2), age * b.tumble);
    }
  }
  if (z.vacuum) {
    const prog = 1 - Math.max(0, z.vacuum.life) / z.vacuum.maxLife;
    for (const sp of v.sparks) { const q = Math.min(1, Math.max(0, (prog - sp.delay) / (1 - sp.delay))); sp.m.position.set(sp.x0 * (1 - q), sp.y0 + q * 0.4, sp.z0 * (1 - q)); sp.m.material.opacity = 0.9 * (1 - q * q); }
  }
  const fade = k < 0.2 ? k / 0.2 : 1;
  for (const it of v.mats) it.m.opacity = it.o * fade;
  if (z.kind === 'rain') {
    v.rainTick -= dt;
    if (v.rainTick <= 0 && z.life > 0) { v.rainTick = z.tickEvery || 0.25; rainArrows(world, z.x, z.z, z.radius, Math.min(16, 3 + (z.arrows || 1))); }
  }
}
