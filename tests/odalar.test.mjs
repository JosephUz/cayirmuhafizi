// Açık oda listesi ve hızlı katıl (server/rooms.mjs): sunucu açılmadan, sahte WebSocket bağlantılarıyla denenir.
// Her bağlantı gelen JSON mesajlarını biriktirir; testler ROOMS listesine ve LOBBY mesajlarına bakar.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRooms } from '../server/rooms.mjs';
import { C2S, S2C } from '../src/net/protocol.js';

function sahteBag(rooms, nick) {
  const on = {}, gelen = [];
  const ws = { readyState: 1, send(veri, opt) { if (!opt?.binary) gelen.push(JSON.parse(veri)); }, on(ad, fn) { on[ad] = fn; } };
  rooms.attach(ws);
  const yolla = m => on.message(Buffer.from(JSON.stringify(m)), false);
  yolla({ t: C2S.HELLO, nick });
  return {
    yolla, gelen,
    son: t => gelen.filter(m => m.t === t).at(-1),
    kapat() { ws.readyState = 3; on.close(); },
    liste() { yolla({ t: C2S.ROOMS }); return gelen.filter(m => m.t === S2C.ROOMS).at(-1).list; },
  };
}
const yeniSunucu = () => createRooms({ log: () => {} });

test('açık oda listede görünür, özel oda görünmez', () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe'), b = sahteBag(rooms, 'Bora'), c = sahteBag(rooms, 'Cem');
  a.yolla({ t: C2S.CREATE, teamSize: 2, difficulty: 'hard' });
  b.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal', priv: true });
  const liste = c.liste();
  assert.equal(liste.length, 1);
  assert.deepEqual(liste[0], { code: a.son(S2C.LOBBY).code, host: 'Ayşe', teamSize: 2, difficulty: 'hard', n: 1, max: 10 });
  assert.equal(a.son(S2C.LOBBY).priv, false);
  assert.equal(b.son(S2C.LOBBY).priv, true);
  // Özel odaya kodla katılım eskisi gibi çalışır.
  c.yolla({ t: C2S.JOIN, code: b.son(S2C.LOBBY).code });
  assert.equal(c.son(S2C.LOBBY).seats.length, 2);
});

test('hızlı katıl ikinci oyuncuyu birincinin bekleyen odasına oturtur', () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe'), b = sahteBag(rooms, 'Bora');
  a.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  b.yolla({ t: C2S.QUICK });
  const lobi = b.son(S2C.LOBBY);
  assert.equal(lobi.code, a.son(S2C.LOBBY).code);
  assert.deepEqual(lobi.seats.map(s => s.nick), ['Ayşe', 'Bora']);
  assert.equal(lobi.hostId, a.son(S2C.WELCOME).id, 'kuran değişmez');
  assert.equal(rooms.rooms.size, 1);
});

test('hızlı katıl en kalabalık açık odayı seçer', () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'A'), b = sahteBag(rooms, 'B'), c = sahteBag(rooms, 'C'), d = sahteBag(rooms, 'D');
  a.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  b.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  c.yolla({ t: C2S.JOIN, code: b.son(S2C.LOBBY).code });
  d.yolla({ t: C2S.QUICK });
  assert.equal(d.son(S2C.LOBBY).code, b.son(S2C.LOBBY).code);
});

test('uygun oda yoksa hızlı katıl yeni açık oda kurar', () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe'), b = sahteBag(rooms, 'Bora');
  a.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal', priv: true }); // özel oda hızlı katılda sayılmaz
  b.yolla({ t: C2S.QUICK });
  const lobi = b.son(S2C.LOBBY);
  assert.notEqual(lobi.code, a.son(S2C.LOBBY).code);
  assert.equal(lobi.hostId, b.son(S2C.WELCOME).id, 'hızlı katılan yeni odanın kuranıdır');
  assert.equal(lobi.priv, false);
  assert.equal(lobi.state, 'lobby');
  assert.equal(sahteBag(rooms, 'Cem').liste()[0].code, lobi.code, 'yeni oda listede');
});

test('dolu ve başlamış odalar listede ve hızlı katılda yok', () => {
  const rooms = yeniSunucu();
  const kuran = sahteBag(rooms, 'K0');
  kuran.yolla({ t: C2S.CREATE, teamSize: 5, difficulty: 'normal' });
  const dolu = kuran.son(S2C.LOBBY).code;
  for (let i = 1; i < 10; i++) sahteBag(rooms, 'K' + i).yolla({ t: C2S.JOIN, code: dolu });
  assert.equal(kuran.son(S2C.LOBBY).seats.length, 10);
  const s = sahteBag(rooms, 'S');
  s.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'easy' });
  const baslayan = s.son(S2C.LOBBY).code;
  s.yolla({ t: C2S.START });
  assert.equal(rooms.rooms.get(baslayan).state, 'playing');
  const z = sahteBag(rooms, 'Z');
  assert.deepEqual(z.liste(), []);
  z.yolla({ t: C2S.QUICK });
  const yeni = z.son(S2C.LOBBY).code;
  assert.ok(yeni !== dolu && yeni !== baslayan, 'dolu ya da başlamış odaya oturtmaz, yeni oda kurar');
  s.kapat(); // başlamış odanın tek bağlısı gitti: dünya durur, oda kapanır
  for (const r of rooms.rooms.values()) if (r.timer) clearInterval(r.timer);
});

test('boşalan oda listeden düşer', () => {
  const rooms = yeniSunucu();
  const a = sahteBag(rooms, 'Ayşe'), b = sahteBag(rooms, 'Bora');
  a.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  assert.equal(b.liste().length, 1);
  a.kapat();
  assert.deepEqual(b.liste(), []);
  b.yolla({ t: C2S.CREATE, teamSize: 1, difficulty: 'normal' });
  b.yolla({ t: C2S.LEAVE });
  assert.deepEqual(sahteBag(rooms, 'Cem').liste(), []);
});
