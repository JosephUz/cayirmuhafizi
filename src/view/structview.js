import * as T from 'three';
import { CulledGroup, ball, box, makeHpBar, mesh, removeGroup, setHpBar } from '../builders.js';
import { BUILD, COLORS, TOWER } from '../config.js';
import { knownBy } from '../structures.js';

/**
 * Yapı görünümü: mesh'ler yapı verisinden (structures.js) kurulur ve her karede **durumdan** çizilir: inşa yükselmesi,
 * çökme, kamp yıkıntısı, sis gizliliği, doğuş / vuruş büyümesi, bayrak dalgası, can çubuğu. Simülasyon mesh'e dokunmaz.
 */
export function structureMesh(kind, faction, owner = null) {
  const color = faction === 'blue' ? COLORS.blueBanner : COLORS.redBanner;
  const g = new CulledGroup();
  let flag = null, rng = null;
  if (kind === 'banner') {
    mesh(g, new T.CylinderGeometry(1.1, 1.3, 0.5, 8), '#8d8f9a', 0, 0.25, 0);
    box(g, '#5a4632', 0, 3, 0, 0.18, 5.4, 0.18);
    ball(g, '#cbb977', 0, 5.8, 0, 0.18);
    flag = box(g, color, 0.75, 5, 0, 1.5, 1, 0.06);
    rng = groundRing(g, color, BUILD.bannerRadius - 0.45, BUILD.bannerRadius, 0.3);
  } else if (kind === 'tower') {
    mesh(g, new T.CylinderGeometry(1.0, 1.25, 3.4, 8), '#8d8f9a', 0, 1.7, 0);
    mesh(g, new T.CylinderGeometry(1.25, 1.1, 0.9, 8), '#6b4e33', 0, 3.85, 0);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(g, '#7c7e88', Math.cos(a) * 1.15, 4.5, Math.sin(a) * 1.15, 0.3, 0.4, 0.3); }
    box(g, '#5a4632', 0, 5.2, 0, 0.12, 1.8, 0.12);
    flag = box(g, color, 0.45, 5.7, 0, 0.9, 0.55, 0.05);
    // Kule halkası = gerçek menzil (towerTarget ve ok sınırı tam bu çember): sancak halkasıyla karışmasın diye kalın ve belirgin.
    rng = groundRing(g, color, TOWER.range - 0.5, TOWER.range, 0.45);
  } else if (kind === 'barracks') {
    box(g, '#8d8f9a', 0, 0.3, 0, 3.6, 0.6, 3.0);
    box(g, '#c9b28a', 0, 1.5, 0, 3.2, 1.9, 2.6);
    const roof = mesh(g, new T.ConeGeometry(2.6, 1.3, 4), '#6b4e33', 0, 3.1, 0, 1, 1, 0.9); roof.rotation.y = Math.PI / 4;
    box(g, '#534433', 0, 0.95, 1.32, 0.9, 1.3, 0.06);
    for (const x of [-1.2, 1.2]) { box(g, '#80613c', x, 1.2, 1.55, 0.08, 1.6, 0.08); box(g, '#d9e4db', x, 1.7, 1.62, 0.1, 0.8, 0.05); }
    box(g, '#5a4632', 0, 4.1, 0, 0.1, 1.4, 0.1);
    flag = box(g, color, 0.4, 4.5, 0, 0.8, 0.5, 0.05);
  } else if (kind === 'archery') {
    box(g, '#7a5433', 0, 1.1, 0, 2.6, 2.2, 2.4);
    const roof = mesh(g, new T.ConeGeometry(2.2, 1.1, 4), '#9e5838', 0, 2.7, 0, 1, 1, 0.9); roof.rotation.y = Math.PI / 4;
    box(g, '#534433', 0, 0.75, 1.22, 0.7, 1.3, 0.06);
    box(g, '#80613c', 1.9, 0.7, -0.6, 0.08, 1.4, 0.08);
    for (const [r, c] of [[0.55, '#eee0b6'], [0.38, '#c9503e'], [0.2, '#eee0b6'], [0.08, '#c9503e']]) mesh(g, new T.CylinderGeometry(r, r, 0.06, 12), c, 1.9, 1.4, -0.6).rotation.z = Math.PI / 2;
    box(g, '#5a4632', -0.9, 3.4, 0, 0.1, 1.4, 0.1);
    flag = box(g, color, -0.5, 3.8, 0, 0.8, 0.5, 0.05);
  } else if (kind === 'siege') {
    box(g, '#8d8f9a', 0, 0.25, 0, 3.8, 0.5, 3.2);
    box(g, '#7a5433', 0, 1.3, -1.3, 3.6, 2.0, 0.5);
    for (const x of [-1.7, 1.7]) box(g, '#6b4e33', x, 1.5, 1.0, 0.32, 2.4, 0.32);
    box(g, '#9e5838', 0, 2.75, -0.1, 4.2, 0.35, 3.4);
    box(g, '#6b4e33', 0, 2.55, -1.3, 4.2, 0.25, 0.9);
    box(g, '#80613c', 0.2, 0.9, 0.7, 1.9, 0.32, 1.3);
    for (const x of [-0.5, 0.9]) for (const z of [0.15, 1.2]) { const wh = mesh(g, new T.CylinderGeometry(0.4, 0.4, 0.16, 12), '#4a3a2a', x, 0.45, z); wh.rotation.z = Math.PI / 2; }
    for (const z of [0.3, 1.1]) box(g, '#8e6d4a', 0.2, 1.5, z, 0.14, 1.1, 0.14);
    box(g, '#8e6d4a', 0.2, 2.02, 0.7, 0.16, 0.16, 1.0);
    const arm = box(g, '#a07a50', 0.2, 1.75, 0.35, 0.16, 2.6, 0.16); arm.rotation.x = -0.8;
    ball(g, '#6a6f74', 0.2, 2.72, -0.55, 0.3, 0.3, 0.3);
    ball(g, '#7c7e88', -1.5, 0.55, 1.25, 0.3, 0.28, 0.3);
    ball(g, '#6a6f74', -1.05, 0.5, 1.6, 0.24, 0.22, 0.24);
    box(g, '#534433', -1.6, 0.75, 0.2, 0.7, 0.5, 0.6);
    box(g, '#5a4632', -1.75, 3.6, 0, 0.1, 1.6, 0.1);
    flag = box(g, color, -1.35, 4.0, 0, 0.8, 0.5, 0.05);
  } else if (kind === 'camp') {
    const camp = new T.Group(); g.add(camp);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = 2.6;
      const p = box(camp, i % 2 ? '#6b5335' : '#7a5f3c', Math.cos(a) * r, 0.9, Math.sin(a) * r, 0.22, 1.8, 0.22);
      p.rotation.z = Math.cos(a) * 0.12; p.rotation.x = Math.sin(a) * 0.12;
    }
    for (const [tx, tz, s] of [[-1.1, -0.6, 1], [1.2, 0.5, 0.85]]) {
      const tent = mesh(camp, new T.ConeGeometry(1.15 * s, 1.9 * s, 4), '#7f6a4a', tx, 0.95 * s, tz);
      tent.rotation.y = Math.PI / 4;
      box(camp, '#4c3c28', tx, 0.5 * s, tz + 1.05 * s, 0.5, 0.9 * s, 0.05);
    }
    box(camp, '#5a4632', 0.1, 1.7, 1.4, 0.16, 3.4, 0.16);
    ball(camp, '#c9b45c', 0.1, 3.5, 1.4, 0.26, 0.34, 0.26);
    ball(camp, '#33411f', 0.1, 3.05, 1.4, 0.34, 0.3, 0.34);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; box(camp, '#4a3a26', 0.1 + Math.cos(a) * 0.5, 0.18, -1.2 + Math.sin(a) * 0.5, 0.5, 0.18, 0.18).rotation.y = a; }
    ball(camp, '#e0803a', 0.1, 0.4, -1.2, 0.34, 0.5, 0.34);
    rng = groundRing(g, '#8fd15a', 2.9, 3.15, 0.3);
    const ruin = new T.Group(); ruin.visible = false; g.add(ruin);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3, r = 2.4;
      const p = box(ruin, '#3a2c1d', Math.cos(a) * r, 0.35, Math.sin(a) * r, 0.2, 0.7, 0.2);
      p.rotation.z = 0.5 + Math.cos(a * 3) * 0.3; p.rotation.x = Math.sin(a * 2) * 0.4;
    }
    box(ruin, '#5b4c39', -1.0, 0.12, -0.5, 2.0, 0.16, 1.4).rotation.y = 0.5;
    box(ruin, '#4e412f', 1.1, 0.1, 0.6, 1.6, 0.14, 1.2).rotation.y = -0.4;
    ball(ruin, '#2c2a26', 0.1, 0.12, -1.2, 0.8, 0.14, 0.8);
    box(ruin, '#3a2c1d', 0.4, 0.3, 1.2, 0.14, 1.6, 0.14).rotation.z = 1.1;
    return { g, flag: null, ring: rng, camp, ruin };
  } else if (kind === 'stable') {
    box(g, '#8a6a44', 0, 1.0, 0, 4.2, 2.0, 2.6);
    box(g, '#9e5838', 0, 2.35, 0, 4.6, 0.7, 3.0);
    box(g, '#6b4e33', 0, 2.9, 0, 2.6, 0.4, 1.4);
    box(g, '#534433', -1.2, 0.8, 1.32, 1.1, 1.5, 0.06); box(g, '#534433', 1.2, 0.8, 1.32, 1.1, 1.5, 0.06);
    box(g, '#795c3b', 2.6, 0.3, 0.6, 1.2, 0.5, 0.6); box(g, '#5f7fa0', 2.6, 0.5, 0.6, 1.0, 0.1, 0.4);
    ball(g, '#d8c27a', -2.5, 0.4, -0.4, 0.6, 0.45, 0.6);
    box(g, '#5a4632', 0, 3.8, 0, 0.1, 1.4, 0.1);
    flag = box(g, color, 0.4, 4.2, 0, 0.8, 0.5, 0.05);
  }
  // Sahip bandı: direkte bayrağın hemen altında sahibinin renginde bir kutu.
  if (owner && flag) box(g, owner.color, 0, flag.position.y - flag.scale.y / 2 - 0.22, 0, 0.4, 0.32, 0.4);
  return { g, flag, ring: rng, camp: null, ruin: null };
}

