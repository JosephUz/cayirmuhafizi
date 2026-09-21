import { giveOrder } from './ai.js';
import { BUILDINGS, LIMITS, QUEUE, RALLY, SOLDIER_TYPES } from './config.js';
import { enemyRally, spawnUnit } from './economy.js';

/**
 * Üretim kuyruğu (Age of tarzı): birim anında çıkmaz, binanın sırasına alınır ve
 * türün üretim süresi dolunca binanın yanında (toplanma bayrağı varsa oraya yürüyerek) çıkar.
 * Altın sıraya alınırken düşer, iptalde geri gelir. Bina başına en fazla QUEUE.max emir.
 */
export const typeOf = key => SOLDIER_TYPES.find(t => t.key === key);
/** Birim türünün toplanma sınıfı (piyade / okçu / süvari / savaş aleti); işçi için null. */
export const classOf = type => { const c = RALLY.classes.find(c => c.buildings.includes(type.building)); return c ? c.key : null; };
export const unitClass = e => (e.typeKey ? classOf(typeOf(e.typeKey)) : null);
const bagOf = (world, faction) => (faction === 'blue' ? world.eco : world.enemyEco);

/** O türü basabilen hazır (inşası bitmiş, ayakta) binalar. */
export function producersOf(world, faction, kind) {
  return world.structures.filter(s => s.alive && s.ready && s.faction === faction && s.kind === kind);
}
/**
 * Emri alacak bina: o türü basan hazır binalardan **sırası en kısa olanı**. Böylece aynı türden ikinci bir bina
 * kurmak üretimi ikiye katlar (emirler binalara dağılır, paralel basılır). Hazır bina yoksa, doğru hata mesajı
 * çıkabilsin diye inşa hâlindeki bina döner.
 */
export function bestProducer(world, faction, kind) {
  let best = null;
  for (const s of producersOf(world, faction, kind)) if (!best || s.queue.length < best.queue.length) best = s;
  return best || world.structures.find(s => s.alive && s.faction === faction && s.kind === kind) || null;
}

/** O tarafın sırada bekleyen asker (işçi değil) sayısı. */
export function queuedSoldiers(world, faction) {
  let n = 0;
  for (const s of world.structures) if (s.alive && s.faction === faction) for (const k of s.queue) if (!typeOf(k).worker) n++;
  return n;
}
/** O tarafın **sahadaki** asker sayısı (kahraman ve işçi hariç, sıra sayılmaz). */
export function fieldArmy(world, faction) {
  let n = 0;
  for (const e of world.entities) if (e.alive && e.faction === faction && !e.isWorker && !e.isHero && !e.isPlayer) n++;
  return n;
}
/** O tarafın asker nüfusu: sahadaki askerler (kahraman ve işçi hariç) + sırada bekleyenler. */
export function armyCount(world, faction) {
  return queuedSoldiers(world, faction) + fieldArmy(world, faction);
}
/** O tarafın **toplam** işçi nüfusu: bütün türlerin kademe toplamı + sırada bekleyen işçiler (sınır bunun üstünden işler). */
export function workerTotal(world, faction) {
  let n = 0;
  for (const e of world.entities) if (e.alive && !e.merged && e.faction === faction && e.isWorker) n += e.tier || 1;
  for (const s of world.structures) if (s.alive && s.faction === faction) for (const k of s.queue) if (typeOf(k).worker) n++;
  return n;
}
export function queuedOf(world, faction, key) {
  let n = 0;
  for (const s of world.structures) if (s.alive && s.faction === faction) for (const k of s.queue) if (k === key) n++;
  return n;
}

