import { giveOrder } from './ai.js';
import { BUILDINGS, QUEUE, RALLY, SOLDIER_TYPES } from './config.js';
import { botRally, spawnUnit } from './economy.js';

/**
 * Üretim kuyruğu (Age of tarzı): birim anında çıkmaz, binanın sırasına alınır ve
 * türün üretim süresi dolunca binanın yanında (toplanma bayrağı varsa oraya yürüyerek) çıkar.
 * Ücret **binanın sahibinin** kasasından sıraya alınırken düşer, iptalde geri gelir. Bina başına en fazla QUEUE.max emir.
 * Sayımlar oyuncu başınadır (owner: players.js oyuncusu); sınırlar world.limits'ten okunur.
 */
export const typeOf = key => SOLDIER_TYPES.find(t => t.key === key);
/** Birim türünün toplanma sınıfı (piyade / okçu / süvari / savaş aleti); işçi için null. */
export const classOf = type => { const c = RALLY.classes.find(c => c.buildings.includes(type.building)); return c ? c.key : null; };
export const unitClass = e => (e.typeKey ? classOf(typeOf(e.typeKey)) : null);

/** O oyuncunun o türü basabilen hazır (inşası bitmiş, ayakta) binaları. */
export function producersOf(world, owner, kind) {
  return world.structures.filter(s => s.alive && s.ready && s.owner === owner && s.kind === kind);
}
/**
 * Emri alacak bina: o türü basan hazır binalardan **sırası en kısa olanı**. Böylece aynı türden ikinci bir bina
 * kurmak üretimi ikiye katlar (emirler binalara dağılır, paralel basılır). Hazır bina yoksa, doğru hata mesajı
 * çıkabilsin diye inşa hâlindeki bina döner.
 */
export function bestProducer(world, owner, kind) {
  let best = null;
  for (const s of producersOf(world, owner, kind)) if (!best || s.queue.length < best.queue.length) best = s;
  return best || world.structures.find(s => s.alive && s.owner === owner && s.kind === kind) || null;
}

/** O oyuncunun sırada bekleyen asker (işçi değil) sayısı. */
export function queuedSoldiers(world, owner) {
  let n = 0;
  for (const s of world.structures) if (s.alive && s.owner === owner) for (const k of s.queue) if (!typeOf(k).worker) n++;
  return n;
}
/** O oyuncunun **sahadaki** asker sayısı (kahraman ve işçi hariç, sıra sayılmaz). */
export function fieldArmy(world, owner) {
  let n = 0;
  for (const e of world.entities) if (e.alive && e.owner === owner && !e.isWorker && !e.isHero && !e.isPlayer) n++;
  return n;
}
/** O oyuncunun asker nüfusu: sahadaki askerler (kahraman ve işçi hariç) + sırada bekleyenler. */
export function armyCount(world, owner) {
  return queuedSoldiers(world, owner) + fieldArmy(world, owner);
}
/** O oyuncunun **toplam** işçi nüfusu: bütün türlerin kademe toplamı + sırada bekleyen işçiler (sınır bunun üstünden işler). */
export function workerTotal(world, owner) {
  let n = 0;
  for (const e of world.entities) if (e.alive && !e.merged && e.owner === owner && e.isWorker) n += e.tier || 1;
  for (const s of world.structures) if (s.alive && s.owner === owner) for (const k of s.queue) if (typeOf(k).worker) n++;
  return n;
}
export function queuedOf(world, owner, key) {
  let n = 0;
  for (const s of world.structures) if (s.alive && s.owner === owner) for (const k of s.queue) if (k === key) n++;
  return n;
}

