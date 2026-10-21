// Oda akışı (server/rooms.mjs, bkz. josephuz docs/oda-standardi.md): sunucu açılmadan, sahte WebSocket bağlantılarıyla
// denenir. Her bağlantı gelen JSON mesajlarını biriktirir; testler LOBBY / ROOMS / ERROR mesajlarına bakar.
// Açık oda listesi **itilir** (istemci yoklamaz): değişiklikler `roomsDelay` ms toplanıp odada olmayanlara gider.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRooms } from '../server/rooms.mjs';
import { C2S, S2C, normalCode } from '../src/net/protocol.js';

const GECIKME = 15;
const bekle = (ms = GECIKME * 3) => new Promise(r => setTimeout(r, ms));

function sahteBag(rooms, nick) {
  const on = {}, gelen = [];
  const ws = { readyState: 1, send(veri, opt) { if (!opt?.binary) gelen.push(JSON.parse(veri)); }, on(ad, fn) { on[ad] = fn; } };
  rooms.attach(ws);
  const yolla = m => on.message(Buffer.from(JSON.stringify(m)), false);
  yolla({ t: C2S.HELLO, nick });
  return {
    yolla, gelen,
    son: t => gelen.filter(m => m.t === t).at(-1),
    sayi: t => gelen.filter(m => m.t === t).length,
    kapat() { ws.readyState = 3; on.close(); },
    /** Sunucunun en son **ittiği** açık oda listesi (istek yollanmaz). */
    liste() { const m = gelen.filter(x => x.t === S2C.ROOMS).at(-1); return m ? m.list : null; },
  };
}
const yeniSunucu = () => createRooms({ log: () => {}, roomsDelay: GECIKME });
const durdur = rooms => { for (const r of rooms.rooms.values()) if (r.timer) clearInterval(r.timer); };

test('kod biçimi: büyük harf, tiresiz yazılırsa tire eklenir', () => {
  assert.equal(normalCode('kprt4'), 'KPRT-4');
  assert.equal(normalCode('KPRT-4'), 'KPRT-4');
  assert.equal(normalCode(' kp rt-4 '), 'KPRT-4');
  assert.equal(normalCode('kpr'), 'KPR');
});

test('oda kur: oda hemen, verilen ayarlarla ve herkese açık kurulur', () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe');
  a.yolla({ t: C2S.CREATE, teamSize: 3, difficulty: 'hard' });
  const lobi = a.son(S2C.LOBBY);
  assert.ok(lobi, 'bekleme odası hemen gelir');
  assert.match(lobi.code, /^[ABCDEFGHJKLMNPRSTUVYZ]{4}-[2-9]$/);
  assert.deepEqual(lobi.settings, { teamSize: 3, difficulty: 'hard' });
  assert.equal(lobi.priv, false);
  assert.equal(lobi.state, 'lobby');
  assert.equal(lobi.hostId, a.son(S2C.WELCOME).id, 'kuran');
});

test('koda tiresiz ve küçük harfle katılınır; yanlış kod ve başlamış maç hata verir', () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe'), b = sahteBag(rooms, 'Bora'), c = sahteBag(rooms, 'Cem');
  a.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  const kod = a.son(S2C.LOBBY).code;
  b.yolla({ t: C2S.JOIN, code: kod.replace('-', '').toLowerCase() });
  assert.equal(b.son(S2C.LOBBY).code, kod);
  c.yolla({ t: C2S.JOIN, code: 'ZZZZ9' });
  assert.equal(c.son(S2C.ERROR).msg, 'Böyle bir oda yok');
  a.yolla({ t: C2S.START });
  c.yolla({ t: C2S.JOIN, code: kod });
  assert.equal(c.son(S2C.ERROR).msg, 'Maç başlamış');
  durdur(rooms);
});

