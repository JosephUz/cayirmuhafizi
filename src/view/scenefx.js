import { buildView, rebuildSwing, removeView } from '../characters.js';
import { CAMERA } from '../config.js';
import { completeFx } from '../fx.js';
import { burst, healBubble, ring, strip } from './effects.js';
import { attachArrowView, attachItemView, detachArrowView, detachItemView, rallyFlag } from './itemview.js';
import { attachStructureView, detachStructureView } from './structview.js';
import { attachZoneView, detachZoneView } from './zones.js';

/**
 * Sahne fx'i: simülasyonun görsel isteklerini gerçek mesh'lere çevirir. Tek başına oyunda simülasyon bunu doğrudan
 * çağırır; çevrim içi oyunda istemci (net/client.js) sunucudan gelen olayları bunun aynı yöntemlerine iletir.
 * Oyuncuya özel geri bildirim (ping / flash / float / alert) yalnızca yerel oyuncu (world.me) içinse arayüze gider.
 */
/**
 * Ölüm kamerası: seni öldüren birim ya da yapı CAMERA.killcam saniye boyunca kamerayı üstüne çeker ve **sis içinde
 * olsa da** çizilir (bkz. main.js). Katil bir yapıysa (kule) kalıcı olarak açılır: bir daha o kulenin yerini bilirsin.
 */
function setKillcam(world, src) {
  world.killcam = { target: src, until: world.clock + CAMERA.killcam };
  if (src.kind) src.seen = true;
}

export function createSceneFx(world) {
  const mine = p => p && p === world.me;
  return completeFx({
    addEntity(e) { if (!e.view) buildView(world.scene, e); },
    removeEntity(e) { removeView(e); },
    refreshEntity(e) { removeView(e); buildView(world.scene, e); rebuildSwing(e); if (e === world.player) world.loadout = e.loadout; },
    addStructure(s) { if (!s.view) attachStructureView(world.scene, s); },
    removeStructure(s) { detachStructureView(s); },
    addItem(it) { if (!it.view) attachItemView(world.scene, it); },
    removeItem(it) { detachItemView(it); },
    addArrow(a) { if (!a.view) attachArrowView(world.scene, a); },
    removeArrow(a) { detachArrowView(a); },
    addZone(z) { if (!z.view) attachZoneView(world.scene, z); },
    removeZone(z) { detachZoneView(z); },
    burst(x, y, z, color, count, size) { burst(world, x, y, z, color, count, size); },
    ring(x, z, color, radius, life) { ring(world, x, z, color, radius, life); },
    heal(x, y, z) { healBubble(world, x, y, z); },
    strip(x, z, ux, uz, len, width, color, life) { strip(world, x, z, ux, uz, len, width, color, life); },
    ping(p, kind) { if (mine(p) && world.ui) world.ui.ping(kind); },
    flash(p, key) { if (mine(p) && world.ui) world.ui.flash(key); },
    float(p, text, pos, color) { if (mine(p) && world.ui) world.ui.float(text, pos, color); },
    alert(p, s) {
      if (!mine(p)) return;
      world.alerts.push({ x: s.pos.x, z: s.pos.z, t: world.clock });
      if (world.alerts.length > 12) world.alerts.shift();
      if (world.ui) world.ui.alert();
    },
    /** Seni öldüren birim ya da yapı: kamera oraya odaklanır, nesne sis içinde olsa da çizilir. */
    killer(p, src) {
      if (!mine(p) || !src) return;
      setKillcam(world, src);
    },
    rally(p) {
      if (!mine(p)) return;
      if (world.rallyView) { world.scene.remove(world.rallyView); world.rallyView = null; }
      if (p.rally) world.rallyView = rallyFlag(world.scene, p.rally.x, p.rally.z, p.rally.color);
    },
  });
}
