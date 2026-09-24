import { EV } from './protocol.js';

/**
 * Sunucu fx'i: simülasyonun görsel isteklerini olay listesine yazar. Herkese giden olaylar `room.events`'e, oyuncuya özel
 * olanlar (ses, HUD parıltısı, uçan yazı, uyarı, bayrak) o oyuncunun kuyruğuna gider. Kuyruklar her durum paketiyle boşaltılır.
 * Doğuş olayları birimin **sabit** verisini taşır; değişkenler durum paketinden gelir (bkz. snapshot.js).
 */
const r2 = v => Math.round(v * 100) / 100;
export function entityAddEvent(e) {
  const flags = (e.isPlayer ? 1 : 0) | (e.isHero ? 2 : 0) | (e.isWorker ? 4 : 0) | (e.isBeast ? 8 : 0) | (e.isSiege ? 16 : 0) | (e.isBandit ? 32 : 0);
  return [EV.ENTITY_ADD, e.id, e.typeKey || '', e.owner ? e.owner.id : -1, e.faction, e.loadout.weapon, e.loadout.shield ? 1 : 0, e.loadout.horse ? 1 : 0, flags,
    e.workerKind || '', r2(e.radius), r2(e.vision || 10), Math.round(e.stats.maxHp), r2(e.stats.speed), r2(e.pos.x), r2(e.pos.z), r2(e.facing), r2(e.spawnTimer || 0), e.camp ? e.camp.id : -1];
}
export function structureAddEvent(s) {
  return [EV.STRUCT_ADD, s.id, s.kind, s.faction, s.owner ? s.owner.id : -1, r2(s.pos.x), r2(s.pos.z), s.ready ? 1 : 0, s.buildTime, Math.round(s.hp), s.maxHp, s.raidSide || ''];
}
export function itemAddEvent(it) {
  const f = it.fly;
  return [EV.ITEM_ADD, it.id, it.kind, it.owner ? it.owner.id : -1, r2(it.pos.x), r2(it.pos.z), f ? r2(f.fx) : r2(it.pos.x), f ? r2(f.fz) : r2(it.pos.z), f ? r2(f.tx) : r2(it.pos.x), f ? r2(f.tz) : r2(it.pos.z), f ? f.dur : 0, r2(it.ttl), r2(it.amount || 0)];
}
export function arrowAddEvent(a) {
  return [EV.ARROW_ADD, a.id, r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), r2(a.yaw), a.siege ? 1 : 0, a.homing ? 1 : 0, a.scale || 1, a.maxRange > 0 ? r2(a.origin.x) : 0, a.maxRange > 0 ? r2(a.origin.z) : 0, a.maxRange || 0];
}
export function zoneAddEvent(z) {
  const owner = z.owner || (z.kind === 'spin' ? z.source : null);
  return [EV.ZONE_ADD, z.id, z.kind, owner ? owner.id : -1, r2(z.owner ? z.owner.pos.x : z.x), r2(z.owner ? z.owner.pos.z : z.z), r2(z.radius), r2(z.life), r2(z.maxLife),
    z.bow ? 1 : 0, z.count || 0, z.vacuum ? r2(z.vacuum.radius) : 0, z.vacuum ? r2(z.vacuum.maxLife) : 0, z.arrows || 0, z.blades || 0, z.stakes || 0, z.tickEvery || 0];
}

/**
 * room: { events: [], playerEvents: Map<playerId, []> }. Oyuncuya özel olaylar oyuncunun `id`'sine (players.js) göre kuyruklanır;
 * gönderen bunu bağlantıya eşler.
 */
export function createNetFx(room) {
  const all = ev => room.events.push(ev);
  const one = (p, ev) => { if (!p || !p.human) return; let q = room.playerEvents.get(p.id); if (!q) { q = []; room.playerEvents.set(p.id, q); } q.push(ev); };
  return {
    addEntity(e) { all(entityAddEvent(e)); },
    removeEntity(e) { all([EV.ENTITY_DEL, e.id]); },
    refreshEntity(e) { all([EV.ENTITY_REFRESH, e.id, e.loadout.weapon, e.loadout.shield ? 1 : 0, e.loadout.horse ? 1 : 0, Math.round(e.stats.maxHp), r2(e.stats.speed), r2(e.radius)]); },
    addStructure(s) { all(structureAddEvent(s)); },
    removeStructure(s) { all([EV.STRUCT_DEL, s.id]); },
    addItem(it) { all(itemAddEvent(it)); },
    removeItem(it) { all([EV.ITEM_DEL, it.id]); },
    addArrow(a) { all(arrowAddEvent(a)); },
    removeArrow(a) { all([EV.ARROW_DEL, a.id]); },
    addZone(z) { if (z.kind !== 'burst') all(zoneAddEvent(z)); },
    removeZone(z) { if (z.kind !== 'burst') all([EV.ZONE_DEL, z.id]); },
    burst(x, y, z, color, count = 6, size = 0.1) { all([EV.BURST, r2(x), r2(y), r2(z), color, count, size]); },
    ring(x, z, color, radius, life = 0.5) { all([EV.RING, r2(x), r2(z), color, r2(radius), life]); },
    heal(x, y, z) { all([EV.HEAL, r2(x), r2(y), r2(z)]); },
    strip(x, z, ux, uz, len, width, color, life) { all([EV.STRIP, r2(x), r2(z), r2(ux), r2(uz), r2(len), r2(width), color, life]); },
    ping(p, kind) { one(p, [EV.PING, kind]); },
    flash(p, key) { one(p, [EV.FLASH, key]); },
    float(p, text, pos, color) { one(p, [EV.FLOAT, text, r2(pos.x), r2(pos.y || 0), r2(pos.z), color]); },
    alert(p, s) { one(p, [EV.ALERT, s.id]); },
    killer(p, src) { if (src) one(p, [EV.KILLER, src.kind ? 's' : 'e', src.id]); },
    rally(p) { const r = p.rally; one(p, [EV.RALLY, r ? r2(r.x) : null, r ? r2(r.z) : null, r ? r.color : null, r && r.target ? (r.target.kind ? 's' : 'e') + r.target.id : null]); },
  };
}

/** Yeni bağlanan (ya da geri bağlanan) oyuncuya dünyanın tamamı: bütün birim, yapı, eşya, ok ve bölge doğuş olayları. */
export function fullStateEvents(world) {
  const list = [];
  for (const s of world.structures) list.push(structureAddEvent(s));
  for (const e of world.entities) list.push(entityAddEvent(e));
  for (const it of world.items) list.push(itemAddEvent(it));
  for (const a of world.arrows) list.push(arrowAddEvent(a));
  for (const z of [...world.spins, ...world.tornadoes, ...world.zones]) if (z.kind !== 'burst') list.push(zoneAddEvent(z));
  return list;
}