/** Sıraya alır; olmazsa sebep döner. */
export function enqueue(world, building, typeKey, faction = 'blue') {
  const type = typeOf(typeKey);
  if (!type) return 'Bilinmeyen birim';
  if (!building || !building.alive) return `${type.label} için önce ${BUILDINGS[type.building].label.toLowerCase()} kur`;
  if (!building.ready) return `${BUILDINGS[building.kind].label} henüz inşa ediliyor`;
  if (building.kind !== type.building) return `${type.label} ${BUILDINGS[type.building].from} basılır`;
  if (building.queue.length >= QUEUE.max) return `Sıra dolu (en fazla ${QUEUE.max} emir)`;
  // Nüfus sınırı: asker türlerinin toplamı LIMITS.army. İşçide sınır **toplamdır** ve emri geri çevirmez: sınır
  // doluyken çıkan işçi en kalabalık türden bir kademe eksiltip onun yerine geçer (bkz. economy.js trimWorkers).
  if (!type.worker && armyCount(world, faction) >= LIMITS.army) return `Asker sınırı dolu (en fazla ${LIMITS.army} asker)`;
  const bag = bagOf(world, faction), wood = type.wood || 0;
  if (bag.gold < type.cost || bag.food < type.food || bag.wood < wood) {
    if (wood) return `Yetersiz kaynak: ${type.label} ${type.cost} altın + ${wood} odun`;
    return type.food ? `Yetersiz kaynak: ${type.label} ${type.cost} altın + ${type.food} yiyecek` : `Yetersiz altın: ${type.label} ${type.cost} altın`;
  }
  bag.gold -= type.cost; bag.food -= type.food; bag.wood -= wood;
  building.queue.push(type.key);
  if (faction === 'blue') { world.ui.flash('gold'); world.ui.ping('worker'); }
  return null;
}

/** Sıradaki bir emri iptal eder, altını geri verir. */
export function cancelQueued(world, building, index, faction = 'blue') {
  if (!building || index < 0 || index >= building.queue.length) return;
  const type = typeOf(building.queue[index]);
  building.queue.splice(index, 1);
  if (index === 0) building.progress = 0;
  const bag = bagOf(world, faction); bag.gold += type.cost; bag.food += type.food; bag.wood += type.wood || 0;
  if (faction === 'blue') world.ui.flash('gold');
}

/** Sıraların ilerlemesi; süre dolunca birim çıkar. */
export function updateProduction(world, dt) {
  for (const s of world.structures) {
    if (!s.alive || !s.ready || !s.queue.length) { s.progress = 0; continue; }
    const type = typeOf(s.queue[0]);
    // Asker sınırı dolduysa üretim durur: emir sırada bekler, asker ölüp yer açılınca hemen çıkar.
    if (!type.worker && fieldArmy(world, s.faction) >= LIMITS.army) {
      s.progress = Math.min(s.progress + dt, type.train);
      s.holdMsg = (s.holdMsg || 0) - dt;
      if (s.faction === 'blue' && s.holdMsg <= 0) { s.holdMsg = 6; world.ui.say(`Asker sınırı dolu (${LIMITS.army}): üretim bekliyor`, 1800); }
      continue;
    }
    s.progress += dt;
    if (s.progress < type.train) continue;
    s.progress = 0; s.queue.shift();
    const e = spawnUnit(world, type.key, s.faction, s);
    if (!e) continue;
    // Çıkan asker sınıfının toplanma yerine (mavi), rakipte ordu toplanma noktasına yürür.
    if (!e.isWorker) { const r = s.faction === 'blue' ? world.rally[classOf(type)] : enemyRally(world); if (r) giveOrder(world, [e], { kind: 'move', x: r.x, z: r.z }); }
    // İşçi sınırı doluysa yerine geçtiği türü de söyle.
    const swap = e.replacedLabel ? ` · işçi sınırı dolu (${LIMITS.workers}), 1 ${e.replacedLabel} azaldı` : '';
    if (s.faction === 'blue') { world.ui.say(`${type.label} hazır${swap}${s.queue.length ? ` · sırada ${s.queue.length}` : ''}`, swap ? 2200 : 1400); world.ui.ping(type.worker ? 'worker' : 'soldier'); }
  }
}
