/**
 * Ağ sözlüğü: istemci ile sunucunun ortak mesaj adları. Metin çerçeveler JSON ({ t: <ad>, ... }), durum paketi ikili
 * (bkz. snapshot.js). Sunucu otoriterdir: istemci yalnızca girdi ve komut yollar, durum ve olay alır.
 */
export const C2S = {
  HELLO: 'hello',      // { nick, token } — bağlantı kimliği; token varsa eski koltuğa geri bağlanır
  CREATE: 'create',    // { teamSize, difficulty } — oda kur (kuran lobinin sahibidir)
  JOIN: 'join',        // { code }
  SETTINGS: 'settings',// { teamSize, difficulty } — yalnızca kuran
  START: 'start',      // yalnızca kuran
  LEAVE: 'leave',
  INPUT: 'in',         // çözülmüş kahraman girdisi (bkz. input.js resolveHeroInput)
  CMD: 'cmd',          // { k: 'enqueue'|'cancel'|'build'|'demolish'|'rally'|'convert', ... }
  PING: 'ping',
};
export const S2C = {
  WELCOME: 'welcome',  // { id, token, nick }
  LOBBY: 'lobby',      // { code, hostId, settings, seats: [{ slot, id, nick, bot }], state }
  ERROR: 'error',      // { msg }
  START: 'start',      // { seed, teamSize, difficulty, players: [{ id, name, color, faction, slot, human }], you }
  EVENTS: 'ev',        // { list: [...] } — o tik biriken olaylar (durum paketinden önce uygulanır)
  PLAYERS: 'pl',       // { time, list: [{ g, w, f, sp, att, ban, rally, elim }] } — oyuncu başı hafif durum
  END: 'end',          // karne (bkz. stats.js buildReport)
  PONG: 'pong',
};
/** Olay türleri (EVENTS listesindeki her öğe [tür, ...alanlar] dizisidir; kısa adlar bant genişliği için). */
export const EV = {
  ENTITY_ADD: 'e+', ENTITY_DEL: 'e-', ENTITY_REFRESH: 'e~',
  STRUCT_ADD: 's+', STRUCT_DEL: 's-',
  ITEM_ADD: 'i+', ITEM_DEL: 'i-',
  ARROW_ADD: 'a+', ARROW_DEL: 'a-',
  ZONE_ADD: 'z+', ZONE_DEL: 'z-',
  BURST: 'fb', RING: 'fr', HEAL: 'fh', STRIP: 'fs',
  PING: 'pp', FLASH: 'pf', FLOAT: 'pt', ALERT: 'pa', RALLY: 'pr',
};
export const NET = {
  /** Simülasyon adımı ve durum paketi sıklığı (sn). */
  tick: 0.05, snapshotEvery: 2,
  /** İstemci girdi gönderim aralığı (sn) ve görüntüde geriden izleme (ara değer) süresi (sn). */
  inputEvery: 0.05, interpDelay: 0.1,
  /** Kopan oyuncunun koltuğu bu kadar tutulur (sn); sonra kahramanını bot devralır. */
  reconnectHold: 120,
  /** Cloudflare / vekil boşta bağlantıyı kapatmasın: bu aralıkta ping. */
  keepAlive: 20,
};
export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const roomCode = () => {
  const A = 'ABCDEFGHJKLMNPRSTUVYZ', D = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `${s}-${D[Math.floor(Math.random() * D.length)]}`;
};
