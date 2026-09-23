import { BUILDINGS, SCORE, SOLDIER_TYPES } from './config.js';

/**
 * Karne: her oyuncunun (insan ve bot) maç boyunca sayılan istatistikleri ve bunlardan türeyen skor.
 * Sayaçlar olayın kaynağında bir artırma ile dolar (bkz. economy.js, combat.js, world.js); maliyeti yoktur.
 * Ortak birim **değer**: birimin ya da yapının altın + odun + yiyecek toplamı. Böylece bir mancınık öldürmek bir
 * kılıçlı öldürmekten çok eder ve alanlar birbiriyle kıyaslanır.
 * Zaman çizelgesi: SCORE.sampleEvery saniyede oyuncu başına bir örnek (skor, asker, işçi, kaynak, seviye, yapı).
 */
export function createStats() {
  return {
    gathered: { gold: 0, wood: 0, food: 0 }, spent: 0,
    unitsMade: {}, unitsLost: {}, kills: {}, killValue: 0, lostValue: 0,
    dmgDealt: 0, dmgTaken: 0, structDmg: 0,
    built: {}, razed: {}, lostStructs: {}, builtValue: 0, razedValue: 0, lostStructValue: 0,
    heroKills: 0, deaths: 0, xp: 0, level: 1,
    capTime: 0,
  };
}

const typeOf = key => SOLDIER_TYPES.find(t => t.key === key);
/** Birimin değeri: türünün altın + yiyecek + odun bedeli; kahraman sabit SCORE.heroValue; haydutlarda tür bedeli. */
export function unitValue(e) {
  if (e.isPlayer || e.isHero) return SCORE.heroValue;
  const t = e.typeKey ? typeOf(e.typeKey) : null;
  return t ? t.cost + (t.food || 0) + (t.wood || 0) : 10;
}
export function structureValue(s) {
  const b = BUILDINGS[s.kind];
  return b ? (b.cost || 0) + (b.wood || 0) + (s.kind === 'banner' ? SCORE.bannerValue : 0) : 0;
}
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

export function statUnitMade(p, e) { if (!p) return; bump(p.st.unitsMade, e.typeKey || 'hero'); }
export function statSpent(p, value) { if (p) p.st.spent += value; }
export function statGathered(p, kind, n) { if (p) p.st.gathered[kind] = (p.st.gathered[kind] || 0) + n; }
/** Birim öldü: sahibine kayıp, öldürene (varsa, başka takımdan) öldürme yazılır. */
export function statUnitDied(target, source) {
  const v = unitValue(target);
  const owner = target.owner;
  if (owner) { bump(owner.st.unitsLost, target.typeKey || 'hero'); owner.st.lostValue += v; if (target.isHero || target.isPlayer) owner.st.deaths++; }
  const killer = source && source.owner;
  if (killer && (!owner || killer.faction !== owner.faction)) {
    bump(killer.st.kills, target.typeKey || (target.isHero || target.isPlayer ? 'hero' : 'unit'));
    killer.st.killValue += v;
    if (target.isHero || target.isPlayer) killer.st.heroKills++;
  }
}
export function statDamage(target, source, amount) {
  if (!(amount > 0)) return;
  if (target.owner) target.owner.st.dmgTaken += amount;
  if (source && source.owner && (!target.owner || source.owner.faction !== target.owner.faction)) source.owner.st.dmgDealt += amount;
}
export function statStructDamage(s, source, amount) {
  if (!(amount > 0) || !source || !source.owner) return;
  if (!s.owner || s.owner.faction !== source.owner.faction) source.owner.st.structDmg += amount;
}
export function statBuilt(p, s) { if (!p) return; bump(p.st.built, s.kind); p.st.builtValue += structureValue(s); }
export function statStructureDestroyed(s, source) {
  const v = structureValue(s);
  if (s.owner) { bump(s.owner.st.lostStructs, s.kind); s.owner.st.lostStructValue += v; }
  const razer = source && source.owner;
  if (razer && (!s.owner || razer.faction !== s.owner.faction) && !s.demolished) { bump(razer.st.razed, s.kind); razer.st.razedValue += v; }
}

/** Dört alan ve toplam. Ağırlıklar config SCORE'da. */
export function scoreOf(p) {
  const s = p.st, W = SCORE.weights;
  const military = Math.max(0, s.killValue + s.razedValue - s.lostValue * W.lossPenalty);
  const gathered = s.gathered.gold + s.gathered.wood + s.gathered.food;
  const economy = Math.min(gathered, s.spent) + gathered * W.gatherBonus;
  const build = Math.max(0, s.builtValue - s.lostStructValue * W.lossPenalty);
  const level = p.hero ? p.hero.level : s.level;
  const hero = Math.max(0, level * W.levelPoints + s.heroKills * W.heroKillPoints - s.deaths * W.deathPenalty);
  const total = Math.round(military * W.military + economy * W.economy + build * W.build + hero);
  return { military: Math.round(military * W.military), economy: Math.round(economy * W.economy), build: Math.round(build * W.build), hero: Math.round(hero), total };
}

/** Zaman çizelgesi örneği: her oyuncu için o anki skor, sahadaki asker, işçi kademesi, toplam kaynak, seviye, ayakta yapı. */
export function sampleTimeline(world) {
  const row = { t: Math.round(world.time), p: [] };
  for (const p of world.players) {
    let army = 0, workers = 0, structs = 0;
    for (const e of world.entities) { if (!e.alive || e.owner !== p || e.isHero || e.isPlayer) continue; if (e.isWorker) workers += e.tier || 1; else army++; }
    for (const s of world.structures) if (s.alive && s.owner === p) structs++;
    const sc = scoreOf(p);
    row.p.push([sc.total, army, workers, p.eco.gold + p.eco.wood + p.eco.food, p.hero ? p.hero.level : 1, structs]);
  }
  world.timeline.push(row);
}

/** Maç sonu karnesi: taşınabilir (JSON) biçim; sunucu istemcilere bunu yollar, tek başına oyunda doğrudan çizilir. */
export function buildReport(world, outcome) {
  const players = world.players.map(p => ({
    id: p.id, name: p.name, color: p.color, faction: p.faction, human: p.human,
    level: p.hero ? p.hero.level : 1, alive: Boolean(p.banner && p.banner.alive),
    st: p.st, score: scoreOf(p),
  }));
  const fields = ['military', 'economy', 'build', 'hero'];
  const champions = {};
  for (const f of fields) champions[f] = players.reduce((a, b) => (b.score[f] > a.score[f] ? b : a), players[0]).id;
  const most = (pick) => players.reduce((a, b) => (pick(b) > pick(a) ? b : a), players[0]).id;
  champions.kills = most(p => p.st.killValue); champions.gather = most(p => p.st.gathered.gold + p.st.gathered.wood + p.st.gathered.food);
  champions.deaths = most(p => p.st.deaths);
  return { outcome, time: Math.round(world.time), difficulty: world.difficulty, teamSize: world.teamSize, players, champions, timeline: world.timeline };
}
