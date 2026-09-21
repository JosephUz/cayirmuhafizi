import * as T from '/vendor/three.module.js';

const mats = {};
/** Renge göre paylaşılan malzeme. Yanıp sönmesi gereken parçalar için ownMat kullan. */
export function mat(c) { return mats[c] || (mats[c] = new T.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true })); }
export function ownMat(c) { const m = new T.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }); m.userData.own = true; return m; }

export const boxGeo = new T.BoxGeometry(1, 1, 1);
export const ballGeo = new T.IcosahedronGeometry(1, 0);

export function mesh(p, geo, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new T.Mesh(geo, typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  p.add(m); return m;
}
export function box(p, c, x, y, z, sx, sy, sz) { return mesh(p, boxGeo, c, x, y, z, sx, sy, sz); }
export function ball(p, c, x, y, z, sx, sy = sx, sz = sx) { return mesh(p, ballGeo, c, x, y, z, sx, sy, sz); }

/** Bir grubu sahneden kaldırır, kendine ait malzemeleri serbest bırakır. */
export function removeGroup(g) {
  if (!g) return;
  g.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.own) o.material.dispose(); });
  if (g.parent) g.parent.remove(g);
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/**
 * Can çubuğu (Age of tarzı): **arka plan kırmızı, kalan can yeşil**. Çubuk sahnede ayrı durur (gövdeyle dönmesin)
 * ve hep kameraya bakar; yalnızca **darbe almış** birim / yapı için gösterilir (bkz. setHpBar).
 *
 * Üç katman da saydam değildir ve her birinin kendi renderOrder'ı vardır: saydam malzeme üç.js'te opak olanlardan
 * *sonra* çizildiği için eski saydam çerçeve yeşil / kırmızı şeritlerin üstünü kapatıp çubuğu siyah gösteriyordu.
 */
export function makeHpBar(scene, width = 1, height = 0.16) {
  const g = new T.Group(); g.visible = false; g.renderOrder = 10;
  const geo = new T.PlaneGeometry(width, height);
  const frame = new T.Mesh(geo, new T.MeshBasicMaterial({ color: '#0c0e13', depthTest: false }));
  frame.scale.set(1.12, 1.55, 1); frame.renderOrder = 10; g.add(frame);
  const track = new T.Mesh(geo, new T.MeshBasicMaterial({ color: '#e03a26', depthTest: false }));
  track.position.z = 0.001; track.renderOrder = 11; g.add(track);
  const fill = new T.Mesh(geo, new T.MeshBasicMaterial({ color: '#3fd23f', depthTest: false }));
  fill.position.z = 0.002; fill.renderOrder = 12; g.add(fill);
  scene.add(g);
  return { g, fill, width };
}
/** Çubuğu yerleştirir ve doldurur; canı tamsa (ya da ölüyse / görünmüyorsa) gizler. */
export function setHpBar(bar, hp, maxHp, x, y, z, camQuat, visible = true) {
  if (!bar) return;
  const r = clamp(hp / maxHp, 0, 1);
  const show = visible && r < 0.999 && hp > 0;
  bar.g.visible = show;
  if (!show) return;
  bar.g.position.set(x, y, z);
  bar.g.quaternion.copy(camQuat);
  // Yeşil dolgu soldan doğru kalan canı kaplar; altındaki kırmızı şerit eksik canı gösterir.
  bar.fill.scale.x = r;
  bar.fill.position.x = -(1 - r) * bar.width * 0.5;
}
export function dampAngle(current, target, lambda, dt) {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}
export function yawFromDir(x, z) { return Math.atan2(x, z); }
export function distXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
