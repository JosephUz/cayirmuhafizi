import * as T from '/vendor/three.module.js';
import { ball, ballGeo, box, boxGeo, mat, mesh } from './builders.js';
import { POSITIONS, TEAMS } from './config.js';
import { range, reseed } from './rng.js';

/**
 * DOTA tarzı geniş çayır: iki köşede takımlar, aralarında üç hat (orta + iki kanat).
 * Takım oyununda her takımın üsleri **çapa** noktasından (1v1'deki sancak yeri) hatta dik doğrultuda TEAMS.baseGap
 * aralıkla dizilir; çapadaki üs (0. yuva) üç hattın başıdır, öbür üslerden haritanın ortasına birer yol (ve o yolda bir
 * başlangıç kulesi) çıkar, takımın üslerini birbirine bağlayan bir de takım yolu vardır.
 * Her üssün arkasında tarla, maden ve odunluk. Yapılar (sancak, kule, binalar) structures.js'te kurulur; burada yalnızca
 * yerleri hesaplanır. Sabit engeller (invMass 0) fizik için döndürülür. Ağaçlar, çalılar, yol parçaları ve tarla sapları
 * InstancedMesh (5v5 arenasında binlerce parça tek çizimde); dekor matrisleri bir kez hesaplanır (kamp ateşi hariç).
 * Arena her oyunda yeniden kurulur (takım büyüklüğü değişebilir): dispose() öncekini sahneden kaldırır.
 */

/** Takım büyüklüğüne göre arena yerleşimi: yarı boy, çapalar, üs yerleri, kanat köşeleri. */
export function computeLayout(teamSize) {
  const half = TEAMS.half(teamSize), scale = half / 120;
  const A = { x: POSITIONS.playerBanner.x * scale, z: POSITIONS.playerBanner.z * scale };
  const B = { x: POSITIONS.enemyBanner.x * scale, z: POSITIONS.enemyBanner.z * scale };
  const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz);
  const axis = { x: dx / l, z: dz / l }, perp = { x: -axis.z, z: axis.x };
  // Yuva sırası çapadan dışa: 0, +1, -1, +2, -2 (çapa ortada kalır).
  const offset = i => (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2)) * TEAMS.baseGap;
  const bases = { blue: [], red: [] };
  for (let i = 0; i < teamSize; i++) {
    const o = offset(i);
    for (const [faction, anchor, back] of [['blue', A, { x: -axis.x, z: -axis.z }], ['red', B, { x: axis.x, z: axis.z }]]) {
      bases[faction].push({ faction, slot: i, x: anchor.x + perp.x * o, z: anchor.z + perp.z * o, back, side: { x: -back.z, z: back.x } });
    }
  }
  const C1 = { x: A.x, z: B.z }, C2 = { x: B.x, z: A.z };
  return { teamSize, half, scale, A, B, C1, C2, corners: [C1, C2], bases, axis, perp };
}

