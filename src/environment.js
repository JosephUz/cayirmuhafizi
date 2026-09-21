import * as T from '/vendor/three.module.js';
import { ball, box, mat, mesh } from './builders.js';
import { HALF, POSITIONS } from './config.js';
import { range, reseed } from './rng.js';

/**
 * DOTA tarzı geniş çayır: iki köşede üsler, aralarında üç hat (orta + iki kanat).
 * Her üssün arkasında tarla, maden ve odunluk. Yapılar (sancak, kule, binalar)
 * structures.js'te kurulur; burada yalnızca yerleri hesaplanır.
 * Sabit engeller (invMass 0) fizik için döndürülür. Ağaç ve çalılar InstancedMesh.
 */
export function buildEnvironment(scene) {
  reseed(814);
  const obstacles = [];
  const animals = [];
  const addObstacle = (x, z, r) => obstacles.push({ pos: new T.Vector3(x, 0, z), vel: new T.Vector3(), push: new T.Vector3(), radius: r, invMass: 0 });
  const G = HALF * 2 + 10;

  box(scene, '#a1ae62', 0, -0.22, 0, G, 0.4, G);
  const patches = [[], []];
  for (let i = 0; i < 320; i++) patches[i % 2].push({ x: range(-HALF, HALF), z: range(-HALF, HALF), s: range(1.5, 5) });
  patches.forEach((list, i) => {
    const im = new T.InstancedMesh(new T.CircleGeometry(1, 7), mat(i ? '#a7b369' : '#9dab60'), list.length);
    im.receiveShadow = true;
    const m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0));
    list.forEach((p, k) => im.setMatrixAt(k, m.compose(new T.Vector3(p.x, -0.012, p.z), q, new T.Vector3(p.s, p.s, 1))));
    scene.add(im);
  });

  const A = new T.Vector3(POSITIONS.playerBanner.x, 0, POSITIONS.playerBanner.z);
  const B = new T.Vector3(POSITIONS.enemyBanner.x, 0, POSITIONS.enemyBanner.z);
  const C1 = new T.Vector3(A.x, 0, B.z); // üst kanat köşesi
  const C2 = new T.Vector3(B.x, 0, A.z); // alt kanat köşesi

  // Hatlar: patika olarak çizilir; ağaçlar hatlardan uzak durur.
  const lanes = [
    [A, new T.Vector3(A.x * 0.45, 0, A.z * 0.25), new T.Vector3(B.x * 0.45, 0, B.z * 0.25), B],
    [A, new T.Vector3(A.x * 1.02, 0, (A.z + C1.z) / 2), C1, new T.Vector3((C1.x + B.x) / 2, 0, C1.z * 1.02), B],
    [A, new T.Vector3((A.x + C2.x) / 2, 0, C2.z * 1.02), C2, new T.Vector3(C2.x * 1.02, 0, (C2.z + B.z) / 2), B],
  ];
  const lanePoints = [];
  for (const pts of lanes) {
    const curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    const p = curve.getPoints(220);
    lanePoints.push(...p);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], d = a.distanceTo(b);
      const m = box(scene, '#c5b07a', (a.x + b.x) / 2, 0.005, (a.z + b.z) / 2, 3.2, 0.025, d + 0.12);
      m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); m.castShadow = false;
    }
  }
  const nearLane = (x, z, r) => lanePoints.some(p => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r && Math.hypot(p.x - x, p.z - z) < r);

  // Kule yerleri: ana hatta üsse yakın, kanat hatlarında köşeye doğru.
  const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
  const tT = POSITIONS.towers;
  const towerSpots = [
    { faction: 'blue', ...lerp(A, B, tT.mainT) }, { faction: 'blue', ...lerp(A, C1, tT.flankT) }, { faction: 'blue', ...lerp(A, C2, tT.flankT) },
    { faction: 'red', ...lerp(B, A, tT.mainT) }, { faction: 'red', ...lerp(B, C1, tT.flankT) }, { faction: 'red', ...lerp(B, C2, tT.flankT) },
  ];

  const trees = [];
  // Ağaçlar aynı zamanda kaynak düğümü: kahraman vurunca odun düşer.
  const addTree = (x, z, s) => { trees.push({ x, z, s }); addObstacle(x, z, s * 0.55); obstacles[obstacles.length - 1].kind = 'wood'; };
  const nodes = [];

  // Üsler: arka bölümde tarla, maden, odunluk; sancak ve kışla structures.js'te kurulur.
  const bases = {};
  for (const [faction, b] of [['blue', A], ['red', B]]) {
    const len = Math.hypot(b.x, b.z);
    const back = { x: b.x / len, z: b.z / len };
    const side = { x: -back.z, z: back.x };
    const at = spec => clampPos(b.x + back.x * spec.back + side.x * spec.side, b.z + back.z * spec.back + side.z * spec.side, 6);
    const L = POSITIONS.base;
    const farm = at(L.farm), mine = at(L.mine), woods = at(L.woods);

    // Tarla: sürülmüş toprak + çit; ürün yerleri ekonomi modülüne bırakılır.
    box(scene, '#806747', farm.x, 0.01, farm.z, 7.5, 0.07, 6.5);
    fence(scene, farm.x - 3.9, farm.z - 3.6, 8, true); fence(scene, farm.x - 3.9, farm.z + 3.4, 8, true);
    fence(scene, farm.x - 3.9, farm.z - 3.6, 7, false);
    for (let r = 0; r < 8; r++) for (let cc = 0; cc < 11; cc++) {
      const px = farm.x - 3.2 + cc * 0.64, pz = farm.z - 2.6 + r * 0.7;
      box(scene, '#b9a65b', px, 0.3, pz, 0.07, 0.55, 0.07);
      ball(scene, '#ddc779', px, 0.63, pz, 0.12, 0.23, 0.12);
    }
    const farmSlots = [];
    for (let cc = 0; cc < 3; cc++) { farmSlots.push({ x: farm.x - 2.4 + cc * 2.4, z: farm.z - 4.2 }); farmSlots.push({ x: farm.x - 2.4 + cc * 2.4, z: farm.z + 4.0 }); }

    // Maden: kaya yığını, cevher yerleri çevresinde.
    const rockG = new T.Group(); rockG.position.set(mine.x, 0, mine.z); scene.add(rockG);
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

    // Kamp ateşi.
    const fire = ball(scene, '#f0a040', b.x - side.x * 3, 0.35, b.z - side.z * 3, 0.32, 0.5, 0.32);
    bases[faction] = { pos: { x: b.x, z: b.z }, farm, mine, woods, farmSlots, mineSlots, woodSlots, fire, back, side, at };
  }

  // Serbest ağaçlar: hatlardan, üslerden, kule yerlerinden ve bina yerlerinden uzak.
  // Haritanın ortası: iki ana kule arasında, hattın dışına düşen üç maden. Tarafsızdır; işçi çalışmaz,
  // yalnızca kahramanlar vurup altın çıkarır (seviye yükseldikçe vuruş başına daha çok altın).
  const centerMines = [];
  {
    const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1;
    const px = -dz / l, pz = dx / l, M = POSITIONS.centerMines;
    // Küme merkezi: harita ortasından yola dik kayık; madenler birbirine değecek kadar yakın.
    const cx0 = px * M.offset, cz0 = pz * M.offset;
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 - Math.PI / 6;
      const x = cx0 + Math.cos(a) * M.spread, z = cz0 + Math.sin(a) * M.spread;
      const rockG = new T.Group(); rockG.position.set(x, 0, z); scene.add(rockG);
      mesh(rockG, new T.DodecahedronGeometry(1.5, 0), '#8d8f9a', 0, 1.0, 0, 1, 0.85, 1);
      mesh(rockG, new T.DodecahedronGeometry(1.0, 0), '#7c7e88', 1.2, 0.65, 0.5);
      mesh(rockG, new T.DodecahedronGeometry(0.8, 0), '#9a9ca6', -1.1, 0.55, -0.7);
      ball(rockG, '#f3c53d', 0.35, 1.7, 0.75, 0.22, 0.2, 0.22);
      ball(rockG, '#e2ad2c', -0.6, 1.25, 0.95, 0.16, 0.15, 0.16);
      addObstacle(x, z, 1.7); obstacles[obstacles.length - 1].kind = 'gold';
      centerMines.push({ x, z });
    }
  }

  const reserved = [...centerMines];
  for (const f of ['blue', 'red']) for (const k of ['barracks', 'archery', 'stable', 'siege']) reserved.push(bases[f].at(POSITIONS.base[k]));
  const blocked = (x, z) =>
    Math.hypot(x - A.x, z - A.z) < 22 || Math.hypot(x - B.x, z - B.z) < 22 ||
    nearLane(x, z, 3.8) || towerSpots.some(t => Math.hypot(t.x - x, t.z - z) < 5) || reserved.some(r => Math.hypot(r.x - x, r.z - z) < 5);
  for (let i = 0; i < 720; i++) {
    const x = range(-HALF + 3, HALF - 3), z = range(-HALF + 3, HALF - 3);
    if (!blocked(x, z)) addTree(x, z, range(0.7, 1.35));
  }
  buildTrees(scene, trees);

  const bushes = [[], []];
  for (let i = 0; i < 420; i++) {
    const x = range(-HALF + 2, HALF - 2), z = range(-HALF + 2, HALF - 2);
    if (!nearLane(x, z, 2.5)) bushes[i % 2].push({ x, z, rot: range(0, 6) });
  }
  bushes.forEach((list, i) => {
    const im = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), mat(i ? '#84916a' : '#78825e'), list.length);
    im.castShadow = true; im.receiveShadow = true;
    const m = new T.Matrix4(), q = new T.Quaternion();
    list.forEach((p, k) => im.setMatrixAt(k, m.compose(new T.Vector3(p.x, 0.15, p.z), q.setFromEuler(new T.Euler(0, p.rot, 0)), new T.Vector3(0.24, 0.18, 0.3))));
    scene.add(im);
  });

  // Evler ve koyunlar: hatların arasında dekor. Koyunlar aynı zamanda tükenmez yiyecek düğümü:
  // kahraman vurunca ölmezler, ürkerler ve çevreye yiyecek düşer.
  for (const [hx, hz] of [[-48, -24], [48, 24], [-16, 46], [16, -46]]) {
    if (!blocked(hx, hz)) house(scene, obstacles, hx, hz);
    for (let i = 0; i < 3; i++) {
      const g = new T.Group(); scene.add(g);
      const x = hx + range(-6, 6), z = hz + range(4, 9); g.position.set(x, 0, z);
      ball(g, '#e4dcc2', 0, 0.66, 0, 0.57, 0.46, 0.9);
      box(g, '#514638', 0, 0.69, 0.72, 0.44, 0.4, 0.4);
      for (const a of [-1, 1]) for (const bb of [-1, 1]) box(g, '#544c3b', a * 0.28, 0.24, bb * 0.45, 0.12, 0.48, 0.12);
      const animal = { g, x, z, phase: range(0, 7), startle: 0 };
      animals.push(animal);
      // Düğümün konumu koyunun kendi grubudur: otladıkça düğüm de onunla gezer.
      nodes.push({ kind: 'food', pos: g.position, radius: 1.0, hitCd: 0, animal });
    }
  }

  for (const o of obstacles) if (o.kind) nodes.push({ kind: o.kind, pos: o.pos, radius: o.radius, hitCd: 0 });
  return { obstacles, animals, bases, towerSpots, nodes, lanePoints: lanePoints.filter((_, i) => i % 3 === 0).map(p => ({ x: p.x, z: p.z })) };
}