test('özel/açık kuranın ayar mesajıyla değişir; özel oda listeden düşer', async () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe'), b = sahteBag(rooms, 'Bora'), izleyen = sahteBag(rooms, 'İzleyen');
  a.yolla({ t: C2S.CREATE, teamSize: 2, difficulty: 'normal' });
  const kod = a.son(S2C.LOBBY).code;
  b.yolla({ t: C2S.JOIN, code: kod });
  await bekle();
  assert.equal(izleyen.liste().length, 1);
  // Kuran olmayan değiştiremez.
  b.yolla({ t: C2S.SETTINGS, teamSize: 2, difficulty: 'normal', priv: true });
  assert.equal(b.son(S2C.LOBBY).priv, false);
  a.yolla({ t: C2S.SETTINGS, teamSize: 2, difficulty: 'easy', priv: true });
  assert.equal(b.son(S2C.LOBBY).priv, true, 'herkes özel olduğunu görür');
  assert.equal(b.son(S2C.LOBBY).settings.difficulty, 'easy');
  await bekle();
  assert.deepEqual(izleyen.liste(), [], 'özel oda listede yok');
  izleyen.yolla({ t: C2S.QUICK, teamSize: 1, difficulty: 'normal' });
  assert.notEqual(izleyen.son(S2C.LOBBY).code, kod, 'hızlı katıl özel odaya oturtmaz');
  // Özel odaya kodla katılınır.
  const d = sahteBag(rooms, 'Deniz');
  d.yolla({ t: C2S.JOIN, code: kod });
  assert.equal(d.son(S2C.LOBBY).seats.length, 3);
  a.yolla({ t: C2S.SETTINGS, teamSize: 2, difficulty: 'easy', priv: false });
  assert.equal(a.son(S2C.LOBBY).priv, false);
});

test('liste itilir: karşılamada gelir, değişince odada olmayanlara kendiliğinden gider', async () => {
  const rooms = yeniSunucu();
  const izleyen = sahteBag(rooms, 'İzleyen');
  assert.deepEqual(izleyen.liste(), [], 'karşılamada boş liste');
  const a = sahteBag(rooms, 'Ayşe');
  a.yolla({ t: C2S.CREATE, teamSize: 2, difficulty: 'hard' });
  assert.deepEqual(izleyen.liste(), [], 'hemen değil, toplanarak');
  await bekle();
  assert.deepEqual(izleyen.liste(), [{ code: a.son(S2C.LOBBY).code, host: 'Ayşe', teamSize: 2, difficulty: 'hard', n: 1, max: 10, state: 'lobby', full: false }]);
  assert.equal(a.sayi(S2C.ROOMS), 1, 'odadaki bağlantıya yalnız karşılamadaki liste gitti');
  // Aynı anda gelen değişiklikler tek mesaj olur.
  const once = izleyen.sayi(S2C.ROOMS);
  const b = sahteBag(rooms, 'Bora'), c = sahteBag(rooms, 'Cem');
  b.yolla({ t: C2S.JOIN, code: a.son(S2C.LOBBY).code });
  c.yolla({ t: C2S.JOIN, code: a.son(S2C.LOBBY).code });
  await bekle();
  assert.equal(izleyen.sayi(S2C.ROOMS), once + 1);
  assert.equal(izleyen.liste()[0].n, 3);
  // Odadan çıkan listeyi hemen alır; boşalan oda listeden düşer.
  a.yolla({ t: C2S.LEAVE }); b.yolla({ t: C2S.LEAVE }); c.kapat();
  assert.ok(Array.isArray(a.liste()));
  await bekle();
  assert.deepEqual(izleyen.liste(), []);
});

test('hızlı katıl en kalabalık açık lobiye oturtur', () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'A'), b = sahteBag(rooms, 'B'), c = sahteBag(rooms, 'C'), d = sahteBag(rooms, 'D');
  a.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  b.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  c.yolla({ t: C2S.JOIN, code: b.son(S2C.LOBBY).code });
  d.yolla({ t: C2S.QUICK, teamSize: 4, difficulty: 'hard' });
  const lobi = d.son(S2C.LOBBY);
  assert.equal(lobi.code, b.son(S2C.LOBBY).code);
  assert.equal(lobi.hostId, b.son(S2C.WELCOME).id, 'kuran değişmez');
  assert.equal(rooms.rooms.size, 2);
});

