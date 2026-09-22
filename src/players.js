import { DIFFICULTY, ECONOMY, LIMITS, TEAMS } from './config.js';

/**
 * Oyuncular. Bir oyunda 2 x takım büyüklüğü oyuncu vardır: insan (mavi takım, 0. yuva) ve botlar. Her oyuncunun
 * kendi kasası (eco), sancağı, üssü, kule yerleri ve kahramanı vardır; botlarda ayrıca karar durumu (ai) tutulur.
 * Birimler ve yapılar sahibini `owner` ile, takımını `faction` ile bilir: **düşmanlık takıma, komuta ve kasa sahibe** bağlıdır.
 * Senin askerlerini yalnızca sen yönetirsin; takım arkadaşı bot kendi askerine kendi emrini verir.
 */
export function createPlayers(teamSize) {
  const players = [];
  let color = 0;
  for (const faction of ['blue', 'red']) {
    for (let slot = 0; slot < teamSize; slot++) {
      const human = faction === 'blue' && slot === 0;
      const name = human ? 'Sen' : TEAMS.names[(players.length - 1) % TEAMS.names.length];
      // Mesaj başlığı: 1v1'de eskisi gibi "Rakip", takım oyununda "Rakip Aslan" / "Müttefik Kurt".
      const title = human ? 'Sen' : teamSize === 1 ? 'Rakip' : `${faction === 'blue' ? 'Müttefik' : 'Rakip'} ${name}`;
      players.push({
        id: players.length, faction, slot, human, name, title,
        color: human ? TEAMS.humanColor : TEAMS.colors[color++ % TEAMS.colors.length],
        eco: createEconomy(human), ai: human ? null : createBotAi(players.length),
        hero: null, banner: null, base: null, towerSpots: [],
      });
    }
  }
  return players;
}

/** Kasa: altın + odun + yiyecek; basılan birim sayısı; kahraman çalışması (insan için). */
export function createEconomy(human) {
  const eco = { ...ECONOMY.start, hintTimer: 0, soldiersSpawned: 0, work: { spot: null, timer: 0 } };
  // Deneme ayarı (bkz. ECONOMY.playerTestGold): yalnızca insan oyuncu bol altınla başlar, botlar normal başlar.
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

/** Kaynak çarpanı: zorluk yalnızca **rakip takımın** botlarına işler; müttefik botlar ve sen 1x toplarsınız. */
export function resourceMult(world, p) { return p.faction === 'red' ? DIFFICULTY[world.difficulty].resourceMult : 1; }

/** Oyuncu başı nüfus sınırları: asker sınırı oyuncu sayısıyla bölünür ki haritadaki toplam armyTotal'ı aşmasın. */
export function limitsFor(playerCount) {
  return { army: Math.min(LIMITS.army, Math.round(LIMITS.armyTotal / playerCount)), workers: LIMITS.workers, towers: LIMITS.towers, buildings: LIMITS.buildings };
}

/**
 * Bot mesajı: başlığıyla ("Rakip", "Rakip Aslan", "Müttefik Kurt") ekrana yazılır. `routine` (asker basıyor gibi
 * sık mesajlar) yalnızca 1v1'de gösterilir; kalabalık oyunda ekranı doldurmasın.
 */
export function botSay(world, p, text, ms = 2000, routine = false) {
  if (routine && world.players.length > 2) return;
  world.ui.say(`${p.title} ${text}`, ms);
}