function groundRing(g, color, r0, r1, opacity) {
  const r = mesh(g, new T.RingGeometry(r0, r1, 64), color, 0, 0.03, 0);
  r.rotation.x = -Math.PI / 2; r.castShadow = false;
  r.material = new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide });
  r.material.userData.own = true;
  return r;
}

/** Yapıya görünüm takar (sahne + can çubuğu). */
export function attachStructureView(scene, s) {
  const { g, flag, ring, camp, ruin } = structureMesh(s.kind, s.faction, s.owner);
  g.position.set(s.pos.x, 0, s.pos.z); scene.add(g);
  const bars = makeHpBar(scene, s.kind === 'banner' ? 2.6 : s.kind === 'tower' ? 2 : 1.8, s.kind === 'banner' ? 0.26 : 0.22);
  const barY = s.kind === 'banner' ? 5.8 : s.kind === 'tower' ? 6.6 : 4.2;
  s.view = { g, flag, ring, camp, ruin, bars, barY, shots: s.shots || 0, flagSpin: 0 };
  syncStructureView(s, 0, 0, null);
  return s.view;
}

export function detachStructureView(s) {
  const v = s.view; if (!v) return;
  removeGroup(v.g);
  if (v.bars && v.bars.g.parent) v.bars.g.parent.remove(v.bars.g);
  s.view = null;
}