test('uygun oda yoksa hızlı katıl verilen ayarlarla yeni açık oda kurar', async () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe'), b = sahteBag(rooms, 'Bora'), izleyen = sahteBag(rooms, 'Cem');
  a.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  a.yolla({ t: C2S.SETTINGS, teamSize: 1, difficulty: 'normal', priv: true }); // özel oda hızlı katılda sayılmaz
  b.yolla({ t: C2S.QUICK, teamSize: 3, difficulty: 'easy' });
  const lobi = b.son(S2C.LOBBY);
  assert.notEqual(lobi.code, a.son(S2C.LOBBY).code);
  assert.equal(lobi.hostId, b.son(S2C.WELCOME).id, 'hızlı katılan yeni odanın kuranıdır');
  assert.deepEqual(lobi.settings, { teamSize: 3, difficulty: 'easy' }, 'son seçilen ayarlar');
  assert.equal(lobi.priv, false);
  await bekle();
  assert.equal(izleyen.liste()[0].code, lobi.code, 'yeni oda listede');
});

test('dolu oda listede DOLU, hızlı katılda yok; başlamış maç listede yok', async () => {
  const rooms = yeniSunucu();
  const kuran = sahteBag(rooms, 'K0');
  kuran.yolla({ t: C2S.CREATE, teamSize: 5, difficulty: 'normal' });
  const dolu = kuran.son(S2C.LOBBY).code;
  for (let i = 1; i < 10; i++) sahteBag(rooms, 'K' + i).yolla({ t: C2S.JOIN, code: dolu });
  assert.equal(kuran.son(S2C.LOBBY).seats.length, 10);
  const fazla = sahteBag(rooms, 'Fazla');
  fazla.yolla({ t: C2S.JOIN, code: dolu });
  assert.equal(fazla.son(S2C.ERROR).msg, 'Oda dolu');
  const s = sahteBag(rooms, 'S');
  s.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'easy' });
  const baslayan = s.son(S2C.LOBBY).code;
  s.yolla({ t: C2S.START });
  assert.equal(rooms.rooms.get(baslayan).state, 'playing');
  await bekle();
  const z = sahteBag(rooms, 'Z');
  assert.deepEqual(z.liste().map(o => [o.code, o.full]), [[dolu, true]]);
  z.yolla({ t: C2S.QUICK, teamSize: 1, difficulty: 'normal' });
  const yeni = z.son(S2C.LOBBY).code;
  assert.ok(yeni !== dolu && yeni !== baslayan, 'dolu ya da başlamış odaya oturtmaz, yeni oda kurar');
  s.kapat(); // başlamış odanın tek bağlısı gitti: dünya durur, oda kapanır
  durdur(rooms);
});

test('maç bitince herkes bekleme odasına döner, kuran yeniden başlatabilir', async () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe'), b = sahteBag(rooms, 'Bora'), c = sahteBag(rooms, 'Cem'), izleyen = sahteBag(rooms, 'İzleyen');
  a.yolla({ t: C2S.CREATE, teamSize: 2, difficulty: 'normal' });
  const kod = a.son(S2C.LOBBY).code;
  b.yolla({ t: C2S.JOIN, code: kod }); c.yolla({ t: C2S.JOIN, code: kod });
  a.yolla({ t: C2S.START });
  c.yolla({ t: C2S.LEAVE }); // maçtan çıktı: ana ekranda
  a.yolla({ t: C2S.LEAVE }); // kuran da çıktı: kuranlık sıradakine geçer
  const oda = rooms.rooms.get(kod);
  clearInterval(oda.timer); oda.timer = null;
  oda.world.onEnd({ outcome: { winner: 'blue' }, time: 1 });
  assert.ok(b.son(S2C.END), 'maçta kalan sonuç ekranını görür');
  assert.equal(c.sayi(S2C.END), 0, 'maçtan çıkmış olana sonuç ekranı açılmaz');
  const lobi = b.son(S2C.LOBBY);
  assert.equal(lobi.state, 'lobby');
  assert.deepEqual(lobi.seats.map(s => s.nick), ['Bora']);
  assert.equal(lobi.hostId, b.son(S2C.WELCOME).id);
  await bekle();
  assert.equal(izleyen.liste()[0].code, kod, 'oda yeniden listede');
  b.yolla({ t: C2S.START });
  assert.equal(rooms.rooms.get(kod).state, 'playing');
  durdur(rooms);
});
