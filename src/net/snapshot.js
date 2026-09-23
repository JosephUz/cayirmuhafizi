import { SOLDIER_TYPES } from '../config.js';

/**
 * Durum paketi (ikili, little-endian). Sunucu her NET.snapshotEvery adımda bir kurar; yalnızca **değişen** kayıtlar girer
 * (birim kaydının baytları öncekiyle aynıysa atlanır: duran işçi, bekleyen asker paket kaplamaz).
 *
 *  u8 0x01 | f32 zaman
 *  u16 nBirim | birim kayıtları (22 bayt):
 *    u16 id | i16 x*50 | i16 z*50 | i16 yön*1000 | u16 can | u16 azamiCan | u8 bayraklar | u8 zıplama*20 |
 *    u8 vuruşSayacı*100 | u8 vuruşParıltısı/0.18*255 | u8 seviye | u8 kademe | u8 şarj*255 | u8 ölüm | u16 exp
 *  u16 nYapı | yapı kayıtları (değişken): u16 id | u16 can | u8 bayraklar | u16 inşaSayacı*100 | u8 ilerleme*255/eğitim |
 *    u16 yenidenKurulma*10 | u16 dalga*10 | u8 parıltı | u8 atış | u8 sıraUzunluğu | sıra (u8 tür indeksi)...
 *  u16 nOk | ok kayıtları (10 bayt): u16 id | i16 x*50 | i16 y*100 | i16 z*50 | i16 yön*1000
 *  u16 nBölge | bölge kayıtları (12 bayt): u16 id | i16 x*50 | i16 z*50 | u16 yarıçap*100 | u16 ömür*100 | u16 vakumÖmrü*100
 * Bayraklar (birim): 1 canlı, 2 koşuyor, 4 çalışıyor, 8 şarj, 16 sersem, 32 atılma, 64 kalkan, 128 birleşti.
 * Bayraklar (yapı): 1 canlı, 2 hazır, 4 görüldü (mavi), 8 kırmızıca görüldü.
 */
const TYPE_INDEX = new Map(SOLDIER_TYPES.map((t, i) => [t.key, i]));
const TYPE_KEYS = SOLDIER_TYPES.map(t => t.key);
const clampI16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));
const clampU16 = v => Math.max(0, Math.min(65535, Math.round(v)));
const clampU8 = v => Math.max(0, Math.min(255, Math.round(v)));
export const ENTITY_BYTES = 22;

class Writer {
  constructor(size) { this.buf = new ArrayBuffer(size); this.dv = new DataView(this.buf); this.o = 0; }
  ensure(n) {
    if (this.o + n <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.o));
    this.buf = nb; this.dv = new DataView(nb);
  }
  u8(v) { this.ensure(1); this.dv.setUint8(this.o, clampU8(v)); this.o += 1; }
  u16(v) { this.ensure(2); this.dv.setUint16(this.o, clampU16(v), true); this.o += 2; }
  i16(v) { this.ensure(2); this.dv.setInt16(this.o, clampI16(v), true); this.o += 2; }
  f32(v) { this.ensure(4); this.dv.setFloat32(this.o, v, true); this.o += 4; }
  bytes() { return new Uint8Array(this.buf, 0, this.o); }
}

function entityFlags(e) {
  return (e.alive ? 1 : 0) | (e.sprinting ? 2 : 0) | (e.working ? 4 : 0) | (e.charging ? 8 : 0) | (e.stun > 0 ? 16 : 0) | (e.dodgeTimer > 0 ? 32 : 0) | (e.blocking ? 64 : 0) | (e.merged ? 128 : 0);
}
/** Birim kaydını 22 baytlık bir Uint8Array'e yazar (değişiklik karşılaştırması için ayrı tutulur). */
function encodeEntity(e, out) {
  const dv = new DataView(out.buffer, out.byteOffset, ENTITY_BYTES);
  dv.setUint16(0, e.id, true);
  dv.setInt16(2, clampI16(e.pos.x * 50), true);
  dv.setInt16(4, clampI16(e.pos.z * 50), true);
  dv.setInt16(6, clampI16(e.facing * 1000), true);
  dv.setUint16(8, clampU16(e.hp), true);
  dv.setUint16(10, clampU16(e.stats.maxHp), true);
  dv.setUint8(12, entityFlags(e));
  dv.setUint8(13, clampU8(e.jumpY * 20));
  dv.setUint8(14, clampU8(e.attackTimer * 100));
  dv.setUint8(15, clampU8(e.hitFlash / 0.18 * 255));
  dv.setUint8(16, clampU8(e.level || 1));
  dv.setUint8(17, clampU8(e.tier || 1));
  dv.setUint8(18, clampU8((e.charging ? e.charge || 0 : 0) * 255));
  dv.setUint8(19, clampU8(e.deaths || 0));
  dv.setUint16(20, clampU16(e.xp || 0), true);
  return out;
}
const scratch = new Uint8Array(ENTITY_BYTES);
function sameBytes(a, b) { for (let i = 0; i < ENTITY_BYTES; i++) if (a[i] !== b[i]) return false; return true; }

