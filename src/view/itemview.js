import * as T from 'three';
import { CulledGroup, ball, ballGeo, box, boxGeo, mesh, removeGroup } from '../builders.js';
import { itemColor } from '../economy.js';

/** Yerdeki eşya görünümü (altın, odun, yiyecek, exp küresi) ve oklar (yalnızca tarayıcı). */
export function attachItemView(scene, it) {
  const g = new CulledGroup(); g.position.copy(it.pos); g.rotation.y = Math.random() * 6;
  if (it.kind === 'gold') {
    ball(g, '#f3c53d', 0, 0.28, 0, 0.32, 0.26, 0.3); ball(g, '#e2ad2c', 0.25, 0.2, 0.15, 0.2, 0.18, 0.2); ball(g, '#f7d76a', -0.2, 0.18, -0.15, 0.16);
  } else if (it.kind === 'wood') {
    box(g, '#7a5433', 0, 0.2, 0, 0.32, 0.32, 1.3);
    box(g, '#8c6238', 0.3, 0.2, 0.1, 0.3, 0.3, 1.1);
    for (const z of [-0.65, 0.65]) mesh(g, new T.CircleGeometry(0.16, 8), '#d8b78a', 0, 0.2, z).rotation.y = z > 0 ? 0 : Math.PI;
  } else if (it.kind === 'xp') {
    ball(g, '#c48bff', 0, 0.42, 0, 0.26, 0.42, 0.26);
    ball(g, '#e7d0ff', 0, 0.42, 0, 0.14, 0.24, 0.14);
    ball(g, '#9a5cf0', 0, 0.1, 0, 0.2, 0.1, 0.2);
  } else {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, r = 0.22; box(g, '#c9b45c', Math.cos(a) * r, 0.45, Math.sin(a) * r, 0.08, 0.9, 0.08); ball(g, '#e6d27a', Math.cos(a) * r * 1.3, 0.95, Math.sin(a) * r * 1.3, 0.1, 0.22, 0.1); }
    box(g, '#7a5433', 0, 0.35, 0, 0.62, 0.08, 0.62).rotation.y = 0.4;
  }
  const glow = mesh(g, new T.RingGeometry(0.4, 0.5, 20), itemColor(it.kind), 0, 0.03, 0);
  glow.rotation.x = -Math.PI / 2; glow.castShadow = false;
  glow.material = new T.MeshBasicMaterial({ color: glow.material.color.clone(), transparent: true, opacity: 0.35, side: T.DoubleSide });
  glow.material.userData.own = true;
  g.traverse(o => { o.castShadow = false; });
  scene.add(g);
  it.view = { g };
  return it.view;
}

export function detachItemView(it) {
  const v = it.view; if (!v) return;
  v.g.traverse(o => { if (o.geometry && o.geometry !== boxGeo && o.geometry !== ballGeo) o.geometry.dispose(); });
  removeGroup(v.g);
  it.view = null;
}

/** Her karede: konum, altın dönüşü, son saniyede küçülme, görüş elemesi. */
export function syncItemView(world, it, dt, clock) {
  const v = it.view; if (!v) return;
  v.g.visible = world.inView(it.pos.x, it.pos.z, 0);
  if (!v.g.visible) return;
  v.g.position.copy(it.pos);
  if (it.kind === 'gold' && !it.fly) { v.g.rotation.y += dt * 1.5; v.g.position.y = Math.sin(clock * 3 + it.phase) * 0.05; }
  if (it.ttl < 1 && !it.fly) v.g.scale.setScalar(0.15 + 0.85 * Math.max(0, it.ttl)); else v.g.scale.setScalar(1);
}

export function attachArrowView(scene, a) {
  const g = new T.Group();
  if (a.siege) mesh(g, new T.IcosahedronGeometry(0.34, 0), '#6a6f74', 0, 0, 0);
  else {
    box(g, '#65482f', 0, 0, 0, 0.055, 0.055, 0.9);
    mesh(g, new T.ConeGeometry(0.09, 0.23, 4), a.homing ? '#ffd86b' : '#d8d7b7', 0, 0, 0.56).rotation.x = Math.PI / 2;
  }
  g.position.copy(a.pos); g.rotation.y = a.yaw;
  if (a.scale && a.scale !== 1) g.scale.setScalar(a.scale);
  scene.add(g);
  a.view = { g };
  return a.view;
}
export function detachArrowView(a) {
  const v = a.view; if (!v) return;
  v.g.traverse(o => { if (o.geometry && o.geometry !== boxGeo && o.geometry !== ballGeo) o.geometry.dispose(); });
  if (v.g.parent) v.g.parent.remove(v.g);
  a.view = null;
}
export function syncArrowView(a) {
  const v = a.view; if (!v) return;
  v.g.position.copy(a.pos); v.g.rotation.y = a.yaw;
}

/** Toplanma bayrağı: direk + flama + halka; rengi hedefe göre. */
export function rallyFlag(scene, x, z, color) {
  const g = new T.Group(); g.position.set(x, 0, z); scene.add(g);
  box(g, '#5a4632', 0, 1.1, 0, 0.08, 2.2, 0.08);
  box(g, color, 0.4, 1.9, 0, 0.8, 0.45, 0.04);
  const r = mesh(g, new T.RingGeometry(0.5, 0.62, 24), color, 0, 0.04, 0); r.rotation.x = -Math.PI / 2; r.castShadow = false;
  return g;
}
