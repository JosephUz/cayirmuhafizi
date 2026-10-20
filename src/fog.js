import * as T from 'three';
import { BUILDINGS, FOG, HALF, TOWER, VISION } from './config.js';
import { knownBy, markKnown } from './structures.js';

/**
 * Savaş sisi. Harita bir hücre ızgarasına bölünür; izlenen takımın (world.side: istemcide senin takımın, sunucuda mavi)
 * her birimi ve yapısı kendi görüş yarıçapındaki hücreleri "görünür" yapar, görülen hücreler kalıcı olarak "keşfedilmiş"
 * olur. Öbür takımın bilgisi (hangi yapıyı gördüğü) yakınlıkla tutulur (seen / seenByRed); karartma yalnızca istemcide, sahne verildiğinde (world.scene) yüksekte duran ve kamera açısına göre
 * kaydırılmış bir düzlemle çizilir.
 */
export function createFog(world) {
  const cell = VISION.cell, margin = 20, W = HALF * 2 + margin * 2, N = Math.round(W / cell);
  const explored = new Uint8Array(N * N), visible = new Uint8Array(N * N);
  let data = null, tex = null, plane = null;
  if (world.scene) {
    data = new Uint8Array(N * N * 4);
    tex = new T.DataTexture(data, N, N, T.RGBAFormat);
    tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter; tex.needsUpdate = true;
    // Kamera bakışı (24, 29, 24) yönünde: h yükseklikteki düzlem zemine göre d kadar kayar.
    const h = 10, d = (24 / 29) * h;
    plane = new T.Mesh(new T.PlaneGeometry(W, W), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    plane.rotation.x = -Math.PI / 2; plane.position.set(d, h, d); plane.renderOrder = 100; plane.frustumCulled = false;
    world.scene.add(plane);
  }

  const ci = x => Math.floor((x + W / 2) / cell), cj = z => Math.floor((W / 2 - z) / cell);
  const inGrid = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  const idx = (x, z) => { const i = ci(x), j = cj(z); return inGrid(i, j) ? j * N + i : -1; };

  function mark(x, z, r) {
    const i0 = Math.max(0, ci(x - r)), i1 = Math.min(N - 1, ci(x + r)), j0 = Math.max(0, cj(z + r)), j1 = Math.min(N - 1, cj(z - r));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const cz = W / 2 - (j + 0.5) * cell, dz = cz - z;
      for (let i = i0; i <= i1; i++) {
        const cx = -W / 2 + (i + 0.5) * cell, dx = cx - x;
        if (dx * dx + dz * dz <= r2) visible[j * N + i] = 1;
      }
    }
  }

  let timer = 0;
  const fog = {
    N, W, cell, explored, visible, plane,
    enabled: true,
    /** Her yeniden hesaplamada artar: minimap sis katmanını yalnızca bu değişince yeniden çizer. */
    version: 0,
    /** Omuz üstü kamerada karartma düzlemi kapanır: görünürlük 3B görüş mesafesiyle işler, ızgara minimap için sürer. */
    setPerspective(on) { if (plane) plane.visible = !on; },
    /** Görüşü yeniden hesaplar; aralık dolmadıysa false döner. */
    update(dt, force = false) {
      timer += dt;
      if (!force && timer < FOG.updateEvery) return false;
      timer = 0;
      visible.fill(0);
      const side = world.side === 'red' ? 'red' : 'blue', other = side === 'red' ? 'blue' : 'red';
      if (fog.enabled) {
        for (const e of world.entities) {
          if (!e.alive || e.faction !== side) continue;
          mark(e.pos.x, e.pos.z, e.vision || VISION.soldier);
        }
        for (const s of world.structures) {
          if (!s.alive || s.faction !== side) continue;
          mark(s.pos.x, s.pos.z, BUILDINGS[s.kind].vision * (s.ready ? 1 : 0.5));
        }
      } else visible.fill(1);
      // Öbür takımın bilgisi: izlenen takımın yapısı, öbür takımın bir biriminin ya da yapısının görüşüne girince bilinir olur.
      for (const s of world.structures) {
        if (!s.alive || s.faction !== side || knownBy(s, other)) continue;
        let hit = false;
        for (const e of world.entities) {
          if (!e.alive || e.faction !== other) continue;
          const dx = e.pos.x - s.pos.x, dz = e.pos.z - s.pos.z, r = (e.vision || VISION.soldier) + s.radius;
          if (dx * dx + dz * dz <= r * r) { hit = true; break; }
        }
        if (!hit) for (const r of world.structures) {
          if (!r.alive || r.faction !== other) continue;
          if (Math.hypot(r.pos.x - s.pos.x, r.pos.z - s.pos.z) <= BUILDINGS[r.kind].vision + s.radius) { hit = true; break; }
        }
        if (hit) markKnown(s, other);
      }
      // Görünen rakip yapı bilinir olur (sis dokusunu beklemeden: bkz. ai.js knownTo da aynı işi yapar).
      for (const s of world.structures) if (!knownBy(s, side) && s.alive && fog.isVisible(s.pos.x, s.pos.z)) markKnown(s, side);
      // Rakip kulenin halkası görüşe girdi mi (yalnız istemci, çizim için): halka üzerinde 48 noktadan biri görünürse
      // ya da kule görünürse halka çizilir. Kule sisteyken bile oyuncu menzilin sınırını içine girmeden görür.
      if (plane) for (const s of world.structures) {
        if (s.kind !== 'tower' || s.faction === side) continue;
        s.ringSeen = false;
        if (!s.alive || !s.ready) continue;
        const r = TOWER.range - TOWER.ring / 2;
        for (let k = 0; k < 48 && !s.ringSeen; k++) { const a = (k / 48) * Math.PI * 2; s.ringSeen = fog.isVisible(s.pos.x + Math.cos(a) * r, s.pos.z + Math.sin(a) * r); }
      }
      for (let k = 0; k < N * N; k++) if (visible[k]) explored[k] = 1;
      if (data) {
        const ea = Math.round(255 * FOG.exploredAlpha);
        for (let k = 0; k < N * N; k++) {
          const o = k * 4;
          data[o] = 8; data[o + 1] = 12; data[o + 2] = 10;
          data[o + 3] = visible[k] ? 0 : explored[k] ? ea : 255;
        }
        tex.needsUpdate = true;
      }
      fog.version++;
      return true;
    },
    isVisible(x, z) { const k = idx(x, z); return k >= 0 && visible[k] === 1; },
    isExplored(x, z) { const k = idx(x, z); return k >= 0 && explored[k] === 1; },
    reset() { explored.fill(0); visible.fill(0); fog.update(0, true); },
  };
  return fog;
}
