import * as T from '/vendor/three.module.js';
import { dampAngle, yawFromDir } from './builders.js';
import { startAttack } from './combat.js';
import { heroDash } from './abilities.js';
import { dashDistance } from './characters.js';
import { CAMERA, HALF, JUMP_SPEED, PHYSICS } from './config.js';
import { applyImpulse } from './physics.js';
import { pickOwnStructure } from './structures.js';

/**
 * Kahraman girdisi: WASD hareket, Shift koşu, Boşluk zıplama, **vuruş yalnızca sol tıkla** ve nişan noktasına doğru
 * (kendi yapına tıklarsa seçer), sağ tık atılma + set etkisi, Esc vazgeç / duraklat.
 * İki kamera (V ile geçilir, world.cam):
 *  - 'iso': izometrik; WASD ekrana göre, nişan fare imlecinin zemindeki izdüşümü.
 *  - 'tps': omuz üstü (üçüncü şahıs); fare kilitliyken bakış fareyle döner (world.look yaw / pitch), WASD kameraya göre,
 *    nişan ekran ortasındaki artının zemine değdiği nokta. **Orta tuş** kilidi açar / kapatır: serbestken imleç görünür
 *    ve tıklar izometrikteki gibi işler (yapı seç, inşa, imlece doğru vuruş), kamera son açısında kalır. Esc de kilidi bırakır.
 */
export function createInput() {
  return {
    keys: new Set(), attackQueued: false, rightDown: false, blockToggle: false,
    dodgeQueued: false, jumpQueued: false, aim: new T.Vector3(0, 0, 1), hasAim: false,
    pointer: { x: 0, y: 0, inside: false }, drag: null, shift: false,
    // Omuz üstü kamera: fare kilidi ve bu karede biriken bakış hareketi (piksel).
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
/**
 * Age of tarzı çift tık: tıklanan yapıyla **aynı türdeki bütün kendi yapıların** seçilir. Seçim sonrası
 * üretim düğmesi emirleri bu binalara dağıtır (bkz. ui.requestSoldier), yani tek düğmeden hepsine asker basılır.
 */
export function selectStructureGroup(world, s) {
  const sel = world.sel;
  sel.units.clear(); sel.structure = s;
  sel.structures = world.structures.filter(o => o.alive && o.faction === s.faction && o.kind === s.kind);
  return sel.structures.length;
}
export function clearSelection(world) { world.sel.units.clear(); world.sel.structure = null; world.sel.structures = []; }

export function attachInput(world, canvas, camera, dragEl) {
  const input = world.input;
  // Çift tık algısı: son tıklanan yapı ve zamanı.
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
    // Perspektif kamerada arkada kalan nokta ekrana ters düşer: ekran dışına at.
    if (out.z > 1) return { x: -9999, y: -9999 };
    return { x: (out.x + 1) / 2 * r.width, y: (1 - out.y) / 2 * r.height };
  };
  world.viewCorners = () => {
    const r = canvas.getBoundingClientRect(), pts = [];
    for (const [cx, cy] of [[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]]) {
      const v = new T.Vector3();
      if (!toGround(r.left + cx, r.top + cy, v)) {
        // Omuz üstü kamerada üst köşeler gökyüzüne bakar: ışını 60 birimde kes.
        if (world.cam !== 'tps') return null;
        v.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 60);
      }
      pts.push({ x: v.x, z: v.z });
    }
    return pts;
  };

  const MOVE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'];
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    // Odak bir düğmede kaldıysa (ör. 🎥 kamera düğmesine tıklandı) Space düğmeyi tetiklemesin, zıplasın; oyun başlamadan düğmeler işler.
    if (e.target.tagName === 'BUTTON' && e.code === 'Space') { if (!world.running) return; e.preventDefault(); e.target.blur(); }
    input.shift = e.shiftKey;
    const aoe = world.mode === 'aoe';
    // Komut kısayolu yok: üretim, inşa, emirler ve mod geçişi yalnızca alt banttan. Klavye: hareket, koşu, zıplama, Esc.
    if (e.code === 'Escape') {
      // Fare kilidi açıkken (ya da tarayıcı az önce kaldırdıysa) Esc yalnızca imleci serbest bırakır; oyunu duraklatmaz.
      if (document.pointerLockElement || performance.now() - input.unlockedAt < 400) return;
      if (!world.ui.cancelModes()) world.ui.togglePause(); return;
    }
    // V: izometrik / omuz üstü kamera geçişi.
    if (e.code === 'KeyV' && !e.repeat && world.toggleCamera) { world.toggleCamera(); return; }
    if (MOVE.includes(e.code)) { e.preventDefault(); input.keys.add(e.code); if (e.code === 'Space' && !e.repeat && !aoe) input.jumpQueued = true; }
  });
  window.addEventListener('keyup', e => { input.keys.delete(e.code); input.shift = e.shiftKey; });
  window.addEventListener('blur', () => { input.keys.clear(); input.rightDown = false; });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerleave', () => { input.pointer.inside = false; });
  const rootEl = canvas.closest('#meadow-game') || document.body;
  canvas.addEventListener('pointermove', ev => {
    if (world.cam === 'tps' && input.locked) {
      // Kilitli omuz üstü: imleç yok, fare hareketi bakışı döndürür; nişan her karede ekran ortasından hesaplanır.
      input.lookDX += ev.movementX || 0; input.lookDY += ev.movementY || 0;
      input.pointer.inside = true;
      return;
    }
    // İzometrik ya da serbest fare (omuz üstünde orta tuş): nişan imlecin zemindeki izdüşümü.
    updateAim(ev);
    if (input.rightDown && !(ev.buttons & 2)) input.rightDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    rootEl.classList.toggle('locked', input.locked);
    if (input.locked) { input.pointer.inside = true; input.lookDX = input.lookDY = 0; }
    else { input.unlockedAt = performance.now(); input.lookDX = input.lookDY = 0; input.rightDown = false; }
  });
  // Orta tuşun tarayıcı varsayılanı (otomatik kaydırma) kapatılır.
  canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('pointerdown', e => {
    if (world.cam === 'tps') {
      // Orta tuş: fare kilidini aç / kapat. Serbestken imleç görünür ve tıklar izometrikteki gibi işler (yapı seç,
      // inşa, tıklanan yöne vuruş); tekrar basınca bakış kaldığı açıdan kilitlenir.
      if (e.button === 1) {
        e.preventDefault();
        if (input.locked) { unlockPointer(); world.ui.say('Fare serbest: imleçle seç, dik, vur · orta tuş yeniden kilitler', 2200); }
        else { lockPointer(canvas); world.ui.say('Fare kilitli: bakış fareyle döner · orta tuş serbest bırakır', 1600); }
        return;
      }
      // Kilitliyken nişan zaten ekran ortasında (input.aim); serbestken imleçten alınır.
      if (!input.locked) updateAim(e);
    } else updateAim(e);
    const x = input.aim.x, z = input.aim.z, ui = world.ui;
    // Birimler tek tek yönetilmez: sol tık yalnızca yapı seçer ya da yerleştirme / toplanma noktasını onaylar.
    if (e.button === 0) {
      if (world.placing) { ui.confirmPlace(x, z); return; }
      if (world.rallyMode) { ui.confirmRally(x, z); return; }
      const s = pickOwnStructure(world, x, z);
      if (s) {
        // Çift tık (aynı yapıya 400 ms içinde ikinci tık): o türdeki bütün binaları seçer.
        const now = performance.now();
        const dbl = lastPick.s === s && now - lastPick.t < 400;
        lastPick.s = s; lastPick.t = now;
        ui.select(s, dbl);
        return;
      }
      if (world.mode === 'aoe') { clearSelection(world); ui.update(); return; }
      input.attackQueued = true;
    } else if (e.button === 2) {
      if (world.placing || world.rallyMode) { ui.cancelModes(true); return; }
      if (world.mode === 'aoe') return;
      input.rightDown = true; input.dodgeQueued = true;
    }
  });
  dragEl.hidden = true;
  window.addEventListener('pointerup', e => { if (e.button === 2 || e.buttons === 0) input.rightDown = false; });
  window.addEventListener('mouseup', e => { if (e.button === 2 || e.buttons === 0) input.rightDown = false; });
  window.addEventListener('pointercancel', () => { input.rightDown = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.rightDown = false; });
}

