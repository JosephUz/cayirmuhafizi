/**
 * Görsel kanca arayüzü (fx). Simülasyon hiçbir mesh, sahne ya da DOM nesnesine dokunmaz: her görsel ve oyuncuya
 * özel geri bildirim buradan geçer. Üç uygulaması var:
 *  - view/scenefx.js: tarayıcıda gerçek mesh'leri kurar (tek başına oyunda simülasyon doğrudan bunu çağırır, çevrim içi
 *    oyunda istemci sunucudan gelen olayları buna çevirir).
 *  - net/netfx.js: sunucuda olayları kaydeder ve istemcilere yollar.
 *  - nullFx: başsız test (hiçbir şey yapmaz).
 * Nesneler (birim e, yapı s, eşya it, ok a, bölge z) yalnızca veridir; görünüm `.view` alanına takılır.
 */
const noop = () => {};
export const FX_METHODS = [
  'addEntity', 'removeEntity', 'refreshEntity',
  'addStructure', 'removeStructure',
  'addItem', 'removeItem',
  'addArrow', 'removeArrow',
  'addZone', 'removeZone',
  'burst', 'ring', 'heal', 'strip',
  'ping', 'flash', 'float', 'alert', 'rally',
];
export function nullFx() {
  const fx = {};
  for (const m of FX_METHODS) fx[m] = noop;
  return fx;
}
/** Eksik yöntemleri boş bırakarak kısmi bir uygulamayı tamamlar. */
export function completeFx(partial) {
  const fx = nullFx();
  return Object.assign(fx, partial);
}
