import * as T from 'three';
import { CAMERA } from './config.js';
import { pickOwnStructure } from './structures.js';

/**
 * Kahraman girdisi (yalnızca tarayıcı): WASD hareket, Shift koşu, Boşluk zıplama, **vuruş yalnızca sol tıkla** ve nişan
 * noktasına doğru (kendi yapına tıklarsa seçer), sağ tık atılma + set etkisi, Esc vazgeç / menü.
 * İki kamera (V ile geçilir, world.cam):
 *  - 'iso': izometrik; WASD ekrana göre, nişan fare imlecinin zemindeki izdüşümü.
 *  - 'tps': omuz üstü; fare kilitliyken bakış fareyle döner (world.look), WASD kameraya göre, nişan ekran ortası. **Tab**
 *    kilidi açar / kapatır. **Orta tık** iki kamerada da ordunun toplanma alanını nişan noktasına diker.
 * Ham girdi burada toplanır; her karede resolveHeroInput onu simülasyonun anladığı **çözülmüş** biçime çevirir
 * (bkz. hero.js): tek başına oyunda doğrudan oyuncunun girdisine yazılır, çevrim içi oyunda ağa gönderilir.
 */
export function createInput() {
  return {
    keys: new Set(), attackQueued: false, rightDown: false, blockToggle: false,
    dodgeQueued: false, jumpQueued: false, aim: new T.Vector3(0, 0, 1), hasAim: false,
    pointer: { x: 0, y: 0, inside: false }, drag: null, shift: false,
    attackHeld: false, attackDownAt: 0, attackReleased: false,
    lookDX: 0, lookDY: 0, locked: false, unlockedAt: -1e9,
  };
}

export function setSelection(world, units, structure, additive = false) {
  const sel = world.sel;
  if (structure) { sel.units.clear(); sel.structure = structure; sel.structures = [structure]; return; }
  if (!additive) sel.units.clear();
  sel.structure = null; sel.structures = [];
  for (const u of units) sel.units.add(u);
}
/** Age of tarzı çift tık: tıklanan yapıyla aynı türdeki bütün kendi yapıların seçilir. */
export function selectStructureGroup(world, s) {
  const sel = world.sel;
  sel.units.clear(); sel.structure = s;
  sel.structures = world.structures.filter(o => o.alive && o.owner === s.owner && o.kind === s.kind);
  return sel.structures.length;
}
export function clearSelection(world) { world.sel.units.clear(); world.sel.structure = null; world.sel.structures = []; }

export function attachInput(world, canvas, camera, dragEl) {
  const input = world.input;
  const lastPick = { s: null, t: 0 };
  const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), ndc = new T.Vector2();
  const toGround = (cx, cy, out) => {
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, world.camera);
    return ray.ray.intersectPlane(plane, out);
  };
  const updateAim = ev => {
    if (toGround(ev.clientX, ev.clientY, input.aim)) input.hasAim = true;
    const r = canvas.getBoundingClientRect();
    input.pointer.x = ev.clientX - r.left; input.pointer.y = ev.clientY - r.top;
    input.pointer.inside = input.pointer.x >= 0 && input.pointer.y >= 0 && input.pointer.x <= r.width && input.pointer.y <= r.height;
  };
  world.toScreen = (pos, out = new T.Vector3()) => {
    out.copy(pos); out.project(world.camera); const r = canvas.getBoundingClientRect();
    if (out.z > 1) return { x: -9999, y: -9999 };
    return { x: (out.x + 1) / 2 * r.width, y: (1 - out.y) / 2 * r.height };
  };
  world.viewCorners = () => {
    const r = canvas.getBoundingClientRect(), pts = [];
    for (const [cx, cy] of [[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]]) {
      const v = new T.Vector3();
      if (!toGround(r.left + cx, r.top + cy, v)) {
        if (world.cam !== 'tps') return null;
        v.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 60);
      }
      pts.push({ x: v.x, z: v.z });
    }
    return pts;
  };

  const MOVE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'];
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.target.tagName === 'BUTTON' && e.code === 'Space') { if (!world.running) return; e.preventDefault(); e.target.blur(); }
    input.shift = e.shiftKey;
    // F1 / ?: kısayol penceresi (her ekranda).
    if (e.code === 'F1') { e.preventDefault(); if (world.ui) world.ui.toggleHelp(); return; }
    if (e.code === 'Escape') {
      // Fare kilidi açıkken Esc yalnızca imleci serbest bırakır.
      if (document.pointerLockElement || performance.now() - input.unlockedAt < 400) return;
      if (world.ui) world.ui.escape(); return;
    }
    if (!world.running || world.ended) return;
    if (e.code === 'KeyV' && !e.repeat && world.toggleCamera) { world.toggleCamera(); return; }
    if (e.code === 'Tab') {
      e.preventDefault();
      if (e.repeat || world.cam !== 'tps') return;
      if (input.locked) unlockPointer(); else lockPointer(canvas);
      return;
    }
    if (MOVE.includes(e.code)) { e.preventDefault(); input.keys.add(e.code); if (e.code === 'Space' && !e.repeat) input.jumpQueued = true; }
  });
  window.addEventListener('keyup', e => { input.keys.delete(e.code); input.shift = e.shiftKey; });
  window.addEventListener('blur', () => { input.keys.clear(); input.rightDown = false; input.attackHeld = false; input.attackReleased = false; });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerleave', () => { input.pointer.inside = false; });
  const rootEl = canvas.closest('#meadow-game') || document.body;
  canvas.addEventListener('pointermove', ev => {
    if (world.cam === 'tps' && input.locked) {
      input.lookDX += ev.movementX || 0; input.lookDY += ev.movementY || 0;
      input.pointer.inside = true;
      return;
    }
    updateAim(ev);
    if (input.rightDown && !(ev.buttons & 2)) input.rightDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    rootEl.classList.toggle('locked', input.locked);
    if (input.locked) { input.pointer.inside = true; input.lookDX = input.lookDY = 0; }
    else { input.unlockedAt = performance.now(); input.lookDX = input.lookDY = 0; input.rightDown = false; }
  });
  canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('pointerdown', e => {
    if (!world.running || world.ended) return;
    if (!(world.cam === 'tps' && input.locked)) updateAim(e);
    const x = input.aim.x, z = input.aim.z, ui = world.ui;
    if (e.button === 1) { e.preventDefault(); if (input.hasAim) ui.setRally(x, z); return; }
    if (e.button === 0) {
      if (world.placing) { ui.confirmPlace(x, z); return; }
      const s = pickOwnStructure(world, x, z);
      if (s) {
        const now = performance.now();
        const dbl = lastPick.s === s && now - lastPick.t < 400;
        lastPick.s = s; lastPick.t = now;
        ui.select(s, dbl);
        return;
      }
      input.attackQueued = true;
      input.attackHeld = true; input.attackDownAt = world.clock; input.attackReleased = false;
    } else if (e.button === 2) {
      if (world.placing) { ui.cancelModes(true); return; }
      input.rightDown = true; input.dodgeQueued = true;
    }
  });
  dragEl.hidden = true;
  window.addEventListener('pointerup', e => {
    if (e.button === 2 || e.buttons === 0) input.rightDown = false;
    if ((e.button === 0 || e.buttons === 0) && input.attackHeld) { input.attackHeld = false; input.attackReleased = true; }
  });
  window.addEventListener('mouseup', e => { if (e.button === 2 || e.buttons === 0) input.rightDown = false; });
  window.addEventListener('pointercancel', () => { input.rightDown = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.rightDown = false; });
}

