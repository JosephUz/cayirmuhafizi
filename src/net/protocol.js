/**
 * Ağ sözlüğü: istemci ile sunucunun ortak mesaj adları. Metin çerçeveler JSON ({ t: <ad>, ... }), durum paketi ikili
 * (bkz. snapshot.js). Sunucu otoriterdir: istemci yalnızca girdi ve komut yollar, durum ve olay alır.
 */
export const C2S = {
  HELLO: 'hello',      // { nick, token } — bağlantı kimliği; token varsa eski koltuğa geri bağlanır
  CREATE: 'create',    // { teamSize, difficulty } — oda kur (kuran lobinin sahibidir)
  JOIN: 'join',        // { code }
  SETTINGS: 'settings',// { teamSize, difficulty } — yalnızca kuran
  TEAM: 'team',        // { team: 'blue'|'red' } — lobide takım değiştir (iki takımda insan varsa PvP)
  MOVE: 'move',        // { id, team } ya da { id, with } — yalnızca kuran: oyuncuyu boş koltuğa taşı ya da iki oyuncuyu değiştir
  START: 'start',      // yalnızca kuran
  LEAVE: 'leave',
  INPUT: 'in',         // çözülmüş kahraman girdisi (bkz. input.js resolveHeroInput)
  CMD: 'cmd',          // { k: 'enqueue'|'cancel'|'build'|'demolish'|'rally'|'convert', ... }
  PING: 'ping',
};
export const S2C = {
  WELCOME: 'welcome',  // { id, token, nick }
  LOBBY: 'lobby',      // { code, hostId, settings, seats: [{ slot, id, nick, online, team }], state }
  ERROR: 'error',      // { msg }
  START: 'start',      // { seed, teamSize, difficulty, players: [{ id, name, color, faction, slot, human }], you }
  EVENTS: 'ev',        // { list: [...] } — o tik biriken olaylar (durum paketinden önce uygulanır)
  PLAYERS: 'pl',       // { time, list: [{ g, w, f, sp, att, ban, rally, elim }] } — oyuncu başı hafif durum
  END: 'end',          // karne (bkz. stats.js buildReport)
  PONG: 'pong',
  ONLINE: 'on',        // { n } — sitede açık sekme sayısı (giriş ekranında "çevrim içi"), değişince en çok 2 sn'de bir
};
/** Olay türleri (EVENTS listesindeki her öğe [tür, ...alanlar] dizisidir; kısa adlar bant genişliği için). */
export const EV = {
  ENTITY_ADD: 'e+', ENTITY_DEL: 'e-', ENTITY_REFRESH: 'e~',
  STRUCT_ADD: 's+', STRUCT_DEL: 's-',
  ITEM_ADD: 'i+', ITEM_DEL: 'i-',
  ARROW_ADD: 'a+', ARROW_DEL: 'a-',
  ZONE_ADD: 'z+', ZONE_DEL: 'z-',
  BURST: 'fb', RING: 'fr', HEAL: 'fh', STRIP: 'fs',
  PING: 'pp', FLASH: 'pf', FLOAT: 'pt', ALERT: 'pa', RALLY: 'pr', KILLER: 'pk',
};
export const NET = {
  /** Simülasyon adımı ve durum paketi sıklığı (sn). */
  tick: 0.05, snapshotEvery: 2,
  /** İstemci girdi gönderim aralığı (sn) ve görüntüde geriden izleme (ara değer) süresi (sn). */
  inputEvery: 0.05, interpDelay: 0.1,
  /**
   * Kopan oyuncunun koltuğu **süresiz** tutulur: bot devralmaz, ülkesi sahada kalır (savaşır, yıkılır) ama emir
   * almaz; dönünce kaldığı yerden devam eder. Oda ancak bağlı kimse kalmayınca kapanır.
   */
  seatHold: Infinity,
  /** Cloudflare / vekil boşta bağlantıyı kapatmasın: bu aralıkta ping. */
  keepAlive: 20,
  /**
   * Sunucu saatinin yumuşatması. Paket varış anı ağ titremesiyle oynar; çizim saati her pakette sıfırlanırsa
   * her pakette bir sıçrama görünür. Ölçüm bu oranda harmanlanır (0.12 = yumuşak), fark clockJump'ı aşarsa
   * (sekme arka plandaydı, bağlantı koptu) saat doğrudan kurulur.
   */
  clockSmooth: 0.12, clockJump: 0.5,
  /**
   * **Kendi kahramanın beklemez**: başkaları interpDelay kadar geriden ara değerle çizilir, senin kahramanın
   * **yerelde tahmin edilir** (girdin anında uygulanır, bkz. client.js predictSelf) ve sunucudan gelen gerçek konuma
   * yumuşakça çekilir. Ara değeri ileri sürmek titreme yapıyordu; tahmin hem anında hem pürüzsüzdür.
   * - predict: tahmin açık mı (kapatılırsa herkes gibi interpDelay kadar geriden çizilir).
   * - predictCorrect: saniyede kaç kat hata kapatılır (12 = ~80 ms'de düzelir). Duvara yürürken denge sapması
   *   yaklaşık hız / bu sayı kadardır (3.8 / 12 = 0.3 birim), yani lastik etkisi yoktur.
   * - predictSnap: bu kadar birimlik fark (atılma, savrulma, ışınlanma) yumuşatılmaz, doğrudan atlanır.
   */
  predict: true,
  /**
   * İleri kaymanın yumuşatma süresi (sn) ve en çok kaç birim öne alınabileceği. Kayma **yalnızca yerel girdiden**
   * üretilir ve paketle hiç konuşmaz; bu yüzden pakete bağlı zonklama olmaz. Duvara dayanınca kahraman en çok
   * leadMax kadar içeri taşmış görünür, tuşu bırakınca kayma sıfıra iner.
   */
  leadSmooth: 0.09, leadMax: 0.55,
};
export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const roomCode = () => {
  const A = 'ABCDEFGHJKLMNPRSTUVYZ', D = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `${s}-${D[Math.floor(Math.random() * D.length)]}`;
};