function clampPos(x, z, margin) {
  const m = HALF - margin;
  return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(m, z)) };
}

/** Tüm ağaçlar dört InstancedMesh: gövde + üç yaprak kümesi. */
function buildTrees(scene, trees) {
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
    scene.add(im);
  }
}

function fence(scene, x, z, length, axis) {
  for (let i = 0; i <= length; i += 2) box(scene, '#795c3b', x + (axis ? i : 0), 0.52, z + (axis ? 0 : i), 0.16, 1.1, 0.16);
  box(scene, '#947346', x + (axis ? length / 2 : 0), 0.68, z + (axis ? 0 : length / 2), axis ? length : 0.12, 0.13, axis ? 0.12 : length);
}

function house(scene, obstacles, x, z) {
  const g = new T.Group(); g.position.set(x, 0, z); scene.add(g);
  box(g, '#d7c399', 0, 1.15, 0, 3, 2.3, 2.8);
  const roof = mesh(g, new T.ConeGeometry(2.65, 1.5, 4), '#9e5838', 0, 3, 0, 1, 1, 0.85); roof.rotation.y = Math.PI / 4;
  box(g, '#534433', 0, 0.7, 1.42, 0.7, 1.4, 0.04);
  box(g, '#6a796e', -0.93, 1.4, 1.43, 0.52, 0.55, 0.04);
  box(g, '#b49c79', 0.8, 3.1, -0.5, 0.4, 1.5, 0.45);
  obstacles.push({ pos: new T.Vector3(x, 0, z), vel: new T.Vector3(), push: new T.Vector3(), radius: 2, invMass: 0 });
}

export function inBounds(x, z) { return Math.abs(x) <= HALF && Math.abs(z) <= HALF; }