export function encodeSnapshot(world, force = false) {
  const w = new Writer(4096);
  w.u8(1); w.f32(world.time);
  // Birimler: yalnızca değişenler.
  const changed = [];
  for (const e of world.entities) {
    encodeEntity(e, scratch);
    if (!force && e.netPrev && sameBytes(e.netPrev, scratch)) continue;
    if (!e.netPrev) e.netPrev = new Uint8Array(ENTITY_BYTES);
    e.netPrev.set(scratch);
    changed.push(e.netPrev);
  }
  w.u16(changed.length);
  for (const b of changed) { w.ensure(ENTITY_BYTES); new Uint8Array(w.buf, w.o, ENTITY_BYTES).set(b); w.o += ENTITY_BYTES; }
  // Yapılar: hepsi (az sayıda, kısa kayıt).
  w.u16(world.structures.length);
  for (const s of world.structures) {
    w.u16(s.id); w.u16(s.hp);
    w.u8((s.alive ? 1 : 0) | (s.ready ? 2 : 0) | (s.seen ? 4 : 0) | (s.seenByRed ? 8 : 0));
    w.u16(Math.max(0, s.buildTimer) * 100);
    const t0 = s.queue.length ? SOLDIER_TYPES[TYPE_INDEX.get(s.queue[0])] : null;
    w.u8(t0 ? s.progress / t0.train * 255 : 0);
    w.u16(Math.max(0, s.respawnTimer || 0) * 10); w.u16(Math.max(0, s.waveTimer || 0) * 10);
    w.u8(s.hitFlash / 0.18 * 255); w.u8((s.shots || 0) & 255);
    w.u8(s.queue.length);
    for (const k of s.queue) w.u8(TYPE_INDEX.get(k) ?? 255);
  }
  w.u16(world.arrows.length);
  for (const a of world.arrows) { w.u16(a.id); w.i16(a.pos.x * 50); w.i16(a.pos.y * 100); w.i16(a.pos.z * 50); w.i16(a.yaw * 1000); }
  const zones = [...world.spins, ...world.tornadoes, ...world.zones.filter(z => z.kind !== 'burst')];
  w.u16(zones.length);
  for (const z of zones) {
    const x = z.owner ? z.owner.pos.x : z.x, zz = z.owner ? z.owner.pos.z : z.z;
    w.u16(z.id); w.i16(x * 50); w.i16(zz * 50); w.u16(z.radius * 100); w.u16(Math.max(0, z.life) * 100); w.u16(z.vacuum ? Math.max(0, z.vacuum.life) * 100 : 0);
  }
  return w.bytes();
}

/** Paketi çözer: düz nesneler döner, dünyaya uygulamak istemcinin işi (bkz. net/client.js). */
export function decodeSnapshot(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const u8 = () => dv.getUint8(o++);
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const i16 = () => { const v = dv.getInt16(o, true); o += 2; return v; };
  if (u8() !== 1) return null;
  const time = dv.getFloat32(o, true); o += 4;
  const n = u16(), entities = new Array(n);
  for (let i = 0; i < n; i++) {
    const rec = { id: u16(), x: i16() / 50, z: i16() / 50, facing: i16() / 1000, hp: u16(), maxHp: u16() };
    const f = u8();
    rec.alive = Boolean(f & 1); rec.sprinting = Boolean(f & 2); rec.working = Boolean(f & 4); rec.charging = Boolean(f & 8);
    rec.stun = Boolean(f & 16); rec.dodge = Boolean(f & 32); rec.blocking = Boolean(f & 64); rec.merged = Boolean(f & 128);
    rec.jumpY = u8() / 20; rec.attackTimer = u8() / 100; rec.hitFlash = u8() / 255 * 0.18; rec.level = u8(); rec.tier = u8(); rec.charge = u8() / 255;
    rec.deaths = u8(); rec.xp = u16();
    entities[i] = rec;
  }
  const ns = u16(), structures = new Array(ns);
  for (let i = 0; i < ns; i++) {
    const rec = { id: u16(), hp: u16() };
    const f = u8();
    rec.alive = Boolean(f & 1); rec.ready = Boolean(f & 2); rec.seen = Boolean(f & 4); rec.seenByRed = Boolean(f & 8);
    rec.buildTimer = u16() / 100; rec.progressK = u8() / 255; rec.respawnTimer = u16() / 10; rec.waveTimer = u16() / 10;
    rec.hitFlash = u8() / 255 * 0.18; rec.shots = u8();
    const ql = u8(); rec.queue = new Array(ql);
    for (let k = 0; k < ql; k++) { const ti = u8(); rec.queue[k] = TYPE_KEYS[ti] || null; }
    structures[i] = rec;
  }
  const na = u16(), arrows = new Array(na);
  for (let i = 0; i < na; i++) arrows[i] = { id: u16(), x: i16() / 50, y: i16() / 100, z: i16() / 50, yaw: i16() / 1000 };
  const nz = u16(), zones = new Array(nz);
  for (let i = 0; i < nz; i++) zones[i] = { id: u16(), x: i16() / 50, z: i16() / 50, radius: u16() / 100, life: u16() / 100, vacuumLife: u16() / 100 };
  return { time, entities, structures, arrows, zones };
}