export function buildEnvironment(scene, layout) {
  reseed(814);
  const { half, scale } = layout;
  const root = new T.Group(); scene.add(root);
  const obstacles = [];
  const animals = [];
  const addObstacle = (x, z, r) => obstacles.push({ pos: new T.Vector3(x, 0, z), vel: new T.Vector3(), push: new T.Vector3(), radius: r, invMass: 0 });
  const G = half * 2 + 10;
  const area = scale * scale;
  const clampPos = (x, z, margin) => { const m = half - margin; return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(m, z)) }; };

  box(root, '#a1ae62', 0, -0.22, 0, G, 0.4, G);
  const patches = [[], []];
  for (let i = 0; i < Math.round(320 * area); i++) patches[i % 2].push({ x: range(-half, half), z: range(-half, half), s: range(1.5, 5) });
  patches.forEach((list, i) => {
    const im = new T.InstancedMesh(new T.CircleGeometry(1, 7), mat(i ? '#a7b369' : '#9dab60'), list.length);
    im.receiveShadow = true;
    const m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0));
    list.forEach((p, k) => im.setMatrixAt(k, m.compose(new T.Vector3(p.x, -0.012, p.z), q, new T.Vector3(p.s, p.s, 1))));
    root.add(im);
  });

  const V = p => new T.Vector3(p.x, 0, p.z);
  const A = V(layout.A), B = V(layout.B), C1 = V(layout.C1), C2 = V(layout.C2), center = new T.Vector3(0, 0, 0);
  const allBases = [...layout.bases.blue, ...layout.bases.red];

  // Hatlar: patika olarak çizilir; ağaçlar hatlardan uzak durur.
  const lanes = [
    [A, new T.Vector3(A.x * 0.45, 0, A.z * 0.25), new T.Vector3(B.x * 0.45, 0, B.z * 0.25), B],
    [A, new T.Vector3(A.x * 1.02, 0, (A.z + C1.z) / 2), C1, new T.Vector3((C1.x + B.x) / 2, 0, C1.z * 1.02), B],
    [A, new T.Vector3((A.x + C2.x) / 2, 0, C2.z * 1.02), C2, new T.Vector3(C2.x * 1.02, 0, (C2.z + B.z) / 2), B],
  ];
  for (const faction of ['blue', 'red']) {
    const list = layout.bases[faction];
    // Çapa dışındaki her üsten haritanın ortasına bir yol.
    for (const b of list) if (b.slot > 0) { const p = V(b); lanes.push([p, p.clone().lerp(center, 0.5), center.clone()]); }
    // Takım yolu: üsleri hat boyunca birbirine bağlar.
    if (list.length > 1) {
      const sorted = [...list].sort((u, v) => (u.x - v.x) * layout.perp.x + (u.z - v.z) * layout.perp.z);
      lanes.push(sorted.map(V));
    }
  }
  const lanePoints = [], laneSegs = [];
  for (const pts of lanes) {
    const curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    const p = curve.getPoints(Math.round(220 * (pts.length > 2 ? 1 : 0.5) * scale));
    lanePoints.push(...p);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      laneSegs.push({ x: (a.x + b.x) / 2, y: 0.005, z: (a.z + b.z) / 2, rot: Math.atan2(b.x - a.x, b.z - a.z), sx: 3.2, sy: 0.025, sz: a.distanceTo(b) + 0.12 });
    }
  }
  // Yol parçaları tek InstancedMesh: 5v5'te 5000'den fazla parça tek çizim çağrısı ve tek matris.
  instanced(root, boxGeo, '#c5b07a', laneSegs, false);
  const nearLane = (x, z, r) => lanePoints.some(p => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r && Math.hypot(p.x - x, p.z - z) < r);

  // Kule yerleri: her üste **tek** başlangıç kulesi, sancağın POSITIONS.towers.dist birim önünde, merkeze giden yolun üstünde
  // (çapa üssünde ana hat, öbürlerinde kendi yolu merkeze doğru başlar; kule sancak çemberinin içinde kalır).
  const towerSpots = [];
  for (const b of allBases) {
    const l = Math.hypot(b.x, b.z) || 1, d = POSITIONS.towers.dist;
    towerSpots.push({ faction: b.faction, slot: b.slot, x: b.x - (b.x / l) * d, z: b.z - (b.z / l) * d });
  }

  const trees = [], stalks = [], heads = [];
  // Ağaçlar aynı zamanda kaynak düğümü: kahraman vurunca odun düşer.
  const addTree = (x, z, s) => { trees.push({ x, z, s }); addObstacle(x, z, s * 0.55); obstacles[obstacles.length - 1].kind = 'wood'; };
  const nodes = [];

  // Üsler: arka bölümde tarla, maden, odunluk; sancak ve kışla structures.js'te kurulur. Anahtar "takım:yuva".
  const bases = {};
  for (const b of allBases) {
    const { back, side } = b;
    const at = spec => clampPos(b.x + back.x * spec.back + side.x * spec.side, b.z + back.z * spec.back + side.z * spec.side, 6);
    const L = POSITIONS.base;
    const farm = at(L.farm), mine = at(L.mine), woods = at(L.woods);

    // Tarla: sürülmüş toprak + çit; ürün yerleri ekonomi modülüne bırakılır.
    box(root, '#806747', farm.x, 0.01, farm.z, 7.5, 0.07, 6.5);
    fence(root, farm.x - 3.9, farm.z - 3.6, 8, true); fence(root, farm.x - 3.9, farm.z + 3.4, 8, true);
    fence(root, farm.x - 3.9, farm.z - 3.6, 7, false);
    // Tarla sapları ve başakları bütün üsler için iki InstancedMesh'te toplanır (aşağıda).
    for (let r = 0; r < 8; r++) for (let cc = 0; cc < 11; cc++) {
      const px = farm.x - 3.2 + cc * 0.64, pz = farm.z - 2.6 + r * 0.7;
      stalks.push({ x: px, y: 0.3, z: pz, rot: 0, sx: 0.07, sy: 0.55, sz: 0.07 });
      heads.push({ x: px, y: 0.63, z: pz, rot: 0, sx: 0.12, sy: 0.23, sz: 0.12 });
    }
    const farmSlots = [];
    for (let cc = 0; cc < 3; cc++) { farmSlots.push({ x: farm.x - 2.4 + cc * 2.4, z: farm.z - 4.2 }); farmSlots.push({ x: farm.x - 2.4 + cc * 2.4, z: farm.z + 4.0 }); }

    // Maden: kaya yığını, cevher yerleri çevresinde.
    const rockG = new T.Group(); rockG.position.set(mine.x, 0, mine.z); root.add(rockG);
    mesh(rockG, new T.DodecahedronGeometry(1.7, 0), '#8d8f9a', 0, 1.1, 0, 1, 0.8, 1);
    mesh(rockG, new T.DodecahedronGeometry(1.1, 0), '#7c7e88', 1.3, 0.7, 0.6);
    mesh(rockG, new T.DodecahedronGeometry(0.9, 0), '#9a9ca6', -1.2, 0.6, -0.8);
    box(rockG, '#5a4632', 0, 1.1, 1.9, 0.18, 2.2, 0.18); box(rockG, '#5a4632', 1.2, 1.1, 1.9, 0.18, 2.2, 0.18);
    box(rockG, '#5a4632', 0.6, 2.25, 1.9, 1.6, 0.16, 0.5);
    addObstacle(mine.x, mine.z, 1.9); obstacles[obstacles.length - 1].kind = 'gold';
    // Tarla engel değil (üstünde yürünür) ama vurulabilir düğüm.
    nodes.push({ kind: 'food', pos: new T.Vector3(farm.x, 0, farm.z), radius: 3.9, hitCd: 0 });
    const mineSlots = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4, r = 3.1; mineSlots.push({ x: mine.x + Math.cos(a) * r, z: mine.z + Math.sin(a) * r }); }

    // Odunluk: sık ağaç kümesi; odun yerleri ağaç dipleri.
    const woodSlots = [];
    for (let i = 0; i < L.woods.trees; i++) {
      const a = (i / L.woods.trees) * Math.PI * 2 + range(-0.3, 0.3), r = L.woods.radius * (0.55 + 0.45 * ((i % 2) ? 1 : 0.5));
      const p = clampPos(woods.x + Math.cos(a) * r, woods.z + Math.sin(a) * r, 3);
      const s = range(0.95, 1.3);
      addTree(p.x, p.z, s);
      const dir = Math.atan2(woods.z - p.z, woods.x - p.x) + Math.PI; // dışa doğru
      woodSlots.push({ x: p.x + Math.cos(dir) * (s * 0.55 + 0.9), z: p.z + Math.sin(dir) * (s * 0.55 + 0.9) });
    }

    // Kamp ateşi (animasyonlu: matrisi her karede güncellenir, bkz. aşağıdaki sabitleme).
    const fire = ball(root, '#f0a040', b.x - side.x * 3, 0.35, b.z - side.z * 3, 0.32, 0.5, 0.32);
    fire.userData.dynamic = true;
    bases[`${b.faction}:${b.slot}`] = { faction: b.faction, slot: b.slot, pos: { x: b.x, z: b.z }, farm, mine, woods, farmSlots, mineSlots, woodSlots, fire, back, side, at };
  }

  // Haritanın ortası: iki ana kule arasında, hattın dışına düşen üç maden. Tarafsızdır; işçi çalışmaz,
  // yalnızca kahramanlar vurup altın çıkarır (seviye yükseldikçe vuruş başına daha çok altın).
  const centerMines = [];
  {
    const px = layout.perp.x, pz = layout.perp.z, M = POSITIONS.centerMines;
    // Küme merkezi: harita ortasından yola dik kayık; madenler birbirine değecek kadar yakın.
    const cx0 = px * M.offset, cz0 = pz * M.offset;
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 - Math.PI / 6;
      const x = cx0 + Math.cos(a) * M.spread, z = cz0 + Math.sin(a) * M.spread;
      const rockG = new T.Group(); rockG.position.set(x, 0, z); root.add(rockG);
      mesh(rockG, new T.DodecahedronGeometry(1.5, 0), '#8d8f9a', 0, 1.0, 0, 1, 0.85, 1);
      mesh(rockG, new T.DodecahedronGeometry(1.0, 0), '#7c7e88', 1.2, 0.65, 0.5);
      mesh(rockG, new T.DodecahedronGeometry(0.8, 0), '#9a9ca6', -1.1, 0.55, -0.7);
      ball(rockG, '#f3c53d', 0.35, 1.7, 0.75, 0.22, 0.2, 0.22);
      ball(rockG, '#e2ad2c', -0.6, 1.25, 0.95, 0.16, 0.15, 0.16);
      addObstacle(x, z, 1.7); obstacles[obstacles.length - 1].kind = 'gold';
      centerMines.push({ x, z });
    }
  }

  // Serbest ağaçlar: hatlardan, üslerden, kule yerlerinden ve bina yerlerinden uzak.
  const reserved = [...centerMines];
  for (const b of Object.values(bases)) for (const k of ['barracks', 'archery', 'stable', 'siege']) reserved.push(b.at(POSITIONS.base[k]));
  const blocked = (x, z) =>
    allBases.some(b => Math.hypot(x - b.x, z - b.z) < 22) ||
    nearLane(x, z, 3.8) || towerSpots.some(t => Math.hypot(t.x - x, t.z - z) < 5) || reserved.some(r => Math.hypot(r.x - x, r.z - z) < 5);
  for (let i = 0; i < Math.round(500 * area); i++) {
    const x = range(-half + 3, half - 3), z = range(-half + 3, half - 3);
    if (!blocked(x, z)) addTree(x, z, range(0.7, 1.35));
  }
  buildTrees(root, trees);
  instanced(root, boxGeo, '#b9a65b', stalks, true);
  instanced(root, ballGeo, '#ddc779', heads, true);

  const bushes = [[], []];
  for (let i = 0; i < Math.round(420 * area); i++) {
    const x = range(-half + 2, half - 2), z = range(-half + 2, half - 2);
    if (!nearLane(x, z, 2.5)) bushes[i % 2].push({ x, z, rot: range(0, 6) });
  }
  bushes.forEach((list, i) => {
    const im = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), mat(i ? '#84916a' : '#78825e'), list.length);
    im.castShadow = true; im.receiveShadow = true;
    const m = new T.Matrix4(), q = new T.Quaternion();
    list.forEach((p, k) => im.setMatrixAt(k, m.compose(new T.Vector3(p.x, 0.15, p.z), q.setFromEuler(new T.Euler(0, p.rot, 0)), new T.Vector3(0.24, 0.18, 0.3))));
    root.add(im);
  });

  // Dekor evler ve koyunlar kaldırıldı (performans): arazide yalnızca ağaç, çalı, yol ve üs yerleşimi var.

  for (const o of obstacles) if (o.kind) nodes.push({ kind: o.kind, pos: o.pos, radius: o.radius, hitCd: 0 });

  // Dekor sabittir: dünya matrisleri bir kez hesaplanır, her karede yeniden kurulmaz (animasyonlu kamp ateşi hariç).
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o !== root && !o.userData.dynamic) o.matrixAutoUpdate = false; });

  /** Arenayı sahneden kaldırır; paylaşılmayan geometri ve malzemeleri serbest bırakır. */
  const dispose = () => {
    root.traverse(o => {
      if (o.geometry && o.geometry !== boxGeo && o.geometry !== ballGeo) o.geometry.dispose();
      if (o.material && o.material.userData && o.material.userData.own) o.material.dispose();
    });
    scene.remove(root);
  };
  return { root, obstacles, animals, bases, towerSpots, nodes, lanePoints: lanePoints.filter((_, i) => i % 3 === 0).map(p => ({ x: p.x, z: p.z })), dispose };
}

