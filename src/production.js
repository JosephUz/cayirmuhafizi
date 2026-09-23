import { giveOrder } from './ai.js';
import { BUILDINGS, QUEUE, RALLY, SOLDIER_TYPES } from './config.js';
import { botRally, spawnUnit } from './economy.js';
import { statSpent } from './stats.js';

/**
 * Üretim kuyruğu (Age of tarzı): birim anında çıkmaz, binanın sırasına alınır ve türün üretim süresi dolunca binanın
 * yanında çıkar. Ücret **binanın sahibinin** kasasından sıraya alınırken düşer, iptalde geri gelir. Bina başına en fazla
 * QUEUE.max emir. Nüfus sınırı sıraya almayı engellemez (Age of tarzı): sınır doluyken emir alınır, asker sahada yer açılınca çıkar.
 */
export const typeOf = key => SOLDIER_TYPES.find(t => t.key === key);
/** Birim türünün toplanma sınıfı (piyade / okçu / süvari / savaş aleti); işçi için null. */
export const classOf = type => { const c = RALLY.classes.find(c => c.buildings.includes(type.building)); return c ? c.key : null; };
export const unitClass = e => (e.typeKey ? classOf(typeOf(e.typeKey)) : null);
/** Birim bedeli (altın + yiyecek + odun): karne ve skor için ortak değer. */
export const typeValue = t => (t ? t.cost + (t.food || 0) + (t.wood || 0) : 0);

/** O oyuncunun o türü basabilen hazır (inşası bitmiş, ayakta) binaları. */
export function producersOf(world, owner, kind) {
  return world.structures.filter(s => s.alive && s.ready && s.owner === owner && s.kind === kind);
}
/** Emri alacak bina: o türü basan hazır binalardan **sırası en kısa olanı**. Hazır bina yoksa inşa hâlindeki bina döner. */
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
/** O oyuncunun **toplam** işçi nüfusu: bütün türlerin kademe toplamı + sırada bekleyen işçiler. */
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

/** Emir alınabilir mi: hata metni ya da null (istemci anında geri bildirim için aynı denetimi yapar; sunucu yeniden denetler). */
export function enqueueError(world, owner, building, typeKey) {
  const type = typeOf(typeKey);
  if (!type) return 'Bilinmeyen birim';
  if (!building || !building.alive) return `${type.label} için önce ${BUILDINGS[type.building].label.toLowerCase()} kur`;
  if (building.owner !== owner) return 'Bu bina senin değil';
  if (!building.ready) return `${BUILDINGS[building.kind].label} henüz inşa ediliyor`;
  if (building.kind !== type.building) return `${type.label} ${BUILDINGS[type.building].from} basılır`;
  if (building.queue.length >= QUEUE.max) return `Sıra dolu (en fazla ${QUEUE.max} emir)`;
  // Nüfus sınırı emri **geri çevirmez** (Age of tarzı): asker sınırı doluyken de sıraya alınır ve ücreti şimdi düşer;
  // sahada yer açılınca sıradaki hemen çıkar (bkz. updateProduction). İşçide de sınır engellemez (bkz. economy.js trimWorkers).
  const bag = owner.eco, wood = type.wood || 0;
  if (bag.gold < type.cost || bag.food < type.food || bag.wood < wood) {
    if (wood) return `Yetersiz kaynak: ${type.label} ${type.cost} altın + ${wood} odun`;
    return type.food ? `Yetersiz kaynak: ${type.label} ${type.cost} altın + ${type.food} yiyecek` : `Yetersiz altın: ${type.label} ${type.cost} altın`;
  }
  return null;
}

/** Sıraya alır (ücret binanın sahibinden); olmazsa sebep döner. */
export function enqueue(world, building, typeKey, owner = building && building.owner) {
  const err = enqueueError(world, owner, building, typeKey);
  if (err) return err;
  const type = typeOf(typeKey), bag = owner.eco, wood = type.wood || 0;
  bag.gold -= type.cost; bag.food -= type.food; bag.wood -= wood;
  statSpent(owner, typeValue(type));
  building.queue.push(type.key);
  if (owner.human) { world.fx.flash(owner, 'gold'); world.fx.ping(owner, 'worker'); }
  return null;
}

/** Sıradaki bir emri iptal eder, ücreti binanın sahibine geri verir. */
export function cancelQueued(world, building, index) {
  if (!building || index < 0 || index >= building.queue.length) return;
  const type = typeOf(building.queue[index]);
  building.queue.splice(index, 1);
  if (index === 0) building.progress = 0;
  const bag = building.owner.eco; bag.gold += type.cost; bag.food += type.food; bag.wood += type.wood || 0;
  statSpent(building.owner, -typeValue(type));
  if (building.owner.human) world.fx.flash(building.owner, 'gold');
}

/** Sıraların ilerlemesi; süre dolunca birim çıkar. */
export function updateProduction(world, dt) {
  // Sahadaki asker sayısı her bina için değil, sahip başına bir kez sayılır (5v5'te onlarca bina x yüzlerce birim).
  const field = new Map();
  const fieldOf = owner => { let n = field.get(owner); if (n == null) { n = fieldArmy(world, owner); field.set(owner, n); } return n; };
  for (const s of world.structures) {
    if (!s.alive || !s.ready || !s.queue.length) { s.progress = 0; continue; }
    const type = typeOf(s.queue[0]);
    // Sahadaki asker sınırı doluysa **çıkış** durur (sıraya alma değil): emir sırada bekler, üretim süresi dolmuş olarak
    // tutulur ve asker ölüp yer açılınca sıradaki hemen çıkar. HUD'daki ⏳ sayısı bekleyeni gösterir.
    if (!type.worker && fieldOf(s.owner) >= world.limits.army) {
      s.progress = Math.min(s.progress + dt, type.train);
      if (s.owner.st) s.owner.st.capTime += dt;
      continue;
    }
    s.progress += dt;
    if (s.progress < type.train) continue;
    s.progress = 0; s.queue.shift();
    const e = spawnUnit(world, type.key, s.owner, s);
    if (!e) continue;
    if (!e.isWorker) field.set(s.owner, fieldOf(s.owner) + 1);
    // Bot askeri ordu toplanma noktasına yürür; insanın askeri emir almaz: kendi beyniyle bayrağa gider (ai.js updateAggressive).
    if (!e.isWorker && !s.owner.human) { const r = botRally(world, s.owner); if (r) giveOrder(world, [e], { kind: 'move', x: r.x, z: r.z }); }
    if (s.owner.human) world.fx.ping(s.owner, type.worker ? 'worker' : 'soldier');
  }
}
