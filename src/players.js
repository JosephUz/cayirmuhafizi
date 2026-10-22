import { t } from './dil.js';
import { DIFFICULTY, ECONOMY, LIMITS, LIMITS_LIGHT, TEAMS } from './config.js';

/**
 * Oyuncular. Bir oyunda 2 x takım büyüklüğü oyuncu vardır: insanlar (seçtikleri takımın ilk yuvaları) ve botlar. Her oyuncunun
 * kendi kasası (eco), sancağı, üssü, kule yerleri, kahramanı ve karnesi (st) vardır; botlarda ayrıca karar durumu (ai),
 * insanlarda girdi (input) ve toplanma bayrağı (rally) tutulur.
 * Birimler ve yapılar sahibini `owner` ile, takımını `faction` ile bilir: **düşmanlık takıma, komuta ve kasa sahibe** bağlıdır.
 * Her insan yalnızca kendi askerini yönetir; takım arkadaşı (insan ya da bot) kendi askerine kendi emrini verir.
 * humans: [{ name, color?, faction? }] — kendi takımının (varsayılan mavi) 0..n-1 yuvalarına oturur; takım başı en çok
 * teamSize. İki takımda da insan varsa oyun **PvP**'dir; insansız takımın botları zorluk çarpanını alır (bkz. resourceMult).
 */
export function createPlayers(teamSize, humans = [{ name: t('oyuncu.sen') }]) {
  const players = [];
  const sideOf = h => (h.faction === 'red' ? 'red' : 'blue');
  // İnsan renkleri önce dağıtılır: bot renkleri bunlarla çakışmasın.
  const humanColor = new Map(humans.map((h, i) => [h, h.color || TEAMS.humanColors[i % TEAMS.humanColors.length]]));
  const usedColors = new Set(humanColor.values());
  let color = 0, bots = 0;
  for (const faction of ['blue', 'red']) {
    const mine = humans.filter(h => sideOf(h) === faction);
    for (let slot = 0; slot < teamSize; slot++) {
      const h = slot < mine.length ? mine[slot] : null;
      const human = Boolean(h);
      let c;
      if (human) c = humanColor.get(h);
      else { do { c = TEAMS.colors[color++ % TEAMS.colors.length]; } while (usedColors.has(c) && color < TEAMS.colors.length * 2); }
      const name = human ? (h.name || 'Sen') : TEAMS.names[(bots++ + 10) % TEAMS.names.length];
      players.push({
        id: players.length, faction, slot, human, name,
        color: c, netId: human ? h.netId ?? null : null,
        eco: createEconomy(human), ai: human ? null : createBotAi(players.length),
        // Takımında hiç insan yok: zorluk bu botlara işler.
        botTeam: mine.length === 0,
        hero: null, banner: null, base: null, towerSpots: [], input: null, rally: null, st: null, eliminated: false,
      });
    }
  }
  return players;
}

/** Kasa: altın + odun + yiyecek; basılan birim sayısı; kahraman çalışması (insan için). */
export function createEconomy(human) {
  const eco = { ...ECONOMY.start, soldiersSpawned: 0, work: { spot: null, timer: 0 } };
  // Deneme ayarı (bkz. ECONOMY.playerTestGold): yalnızca insan oyuncular bol altınla başlar, botlar normal başlar.
  if (human && ECONOMY.playerTestGold != null) eco.gold = ECONOMY.playerTestGold;
  return eco;
}

/** Bot karar durumu: harcama sayacı (botlar aynı karede karar vermesin diye kaydırılır), saldırı / savunma durumu. */
export function createBotAi(index) {
  return { spawnTimer: 2 + index * 0.7, typeIndex: 0, attacking: false, launchSize: 0, defend: null, defendTimer: 0, needSiege: false };
}

export const teamOf = (world, faction) => world.players.filter(p => p.faction === faction);
export const enemyOf = faction => (faction === 'blue' ? 'red' : 'blue');
/** Bot sahipli asker (kahraman ve işçi değil): kule menzilinden kaçınan, toplanma noktasında biriken birim. */
export const botSoldier = e => Boolean(e.owner && !e.owner.human && !e.isHero && !e.isPlayer);

/** Rakip takımın ayakta sancakları. */
export function enemyBanners(world, faction) {
  return world.players.filter(p => p.faction !== faction && p.banner && p.banner.alive).map(p => p.banner);
}
/** Bu noktaya en yakın ayakta rakip sancak (yoksa null). */
export function nearestEnemyBanner(world, faction, pos) {
  let best = null, bd = Infinity;
  for (const b of enemyBanners(world, faction)) { const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z); if (d < bd) { bd = d; best = b; } }
  return best;
}
/** Sancağı bu noktaya en yakın rakip oyuncu (ayakta sancak yeğlenir; hepsi yıkıksa en yakın yıkık). */
export function nearestEnemyPlayer(world, faction, pos) {
  let best = null, bd = Infinity;
  for (const p of world.players) {
    if (p.faction === faction || !p.banner) continue;
    const d = Math.hypot(p.banner.pos.x - pos.x, p.banner.pos.z - pos.z) + (p.banner.alive ? 0 : 1e6);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/**
 * Kaynak çarpanı: zorluk yalnızca **insansız takımın** botlarına işler (co-op'ta rakip takım). İnsanlar ve insanlı
 * takımdaki botlar 1x toplar; iki takımda da insan varsa (PvP) herkes eşittir.
 */
export function resourceMult(world, p) { return p.botTeam ? DIFFICULTY[world.difficulty].resourceMult : 1; }
/** Takım yenildi mi: insanlı takım insanlarının sancakları, insansız takım bütün sancakları yıkılınca yenilir. */
export function teamDefeated(world, faction) {
  const team = world.players.filter(p => p.faction === faction);
  const humans = team.filter(p => p.human);
  return !(humans.length ? humans : team).some(p => p.banner && p.banner.alive);
}

/**
 * Oyuncu başı nüfus sınırları: asker sınırı oyuncu sayısıyla bölünür ki haritadaki toplam armyTotal'ı aşmasın.
 * light: telefon (LIMITS_LIGHT, yarı nüfus).
 */
export function limitsFor(playerCount, light = false) {
  const L = light ? { ...LIMITS, ...LIMITS_LIGHT } : LIMITS;
  return { army: Math.min(L.army, Math.round(L.armyTotal / playerCount)), workers: Math.min(L.workers, Math.round(L.workersTotal / playerCount)), towers: L.towers, buildings: L.buildings };
}