/** Sıraya alır (ücret binanın sahibinden); olmazsa sebep döner. */
export function enqueue(world, building, typeKey, owner = building && building.owner) {
  const type = typeOf(typeKey);
  if (!type) return 'Bilinmeyen birim';
  if (!building || !building.alive) return `${type.label} için önce ${BUILDINGS[type.building].label.toLowerCase()} kur`;
  if (!building.ready) return `${BUILDINGS[building.kind].label} henüz inşa ediliyor`;
  if (building.kind !== type.building) return `${type.label} ${BUILDINGS[type.building].from} basılır`;
  if (building.queue.length >= QUEUE.max) return `Sıra dolu (en fazla ${QUEUE.max} emir)`;
  // Nüfus sınırı: asker türlerinin toplamı world.limits.army (oyuncu başına). İşçide sınır **toplamdır** ve emri geri
  // çevirmez: sınır doluyken çıkan işçi en kalabalık türden bir kademe eksiltip onun yerine geçer (bkz. economy.js trimWorkers).
  if (!type.worker && armyCount(world, owner) >= world.limits.army) return `Asker sınırı dolu (en fazla ${world.limits.army} asker)`;
  const bag = owner.eco, wood = type.wood || 0;
  if (bag.gold < type.cost || bag.food < type.food || bag.wood < wood) {
    if (wood) return `Yetersiz kaynak: ${type.label} ${type.cost} altın + ${wood} odun`;
    return type.food ? `Yetersiz kaynak: ${type.label} ${type.cost} altın + ${type.food} yiyecek` : `Yetersiz altın: ${type.label} ${type.cost} altın`;
  }
  bag.gold -= type.cost; bag.food -= type.food; bag.wood -= wood;
  building.queue.push(type.key);
  if (owner.human) { world.ui.flash('gold'); world.ui.ping('worker'); }
  return null;
}

/** Sıradaki bir emri iptal eder, ücreti binanın sahibine geri verir. */
export function cancelQueued(world, building, index) {
  if (!building || index < 0 || index >= building.queue.length) return;
  const type = typeOf(building.queue[index]);
  building.queue.splice(index, 1);
  if (index === 0) building.progress = 0;
  const bag = building.owner.eco; bag.gold += type.cost; bag.food += type.food; bag.wood += type.wood || 0;
  if (building.owner.human) world.ui.flash('gold');
}

/** Sıraların ilerlemesi; süre dolunca birim çıkar. */
export function updateProduction(world, dt) {
  // Sahadaki asker sayısı her bina için değil, sahip başına bir kez sayılır (5v5'te onlarca bina x yüzlerce birim).
  const field = new Map();
  const fieldOf = owner => { let n = field.get(owner); if (n == null) { n = fieldArmy(world, owner); field.set(owner, n); } return n; };
  for (const s of world.structures) {
    if (!s.alive || !s.ready || !s.queue.length) { s.progress = 0; continue; }
    const type = typeOf(s.queue[0]);
    // Asker sınırı dolduysa üretim durur: emir sırada bekler, asker ölüp yer açılınca hemen çıkar.
    if (!type.worker && fieldOf(s.owner) >= world.limits.army) {
      s.progress = Math.min(s.progress + dt, type.train);
      s.holdMsg = (s.holdMsg || 0) - dt;
      if (s.owner === world.me && s.holdMsg <= 0) { s.holdMsg = 6; world.ui.say(`Asker sınırı dolu (${world.limits.army}): üretim bekliyor`, 1800); }
      continue;
    }
    s.progress += dt;
    if (s.progress < type.train) continue;
    s.progress = 0; s.queue.shift();
    const e = spawnUnit(world, type.key, s.owner, s);
    if (!e) continue;
    if (!e.isWorker) field.set(s.owner, fieldOf(s.owner) + 1);
    // Çıkan asker sınıfının toplanma yerine (senin), botta ordu toplanma noktasına yürür.
    if (!e.isWorker) { const r = s.owner === world.me ? world.rally[classOf(type)] : !s.owner.human ? botRally(world, s.owner) : null; if (r) giveOrder(world, [e], { kind: 'move', x: r.x, z: r.z }); }
    // İşçi sınırı doluysa yerine geçtiği türü de söyle.
    const swap = e.replacedLabel ? ` · işçi sınırı dolu (${world.limits.workers}), 1 ${e.replacedLabel} azaldı` : '';
    if (s.owner === world.me) { world.ui.say(`${type.label} hazır${swap}${s.queue.length ? ` · sırada ${s.queue.length}` : ''}`, swap ? 2200 : 1400); world.ui.ping(type.worker ? 'worker' : 'soldier'); }
  }
}
