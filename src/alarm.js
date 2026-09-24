import { ARMY, TOWER } from './config.js';

/**
 * **Alarm**: bir asker ya da kule saldırı alınca çevredeki aynı takımdan askerler saldırana döner. Kural senin
 * ordunda da botların ordusunda da aynıdır (takım = faction; müttefik askerleri de yardıma koşar).
 * - Asker vurulursa: kurbanın ARMY.alarm.radius yarıçapındaki askerler.
 * - Kule vurulursa: kulenin **menzilinde duran** bütün askerler (kule sınırında boş beklemek yok).
 * Alarm askerin kendi vurulma hatırasıyla aynı yolu izler (bkz. ai.js retaliator): ARMY.retaliate saniye hatırlanır,
 * saldıran ARMY.retaliateRange içindeyse kovalanır. Mancınık (menzil 36) kule menzili dışından vursa bile yetişilir.
 * Bir kurban / kule en çok ARMY.alarm.every saniyede bir alarm yayar (kalabalık savaşta her vuruşta tarama yok).
 */
const soldier = e => e.alive && e.brain && e.owner && !e.isWorker && !e.isHero && !e.isPlayer;

export function raiseAlarm(world, faction, x, z, radius, source) {
  if (!source || !source.alive || source.faction === faction) return;
  const r2 = radius * radius, now = world.time;
  for (const e of world.entities) {
    if (e.faction !== faction || !soldier(e)) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    if (dx * dx + dz * dz > r2) continue;
    // Taze bir alarmı olan asker hedef değiştirmez (iki saldıran arasında gidip gelmesin).
    if (e.alarmBy && e.alarmBy.alive && now - (e.alarmAt || -99) < ARMY.alarm.keep) continue;
    e.alarmBy = source; e.alarmAt = now;
  }
}

/** Asker vuruldu: çevresindekileri uyar. */
export function unitAlarm(world, victim, source) {
  if (!soldier(victim) || world.time - (victim.alarmSentAt ?? -99) < ARMY.alarm.every) return;
  victim.alarmSentAt = world.time;
  raiseAlarm(world, victim.faction, victim.pos.x, victim.pos.z, ARMY.alarm.radius, source);
}

/** Kule vuruldu: menzilindeki askerleri uyar. */
export function towerAlarm(world, s, source) {
  if (s.kind !== 'tower' || world.time - (s.alarmSentAt ?? -99) < ARMY.alarm.every) return;
  s.alarmSentAt = world.time;
  raiseAlarm(world, s.faction, s.pos.x, s.pos.z, TOWER.range, source);
}
