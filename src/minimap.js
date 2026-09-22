import { ALERT } from './config.js';

/**
 * Tamamen 2B minimap (Age of tarzı baklava): dünya (x, z) -> ekran (x - z, x + z) / 2.
 * Zemin ve ağaçlar arena kurulunca bir kez çizilir (rebuild); sis, yapılar, birimler ve kamera çerçevesi her karede.
 * Ölçek world.half'a bağlıdır: takım oyununda arena büyüyünce harita aynı kutuya sığar.
 * Sol tık kamerayı götürür, sağ tık seçili askerlere yürüme emri verir (hooks üzerinden).
 */
export function createMinimap(canvas, world, hooks) {
  const W = 264, H = 132;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  let half = 120, k = 1, s = 1;
  const toMap = (x, z) => [W / 2 + (x - z) * k, H / 2 + (x + z) * k * 0.5];
  const fromMap = (mx, my) => { const a = (mx - W / 2) / k, b = (my - H / 2) / (k * 0.5); return { x: (a + b) / 2, z: (b - a) / 2 }; };
  const clampMap = v => Math.max(-half + 2, Math.min(half - 2, v));

  // Zemin katmanı: üstten bakış, 1 birim = 1 px.
  const terrain = document.createElement('canvas');
  let fogCanvas = null, fc = null, img = null;

  /** Arena kurulunca: ölçek, zemin katmanı (yollar, ağaçlar, tarla / maden yerleri) ve sis tamponu yeniden. */
  function rebuild() {
    half = world.half;
    k = (W - 6) / (4 * half);
    s = k * Math.SQRT2; // üstten bakış görüntüsünde 1 dünya birimi = s px
    terrain.width = terrain.height = half * 2;
    const tc = terrain.getContext('2d');
    tc.fillStyle = '#8f9f58'; tc.fillRect(0, 0, half * 2, half * 2);
    tc.fillStyle = '#b9a66f';
    for (const p of world.lanePoints || []) tc.fillRect(p.x + half - 1.5, p.z + half - 1.5, 3, 3);
    tc.fillStyle = '#3d5f3f';
    for (const o of world.obstacles) if (o.radius < 1) tc.fillRect(o.pos.x + half - 1, o.pos.z + half - 1, 2, 2);
    for (const p of world.players) {
      const b = p.base; if (!b) continue;
      tc.fillStyle = '#7d6446'; tc.fillRect(b.farm.x + half - 3.5, b.farm.z + half - 3, 7, 6);
      tc.fillStyle = '#8d8f9a'; tc.fillRect(b.mine.x + half - 2, b.mine.z + half - 2, 4, 4);
    }
    const fog = world.fog;
    if (fog && (!fogCanvas || fogCanvas.width !== fog.N)) {
      fogCanvas = document.createElement('canvas'); fogCanvas.width = fogCanvas.height = fog.N;
      fc = fogCanvas.getContext('2d'); img = fc.createImageData(fog.N, fog.N);
    }
  }

  const drawTopDown = (image, size) => {
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1, 0.5); ctx.rotate(Math.PI / 4);
    ctx.drawImage(image, -size / 2 * s, -size / 2 * s, size * s, size * s);
    ctx.restore();
  };

  function drawFog() {
    const fog = world.fog; if (!fog || !fogCanvas) return;
    const N = fog.N, d = img.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k2 = j * N + i, o = ((N - 1 - j) * N + i) * 4; // satırlar: z artarken aşağı
      d[o] = 6; d[o + 1] = 9; d[o + 2] = 8;
      d[o + 3] = fog.visible[k2] ? 0 : fog.explored[k2] ? 130 : 255;
    }
    fc.putImageData(img, 0, 0);
    drawTopDown(fogCanvas, fog.W);
  }

  const dot = (x, z, color, r) => { const [mx, my] = toMap(x, z); ctx.fillStyle = color; ctx.fillRect(mx - r, my - r, r * 2, r * 2); };

  function draw() {
    const fog = world.fog;
    ctx.clearRect(0, 0, W, H);
    drawTopDown(terrain, half * 2);
    drawFog();
    for (const st of world.structures) {
      if (!st.alive) continue;
      if (st.faction !== 'blue' && !st.seen) continue;
      const r = st.kind === 'banner' ? 4 : st.kind === 'tower' ? 2.5 : 3;
      dot(st.pos.x, st.pos.z, st.faction === 'blue' ? '#5fc7ff' : st.faction === 'beast' ? (st.alive ? '#8fd15a' : '#6b5335') : '#ff5a4a', r);
      // Sancak: sahibinin rengiyle çerçevelenir (kendi sancağın altın, müttefik / rakip kendi renginde).
      if (st.kind === 'banner') { const [mx, my] = toMap(st.pos.x, st.pos.z); ctx.strokeStyle = st.owner ? st.owner.color : '#fff'; ctx.lineWidth = 1; ctx.strokeRect(mx - 4.5, my - 4.5, 9, 9); }
    }
    for (const e of world.entities) {
      if (!e.alive) continue;
      if (e.faction !== 'blue' && !fog.isVisible(e.pos.x, e.pos.z)) continue;
      if (e.isPlayer) dot(e.pos.x, e.pos.z, '#ffd12e', 2.5);
      else if (e.isHero) dot(e.pos.x, e.pos.z, e.owner ? e.owner.color : '#ff9a3c', 2.5);
      else dot(e.pos.x, e.pos.z, e.faction === 'blue' ? (e.isWorker ? '#a8ddff' : e.owner === world.me ? '#4aa8ff' : '#7fc2e8') : e.isBeast ? '#8fd15a' : '#ff3b2f', e.isWorker ? 1.2 : 1.6);
    }
    // Saldırı uyarıları: vurulan sancak / kule yerinde genişleyip sönen kırmızı halkalar.
    if (world.alerts) for (let i = world.alerts.length - 1; i >= 0; i--) {
      const al = world.alerts[i];
      const age = world.clock - al.t;
      if (age > ALERT.mapLife) { world.alerts.splice(i, 1); continue; }
      const k2 = age / ALERT.mapLife, [mx, my] = toMap(al.x, al.z);
      ctx.save();
      ctx.strokeStyle = `rgba(255,68,56,${(1 - k2).toFixed(2)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(mx, my, 3 + k2 * 11, (3 + k2 * 11) * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (world.sel) for (const e of world.sel.units) { if (!e.alive) continue; const [mx, my] = toMap(e.pos.x, e.pos.z); ctx.strokeStyle = '#eaffb0'; ctx.strokeRect(mx - 3, my - 3, 6, 6); }
    // Kamera çerçevesi.
    const c = hooks.viewCorners();
    if (c) {
      ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 1; ctx.beginPath();
      c.forEach((p, i) => { const [mx, my] = toMap(p.x, p.z); if (i) ctx.lineTo(mx, my); else ctx.moveTo(mx, my); });
      ctx.closePath(); ctx.stroke();
    }
    // Baklava kenarı.
    ctx.strokeStyle = '#c9a13d'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (const [i, [x, z]] of [[0, [-half, -half]], [1, [half, -half]], [2, [half, half]], [3, [-half, half]]]) { const [mx, my] = toMap(x, z); if (i) ctx.lineTo(mx, my); else ctx.moveTo(mx, my); }
    ctx.closePath(); ctx.stroke();
  }

  const pointToWorld = ev => {
    const r = canvas.getBoundingClientRect();
    const p = fromMap((ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H);
    return { x: clampMap(p.x), z: clampMap(p.z) };
  };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  let dragging = false;
  canvas.addEventListener('pointerdown', ev => {
    const p = pointToWorld(ev);
    if (ev.button === 2) hooks.onRight(p.x, p.z);
    else { dragging = true; hooks.onLeft(p.x, p.z); }
  });
  canvas.addEventListener('pointermove', ev => { if (dragging && (ev.buttons & 1)) { const p = pointToWorld(ev); hooks.onLeft(p.x, p.z); } else dragging = false; });
  window.addEventListener('pointerup', () => { dragging = false; });

  rebuild();
  return { draw, rebuild };
}