/** Fare kilidi ister; tarayıcı vermezse (izin, sekme odakta değil) sessizce vazgeçer, kullanıcı tekrar tıklar. */
export function lockPointer(canvas) {
  try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* kilit yok */ }
}
export function unlockPointer() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }

/**
 * Omuz üstü kamera. Biriken fare hareketi yaw / pitch'e işlenir, kamera kahramanın arkasına (sağ omuz üstüne) yerleşir ve
 * **nişan** (input.aim) ekran ortasındaki artının zemine değdiği nokta olur; artı ufka bakıyorsa nişan ileride
 * CAMERA.tps.aimFar uzaklığa alınır. İzlenen nokta kahramanı yumuşak izler (dt = 0: anında oturur).
 * Eksenler: ileri = (sin yaw, cos yaw), sağ = (-cos yaw, sin yaw); fare sağa → yaw azalır (sağa dönüş).
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
  // Artı ışını: kameradan izlenen noktaya, oradan zemine.
  const dx = tgt.x - camera.position.x, dy = tgt.y - camera.position.y, dz = tgt.z - camera.position.z;
  // Serbest farede (kilit yok) nişan imleçten gelir; artı ışını yalnızca kilitliyken nişan olur.
  if (!input.locked) return;
  if (dy < -1e-4) { const t = -camera.position.y / dy; input.aim.set(camera.position.x + dx * t, 0, camera.position.z + dz * t); }
  else input.aim.set(tgt.x + fx * c.aimFar, 0, tgt.z + fz * c.aimFar);
  input.hasAim = true;
}

/** Komutan modu kamerası: WASD / ok tuşları (kenar kaydırma yok). Ekran-sağ = dünya (+x, -z), ekran-aşağı = (+x, +z). */
export function updateCamera(world, dt) {
  const input = world.input, k = input.keys, t = world.camTarget;
  let sx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
  let sy = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
  if (!sx && !sy) return;
  const s = CAMERA.panSpeed * dt / Math.SQRT2;
  t.x += (sx + sy) * s; t.z += (-sx + sy) * s;
  t.x = Math.max(-HALF, Math.min(HALF, t.x)); t.z = Math.max(-HALF, Math.min(HALF, t.z));
}

