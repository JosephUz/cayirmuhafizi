import { randomBytes } from 'node:crypto';
import { createWorld, setupGame, step, cmdBuild, cmdCancel, cmdConvert, cmdDemolish, cmdEnqueue, cmdRally } from '../src/world.js';
import { createHeroInput, mergeHeroInput } from '../src/hero.js';
import { scoreOf } from '../src/stats.js';
import { encodeSnapshot } from '../src/net/snapshot.js';
import { createNetFx, fullStateEvents } from '../src/net/netfx.js';
import { C2S, DIFFICULTIES, EV, NET, S2C, roomCode } from '../src/net/protocol.js';
import { TEAMS } from '../src/config.js';

/**
 * Odalar: kur / katıl / lobi / başlat / oyun / bitiş. Sunucu otoriterdir: her oda kendi dünyasını saniyede 20 adım koşturur,
 * her 2 adımda bir durum paketi ve biriken olayları yayar. Hesap yok: bağlantı `token` ile tanınır, kopan oyuncu aynı
 * token'la koltuğuna geri döner. **Bot devralmaz**: ayrılanın kahramanı durur, askerleri ve binaları sahada kalır
 * (savaşır, ölür, yıkılır) ama yeni emir almaz; oyuncu dönerse bıraktığı yerden devam eder. Oda ancak bağlı kimse
 * kalmayınca kapanır.
 */