/** Tüm ağaçlar dört InstancedMesh: gövde + üç yaprak kümesi. */
function buildTrees(parent, trees) {
  const parts = [
    [new T.BoxGeometry(1, 1, 1), '#705238', [0, 1, 0], [0.35, 2, 0.35]],
    [new T.IcosahedronGeometry(1, 0), '#3e6545', [0, 2.55, 0], [1.18, 1.6, 1.05]],
    [new T.IcosahedronGeometry(1, 0), '#547d4e', [-0.48, 2.35, 0.35], [0.86, 1, 0.9]],
    [new T.IcosahedronGeometry(1, 0), '#69874f', [0.35, 3.1, 0.1], [0.75, 0.9, 0.75]],
  ];
  const m = new T.Matrix4(), q = new T.Quaternion(), pos = new T.Vector3(), scl = new T.Vector3();
  for (const [geo, color, p, s] of parts) {
    const im = new T.InstancedMesh(geo, mat(color), trees.length);
    im.castShadow = true; im.receiveShadow = true;
    trees.forEach((t, k) => {
      pos.set(t.x + p[0] * t.s, p[1] * t.s, t.z + p[2] * t.s); scl.set(s[0] * t.s, s[1] * t.s, s[2] * t.s);
      im.setMatrixAt(k, m.compose(pos, q, scl));
    });
    parent.add(im);
  }
}

/** Aynı geometri ve renkteki sabit parçaları tek InstancedMesh'e toplar: {x, y, z, rot, sx, sy, sz}. */
function instanced(parent, geo, color, list, castShadow) {
  if (!list.length) return null;
  const im = new T.InstancedMesh(geo, mat(color), list.length);
  im.castShadow = castShadow; im.receiveShadow = true;
  const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pos = new T.Vector3(), scl = new T.Vector3();
  list.forEach((p, k) => im.setMatrixAt(k, m.compose(pos.set(p.x, p.y, p.z), q.setFromEuler(e.set(0, p.rot, 0)), scl.set(p.sx, p.sy, p.sz))));
  parent.add(im);
  return im;
}

function fence(parent, x, z, length, axis) {
  for (let i = 0; i <= length; i += 2) box(parent, '#795c3b', x + (axis ? i : 0), 0.52, z + (axis ? 0 : i), 0.16, 1.1, 0.16);
  box(parent, '#947346', x + (axis ? length / 2 : 0), 0.68, z + (axis ? 0 : length / 2), axis ? length : 0.12, 0.13, axis ? 0.12 : length);
}