/** Kahraman modunda girdiyi oyuncuya uygular; komutan modunda yalnızca otomatik vuruş çalışır (hareket beyinden). */
export function updatePlayerControl(world, dt) {
  const p = world.player, input = world.input;
  if (!p.alive) { p.moveDir.set(0, 0, 0); p.blocking = false; p.sprinting = false; input.attackQueued = input.dodgeQueued = input.jumpQueued = false; return; }
  if (world.mode === 'aoe') {
    p.blocking = false; p.sprinting = false; input.attackQueued = input.dodgeQueued = input.jumpQueued = false;
    return;
  }

  const k = input.keys;
  const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  const down = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
  const tps = world.cam === 'tps';
  let dx, dz;
  if (tps) {
    // Omuz üstü kamera: W kameranın baktığı yöne, D kameranın sağına (bkz. updateTpsCamera eksenleri).
    const yaw = world.look.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    dx = fx * -down + rx * right; dz = fz * -down + rz * right;
  } else {
    // İzometrik kamera: ekranda "yukarı" dünyada (-x,-z) köşegeni.
    dx = right + down; dz = -right + down;
  }
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }
  p.moveDir.set(dx, 0, dz);
  const moving = len > 0;

  // Kalkan tutma yok: sağ tık her kahraman türünde atılma + set etkisidir.
  p.blocking = false;
  p.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && moving;

  // Sağ tık: her sette imlece doğru **ileri atılma** + sete özel ikinci etki (Kılıçlı kılıç fırtınası, Mızraklı kazık alanı, Okçu ok yağmuru,
  // atlılarda yarıp geçme / mızrak hücumu / geriye yaylım; bkz. abilities.heroDash). Atılma mesafesi seviyeyle büyür.
  if (input.dodgeQueued) {
    input.dodgeQueued = false;
    if (p.dodgeCd <= 0 && p.stun <= 0) {
      // Atılma yönü: imlece (varsa) doğru, yoksa hareket / bakış yönü.
      let bx = moving ? dx : Math.sin(p.facing), bz = moving ? dz : Math.cos(p.facing);
      if (input.hasAim) {
        const ax = input.aim.x - p.pos.x, az = input.aim.z - p.pos.z, ad = Math.hypot(ax, az);
        if (ad > 0.6) { bx = ax / ad; bz = az / ad; }
      }
      p.facing = yawFromDir(bx, bz);
      // Önce set etkisi (fırlamadan önceki nokta: alan etkisi geride kalır), sonra atılma.
      heroDash(world, p, bx, bz);
      // İtme sürtünmeyle sönerek toplam dashDistance kadar yol aldırır (mesafe = itme / pushDrag).
      applyImpulse(p, bx, bz, dashDistance(p) * PHYSICS.pushDrag / p.invMass);
      world.ui.flash('dodge');
    }
  }
  if (input.jumpQueued) { input.jumpQueued = false; if (p.jumpY === 0 && p.vy === 0 && p.stun <= 0) p.vy = JUMP_SPEED; }

  // Vuruş sırasında nişan tıklanan noktada kilitli kalır; aksi hâlde imleci izler.
  const locked = p.attackTimer > 0 && p.aimLocked;
  if (!locked) { p.aimLocked = false; p.aim.copy(input.aim); }
  if (locked) p.facing = dampAngle(p.facing, yawFromDir(p.aim.x - p.pos.x, p.aim.z - p.pos.z), 20, dt);
  else if (p.blocking || p.attackTimer > 0) {
    if (input.hasAim) p.facing = dampAngle(p.facing, yawFromDir(input.aim.x - p.pos.x, input.aim.z - p.pos.z), 14, dt);
  } else if (tps && input.locked) p.facing = dampAngle(p.facing, world.look.yaw, 18, dt); // kilitli omuz üstü: yüz hep kameranın baktığı yönde (geri yürürken de)
  else if (moving) p.facing = dampAngle(p.facing, yawFromDir(dx, dz), 16, dt); // izometrik ya da serbest fare: yürüdüğü yöne

  // Kahraman **kendiliğinden vurmaz**: yalnızca sol tıkla ve tıklanan noktaya doğru vurur.
  // Nişan tıklama anında kilitlenir; vuruş boyunca (ok da dahil) o noktaya gider, imleci sonradan oynatmak yönü bozmaz.
  if (input.attackQueued) {
    input.attackQueued = false;
    if (input.hasAim) {
      const ax = input.aim.x - p.pos.x, az = input.aim.z - p.pos.z;
      p.aim.copy(input.aim); p.aimLocked = true;
      if (Math.hypot(ax, az) > 0.2) p.facing = yawFromDir(ax, az);
    }
    startAttack(p);
  }
}