export function createRooms({ log = console.log } = {}) {
  const rooms = new Map();   // code -> room
  const conns = new Set();   // canlı bağlantılar
  const byToken = new Map(); // token -> conn (kopmuş olsa da)

  const send = (conn, obj) => { if (conn.ws && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(obj)); };
  const sendBin = (conn, bytes) => { if (conn.ws && conn.ws.readyState === 1) conn.ws.send(bytes, { binary: true }); };
  const error = (conn, msg) => send(conn, { t: S2C.ERROR, msg });

  function lobbyMsg(room) {
    return { t: S2C.LOBBY, code: room.code, hostId: room.hostId, settings: room.settings, state: room.state,
      seats: room.seats.map((c, i) => ({ slot: i, id: c.id, nick: c.nick, online: Boolean(c.ws) })) };
  }
  const broadcastLobby = room => { for (const c of room.seats) send(c, lobbyMsg(room)); };

  function leaveRoom(conn, { keepSeat = false, hard = false } = {}) {
    const room = conn.room; if (!room) return;
    if (room.state === 'playing' && keepSeat) return; // kopma: koltuk tutulur
    /**
      * Oyun sürerken "Oyundan çık": koltuk ve ülke sahada kalır, oyuncu yalnızca **elini çeker** (conn.left).
      * Bağlantı açık kalır (ana ekrana döner), oyun verisi ona gönderilmez. Aynı odaya aynı kodla dönerse
      * (JOIN) ya da sayfayı yenileyip token'ıyla gelirse kaldığı yerden devam eder.
      */
    if (room.state === 'playing' && conn.player && !hard) {
      abandon(room, conn.player);
      conn.left = true;
      closeIfEmpty(room);
      return;
    }
    // hard: yeni oda kurdu / başka odaya geçti; koltuğunu bütünüyle bırakır, ülkesi sahipsiz kalır.
    if (room.state === 'playing' && conn.player) abandon(room, conn.player);
    const i = room.seats.indexOf(conn);
    if (i >= 0) room.seats.splice(i, 1);
    conn.room = null; conn.player = null;
    if (!room.seats.length) { stopRoom(room); rooms.delete(room.code); log(`oda kapandı ${room.code}`); return; }
    if (room.hostId === conn.id) room.hostId = room.seats[0].id;
    if (room.state === 'lobby') { room.settings.teamSize = Math.max(room.settings.teamSize, room.seats.length); broadcastLobby(room); }
  }
  /** Bağlı kimse kalmadıysa oda kapanır: dünya bellekte yaşar, izleyeni olmayan odayı tutmanın anlamı yok. */
  function closeIfEmpty(room) {
    if (room.seats.some(c => c.ws && !c.left)) return false;
    stopRoom(room); rooms.delete(room.code); log(`bağlı kimse kalmadı, oda kapandı ${room.code}`);
    return true;
  }

  function stopRoom(room) { if (room.timer) { clearInterval(room.timer); room.timer = null; } }

  /**
    * Ayrılan / kopan oyuncu: **bot devralmaz**. Kahraman durur (girdi sıfırlanır, şarj bozulur), askerleri ve
    * binaları sahada kalır; düşman gelirse savaşırlar, ölürler, binaları yıkılabilir, sıradaki üretim çıkar.
    * Yeni emir gelmez, çünkü ne insan girdisi ne de bot beyni vardır. Oyuncu dönünce aynı koltukta devam eder.
    */
  function abandon(room, p) {
    if (!p.human || p.away) return;
    p.away = true;
    p.input = createHeroInput();
    const e = p.hero;
    if (e) { e.moveDir.set(0, 0, 0); e.charging = false; e.blocking = false; e.sprinting = false; }
    log(`ayrıldı (ülkesi sahada kaldı): ${p.name} (${room.code})`);
  }
  /** Oyuncu geri döndü: komuta yeniden açılır. */
  function rejoinPlayer(p) { if (p) p.away = false; }

  function startGame(room) {
    const humans = room.seats.map(c => ({ name: c.nick, netId: c.id }));
    const settings = room.settings;
    room.events = []; room.playerEvents = new Map();
    const world = createWorld({ fx: createNetFx(room) });
    const seed = 1000 + Math.floor(Math.random() * 900000);
    setupGame(world, { teamSize: settings.teamSize, difficulty: settings.difficulty, humans, seed });
    room.world = world; room.state = 'playing'; room.seed = seed; room.tickNo = 0; room.acc = 0; room.last = performance.now();
    for (const p of world.humans) { const c = room.seats.find(x => x.id === p.netId); if (c) { c.player = p; p.conn = c; } }
    world.onEnd = report => {
      room.state = 'ended'; room.report = report;
      flush(room);
      for (const c of room.seats) send(c, { t: S2C.END, report });
      stopRoom(room);
      log(`bitti ${room.code}: ${report.outcome.result} (${report.time} sn)`);
    };
    const players = world.players.map(p => ({ id: p.id, name: p.name, color: p.color, faction: p.faction, slot: p.slot, human: p.human }));
    for (const c of room.seats) sendStart(room, c, players);
    room.events.length = 0; room.playerEvents.clear();
    room.timer = setInterval(() => tick(room), NET.tick * 1000);
    log(`başladı ${room.code}: ${settings.teamSize}v${settings.teamSize} ${settings.difficulty}, ${humans.length} insan`);
  }

  /** Bir bağlantıya oyunun başlangıcı + dünyanın tam durumu (ilk giriş ve geri bağlanma). */
  function sendStart(room, conn, players = null) {
    const world = room.world;
    players = players || world.players.map(p => ({ id: p.id, name: p.name, color: p.color, faction: p.faction, slot: p.slot, human: p.human }));
    send(conn, { t: S2C.START, seed: room.seed, teamSize: world.teamSize, difficulty: world.difficulty, players, you: conn.player ? conn.player.id : -1, time: world.time });
    send(conn, { t: S2C.EVENTS, list: fullStateEvents(world) });
    sendBin(conn, encodeSnapshot(world, true));
    if (conn.player && conn.player.rally) { const r = conn.player.rally; send(conn, { t: S2C.EVENTS, list: [[EV.RALLY, r.x, r.z, r.color, r.target ? (r.target.kind ? 's' : 'e') + r.target.id : null]] }); }
    send(conn, playersMsg(world));
  }

  function playersMsg(world) {
    return { t: S2C.PLAYERS, time: world.time, list: world.players.map(p => ({ g: p.eco.gold, w: p.eco.wood, f: p.eco.food, sp: p.eco.soldiersSpawned, att: Boolean(p.ai && p.ai.attacking), elim: Boolean(p.eliminated), sc: scoreOf(p).total, hu: p.human, on: p.human ? Boolean(p.conn && p.conn.ws && !p.away) : true })) };
  }

  function tick(room) {
    const now = performance.now();
    room.acc += Math.min(0.5, (now - room.last) / 1000); room.last = now;
    let steps = 0;
    while (room.acc >= NET.tick && steps < 5) {
      step(room.world, NET.tick); room.acc -= NET.tick; steps++; room.tickNo++;
      if (room.state !== 'playing') return;
      if (room.tickNo % NET.snapshotEvery === 0) flush(room);
    }
    if (room.acc >= NET.tick) room.acc = 0; // geride kaldıysa (makine takıldı) sürükleme yok
    // Kopan insanlar: bot devralmaz, yalnızca komutası kesilir (bkz. abandon). Bağlı kimse kalmazsa oda kapanır.
    for (const c of room.seats) {
      if (!c.ws && c.player && !c.player.away) abandon(room, c.player);
    }
    closeIfEmpty(room);
  }

  function flush(room) {
    const world = room.world, events = room.events; room.events = [];
    const snap = encodeSnapshot(world);
    const pl = playersMsg(world);
    for (const c of room.seats) {
      if (!c.ws || c.left) continue;
      const own = c.player ? room.playerEvents.get(c.player.id) : null;
      const list = own && own.length ? events.concat(own) : events;
      if (list.length) send(c, { t: S2C.EVENTS, list });
      sendBin(c, snap);
      send(c, pl);
    }
    room.playerEvents.clear();
  }

  function handleCmd(room, conn, msg) {
    const world = room.world, p = conn.player; if (!p || !p.human || world.ended) return;
    const sid = id => world.structures.find(s => s.id === id);
    let err = null;
    switch (msg.k) {
      case 'enqueue': err = cmdEnqueue(world, p, sid(msg.sid), String(msg.type)); break;
      case 'cancel': err = cmdCancel(world, p, sid(msg.sid), Number(msg.i)); break;
      case 'build': err = cmdBuild(world, p, String(msg.kind), +msg.x || 0, +msg.z || 0); break;
      case 'demolish': err = cmdDemolish(world, p, sid(msg.sid)); break;
      case 'rally': {
        let target = null;
        if (typeof msg.tid === 'string') { const id = Number(msg.tid.slice(1)); target = msg.tid[0] === 's' ? sid(id) : world.entities.find(e => e.id === id); }
        cmdRally(world, p, +msg.x || 0, +msg.z || 0, target || null); break;
      }
      case 'convert': err = cmdConvert(world, p, String(msg.type)); break;
      default: return;
    }
    if (err) world.fx.ping(p, 'error');
  }

  function onMessage(conn, data, isBinary) {
    if (isBinary) return;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = conn.room;
    switch (msg.t) {
      case C2S.HELLO: {
        conn.nick = String(msg.nick || '').trim().slice(0, 16) || `Muhafız-${Math.floor(1000 + Math.random() * 9000)}`;
        const old = msg.token && byToken.get(msg.token);
        if (old && old !== conn && old.room) {
          // Geri bağlanma: eski bağlantının kimliği ve koltuğu devralınır.
          conn.id = old.id; conn.token = old.token; conn.room = old.room; conn.player = old.player;
          const r = old.room, i = r.seats.indexOf(old); if (i >= 0) r.seats[i] = conn;
          conn.left = false;
          if (conn.player) { conn.player.conn = conn; rejoinPlayer(conn.player); }
          byToken.set(conn.token, conn); conns.delete(old);
          send(conn, { t: S2C.WELCOME, id: conn.id, token: conn.token, nick: conn.nick });
          if (r.state === 'playing') sendStart(r, conn); else if (r.state === 'ended') { send(conn, lobbyMsg(r)); send(conn, { t: S2C.END, report: r.report }); } else broadcastLobby(r);
          log(`geri bağlandı ${conn.nick} (${r.code})`);
          return;
        }
        conn.token = conn.token || randomBytes(12).toString('base64url');
        byToken.set(conn.token, conn);
        send(conn, { t: S2C.WELCOME, id: conn.id, token: conn.token, nick: conn.nick });
        return;
      }
      case C2S.CREATE: {
        if (room) leaveRoom(conn, { hard: true });
        let code = roomCode(); while (rooms.has(code)) code = roomCode();
        const r = { code, hostId: conn.id, seats: [conn], state: 'lobby', settings: sanitize(msg), world: null, events: [], playerEvents: new Map(), timer: null, report: null, created: Date.now() };
        rooms.set(code, r); conn.room = r;
        broadcastLobby(r); log(`oda kuruldu ${code} (${conn.nick})`);
        return;
      }
      case C2S.JOIN: {
        const code = String(msg.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return error(conn, 'Böyle bir oda yok');
        // Bu odadan ayrılmış (ya da kopmuş) oyuncu: koltuğu hâlâ onun, kaldığı yerden devam eder.
        if (r.seats.includes(conn) && conn.player) {
          conn.left = false; rejoinPlayer(conn.player);
          if (r.state === 'playing') sendStart(r, conn);
          else if (r.state === 'ended') { send(conn, lobbyMsg(r)); send(conn, { t: S2C.END, report: r.report }); }
          else broadcastLobby(r);
          log(`geri döndü ${conn.nick} (${r.code})`);
          return;
        }
        if (r.state !== 'lobby') return error(conn, 'Oyun başlamış');
        if (r.seats.length >= TEAMS.sizes[TEAMS.sizes.length - 1]) return error(conn, 'Oda dolu');
        if (room) leaveRoom(conn, { hard: true });
        r.seats.push(conn); conn.room = r;
        if (r.settings.teamSize < r.seats.length) r.settings.teamSize = r.seats.length;
        broadcastLobby(r); log(`katıldı ${conn.nick} -> ${code}`);
        return;
      }
      case C2S.SETTINGS: {
        if (!room || room.hostId !== conn.id || room.state !== 'lobby') return;
        const s = sanitize(msg); s.teamSize = Math.max(s.teamSize, room.seats.length);
        room.settings = s; broadcastLobby(room); return;
      }
      case C2S.START: {
        if (!room || room.hostId !== conn.id || room.state !== 'lobby') return;
        startGame(room); return;
      }
      case C2S.LEAVE: { if (room) leaveRoom(conn); return; }
      // Elini çekmiş (ayrılmış) bağlantı komuta edemez: ülkesi sahada durur ama emir almaz.
      case C2S.INPUT: { if (room && !conn.left && room.state === 'playing' && conn.player && conn.player.input) mergeHeroInput(conn.player.input, msg); return; }
      case C2S.CMD: { if (room && !conn.left && room.state === 'playing') handleCmd(room, conn, msg); return; }
      case C2S.PING: { send(conn, { t: S2C.PONG, at: msg.at }); return; }
      default: return;
    }
  }

  function sanitize(msg) {
    const teamSize = Math.max(1, Math.min(TEAMS.sizes[TEAMS.sizes.length - 1], Math.round(+msg.teamSize) || 1));
    const difficulty = DIFFICULTIES.includes(msg.difficulty) ? msg.difficulty : 'normal';
    return { teamSize, difficulty };
  }

  let nextId = 1;
  return {
    attach(ws) {
      const conn = { id: nextId++, token: null, nick: '', ws, room: null, player: null, lostAt: 0, left: false };
      conns.add(conn);
      ws.on('message', (data, isBinary) => { try { onMessage(conn, data, isBinary); } catch (err) { log('mesaj hatası', err); } });
      ws.on('close', () => {
        conns.delete(conn); conn.ws = null; conn.lostAt = performance.now();
        const r = conn.room;
        if (!r) return;
        if (r.state === 'playing' && conn.player) { conn.player.input = createHeroInput(); broadcastLobby(r); log(`koptu ${conn.nick} (${r.code})`); }
        else leaveRoom(conn);
      });
      ws.on('error', () => {});
    },
    rooms,
    stats() { return { rooms: rooms.size, conns: conns.size }; },
  };
}