/** Fare kilidi ister; tarayıcı vermezse sessizce vazgeçer. */
export function lockPointer(canvas) {
  try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* kilit yok */ }
}
export function unlockPointer() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }

/**
 * Omuz üstü kamera. Biriken fare hareketi yaw / pitch'e işlenir, kamera kahramanın arkasına yerleşir ve **nişan**
 * ekran ortasındaki artının zemine değdiği nokta olur.
 */
export function updateTpsCamera(world, camera, dt) {
  const c = CAMERA.tps, look = world.look, input = world.input, p = world.player;
  if (!p) return;
  look.yaw -= input.lookDX * c.sens;
  look.pitch = Math.max(c.pitchMin, Math.min(c.pitchMax, look.pitch + input.lookDY * c.sens));
  input.lookDX = input.lookDY = 0;
  const fx = Math.sin(look.yaw), fz = Math.cos(look.yaw), rx = -Math.cos(look.yaw), rz = Math.sin(look.yaw);
  const tgt = world.tpsLook;
  const tx = p.pos.x + rx * c.shoulder, ty = c.height + p.jumpY * 0.5, tz = p.pos.z + rz * c.shoulder;
  if (dt > 0) { const k = 1 - Math.exp(-dt * c.follow); tgt.x += (tx - tgt.x) * k; tgt.y += (ty - tgt.y) * k; tgt.z += (tz - tgt.z) * k; }
  else tgt.set(tx, ty, tz);
  const cp = Math.cos(look.pitch), sp = Math.sin(look.pitch);
  camera.position.set(tgt.x - fx * c.dist * cp, Math.max(c.minY, tgt.y + c.dist * sp), tgt.z - fz * c.dist * cp);
  camera.lookAt(tgt);
  const dx = tgt.x - camera.position.x, dy = tgt.y - camera.position.y, dz = tgt.z - camera.position.z;
  if (!input.locked) return;
  if (dy < -1e-4) { const t = -camera.position.y / dy; input.aim.set(camera.position.x + dx * t, 0, camera.position.z + dz * t); }
  else input.aim.set(tgt.x + fx * c.aimFar, 0, tgt.z + fz * c.aimFar);
  input.hasAim = true;
}

/**
 * Ham girdiyi çözülmüş kahraman girdisine yazar (bkz. hero.js). Hareket kamera moduna göre dünya uzayına çevrilir; kenar
 * bayrakları (vuruş, bırakma, atılma, zıplama) **birikir**: tüketmek simülasyonun (ya da ağa gönderenin) işidir.
 */
export function resolveHeroInput(world, out) {
  const input = world.input, k = input.keys;
  const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  const down = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
  const tps = world.cam === 'tps';
  let dx, dz;
  if (tps) {
    const yaw = world.look.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    dx = fx * -down + rx * right; dz = fz * -down + rz * right;
  } else { dx = right + down; dz = -right + down; }
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }
  out.mv[0] = dx; out.mv[1] = dz;
  out.aim[0] = input.aim.x; out.aim[1] = input.aim.z; out.ha = input.hasAim;
  out.sp = k.has('ShiftLeft') || k.has('ShiftRight');
  if (input.attackQueued) { out.aq = true; input.attackQueued = false; }
  out.ah = input.attackHeld;
  if (input.attackReleased) { out.ar = true; input.attackReleased = false; }
  if (input.dodgeQueued) { out.dq = true; input.dodgeQueued = false; }
  if (input.jumpQueued) { out.jq = true; input.jumpQueued = false; }
  out.yaw = world.look.yaw; out.ly = tps && input.locked;
  return out;
}