/** Her karede: durumdan görünüm. clock görsel saat (dalga), camQuat can çubuğu için. */
export function syncStructureView(s, dt, clock, camQuat, side = 'blue') {
  const v = s.view; if (!v) return;
  // Sisteki (görülmemiş) rakip yapısı gizlidir.
  v.g.visible = knownBy(s, side);
  if (!s.alive) {
    if (s.kind === 'camp') {
      if (v.camp) v.camp.visible = false; if (v.ruin) v.ruin.visible = true; if (v.ring) v.ring.visible = false;
      v.g.rotation.z = 0; v.g.scale.set(1, 1, 1);
    } else {
      v.g.rotation.z = s.kind === 'tower' ? 0.35 : s.kind === 'banner' ? 1.05 : 0.5;
      if (v.flag) v.flag.visible = false; if (v.ring) v.ring.visible = false;
      v.g.scale.set(1, 0.55, 1);
    }
  } else {
    v.g.rotation.z = 0;
    if (v.camp) v.camp.visible = true; if (v.ruin) v.ruin.visible = false;
    if (v.flag) v.flag.visible = true;
    if (!s.ready) {
      const k = 1 - Math.max(0, s.buildTimer) / (s.buildTime || 1);
      v.g.scale.set(1, 0.08 + 0.92 * k, 1);
      if (v.ring) v.ring.visible = false;
    } else {
      if (v.ring) v.ring.visible = true;
      if (v.flag && s.kind !== 'tower') { v.flag.rotation.y = Math.sin(clock * 3 + s.pos.x) * 0.18; v.flag.scale.x = 1 + Math.sin(clock * 5) * 0.04; }
      if (v.flag && s.kind === 'tower' && (s.shots || 0) !== v.shots) { v.shots = s.shots || 0; v.flagSpin += 0.6; v.flag.rotation.y = v.flagSpin; }
      if (s.spawnTimer > 0) { const k = 1 - Math.max(0, s.spawnTimer) / 0.5; v.g.scale.setScalar(0.75 + 0.25 * (1 - Math.pow(1 - k, 3))); }
      else v.g.scale.setScalar(1 + s.hitFlash * 0.4);
    }
  }
  if (camQuat) setHpBar(v.bars, s.hp, s.maxHp, s.pos.x, v.barY, s.pos.z, camQuat, s.alive && v.g.visible);
}
