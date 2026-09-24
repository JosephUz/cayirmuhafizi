import * as T from 'three';
import { createEntity, makeStats } from '../characters.js';
import { BUILDINGS, CHARGE, LEVEL, SOLDIER_TYPES, SPRINT_MULT, TEAMS } from '../config.js';
import { initResources } from '../economy.js';
import { computeEnvironment, computeLayout } from '../environment.js';
import { limitsFor } from '../players.js';
import { C2S, EV, NET, S2C } from './protocol.js';
import { decodeSnapshot } from './snapshot.js';

/**
 * Çevrim içi istemci: sunucuya bağlanır, lobiyi yürütür, oyun başlayınca dünyayı **kopya** olarak kurar ve sunucudan
 * gelen olaylarla (doğuş / silinme / efekt) ve durum paketleriyle (konum, can, bayraklar) günceller. Simülasyon
 * koşturmaz; birimler iki paket arasında ara değerle (NET.interpDelay geriden) çizilir, istemciye ait sayaçlar
 * (ölüm animasyonu, doğuş büyümesi, eşya uçuşu) yerelde ilerletilir. Girdi saniyede 20 kez, komutlar anında gider.
 */
export function createNetClient(world, hooks) {
  let ws = null, connected = false, wantReconnect = false;
  const byE = new Map(), byS = new Map(), byI = new Map(), byA = new Map(), byZ = new Map();
  const pending = { mv: [0, 0], aim: [0, 1], ha: false, sp: false, aq: false, ah: false, ar: false, dq: false, jq: false, yaw: 0, ly: false };
  let inputTimer = 0, keepAlive = 0, lastSnapTime = 0, lastSnapWall = 0, rtt = 0;
  /** Sunucu saati - yerel saat farkı (sn); paket titremesi çizime yansımasın diye yumuşatılır (bkz. NET.clockSmooth). */
  let clockOffset = 0, clockReady = false;
  /**
   * Kendi kahramanının yerel tahmini: girdi anında uygulanır, sunucudan gelen konum farkı (resid) her karede
   * yumuşakça kapatılır. Yetki yine sunucudadır; burada yalnızca **çizilen** konum üretilir.
   */
  const pred = { vx: 0, vz: 0, offX: 0, offZ: 0 };
  const predReset = () => { pred.vx = pred.vz = pred.offX = pred.offZ = 0; };
  const me = () => world.me;
  // Kimlik ve oda **sekmeye** özeldir (sessionStorage): aynı tarayıcıda iki sekme iki ayrı oyuncudur, sayfa yenilemesi
  // aynı koltuğa geri döner. Ad ise kalıcıdır (localStorage, bkz. screens.js).
  const token = () => { try { return sessionStorage.getItem('cm.token') || ''; } catch { return ''; } };
  const saveToken = t => { try { sessionStorage.setItem('cm.token', t); } catch { /* yok */ } };

  const send = obj => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  function connect(nick) {
    if (ws) { try { ws.close(); } catch { /* yok */ } }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.binaryType = 'arraybuffer';
    wantReconnect = true;
    ws.onopen = () => { connected = true; send({ t: C2S.HELLO, nick, token: token() }); hooks.onConnect && hooks.onConnect(); };
    ws.onclose = () => { connected = false; hooks.onDisconnect && hooks.onDisconnect(); if (wantReconnect) setTimeout(() => { if (wantReconnect) connect(nick); }, 1500); };
    ws.onerror = () => {};
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') { let msg; try { msg = JSON.parse(ev.data); } catch { return; } onText(msg); }
      else onSnapshot(decodeSnapshot(new Uint8Array(ev.data)));
    };
  }

  const remember = code => { try { if (code) sessionStorage.setItem('cm.room', code); else sessionStorage.removeItem('cm.room'); } catch { /* yok */ } };
  function onText(msg) {
    switch (msg.t) {
      case S2C.WELCOME: saveToken(msg.token); client.id = msg.id; client.nick = msg.nick; hooks.onWelcome && hooks.onWelcome(msg); break;
      case S2C.LOBBY: client.lobby = msg; remember(msg.code); hooks.onLobby && hooks.onLobby(msg); break;
      case S2C.ERROR: hooks.onError && hooks.onError(msg.msg); break;
      case S2C.START: setupClientWorld(msg); hooks.onStart && hooks.onStart(msg); break;
      case S2C.EVENTS: applyEvents(msg.list); break;
      case S2C.PLAYERS: applyPlayers(msg); break;
      case S2C.END: world.ended = true; world.report = msg.report; remember(null); hooks.onEnd && hooks.onEnd(msg.report); break;
      case S2C.PONG: rtt = performance.now() - msg.at; client.rtt = rtt; break;
      default: break;
    }
  }

  // ---------- Dünya kurulumu ----------
  function clearWorld() {
    for (const e of world.entities) world.fx.removeEntity(e);
    for (const s of world.structures) world.fx.removeStructure(s);
    for (const it of world.items) world.fx.removeItem(it);
    for (const a of world.arrows) world.fx.removeArrow(a);
    for (const z of [...world.spins, ...world.tornadoes, ...world.zones]) world.fx.removeZone(z);
    for (const m of [byE, byS, byI, byA, byZ]) m.clear();
    world.entities.length = 0; world.structures.length = 0; world.items.length = 0; world.arrows.length = 0;
    world.spins.length = 0; world.tornadoes.length = 0; world.zones.length = 0;
    predReset();
  }
  function setupClientWorld(msg) {
    clearWorld();
    const layout = computeLayout(msg.teamSize);
    const env = computeEnvironment(layout, msg.seed);
    const players = msg.players.map(pp => ({
      ...pp, eco: { gold: 0, wood: 0, food: 0, soldiersSpawned: 0, work: { spot: null, timer: 0 } }, ai: pp.human ? null : { attacking: false },
      hero: null, banner: null, base: env.bases[`${pp.faction}:${pp.slot}`], towerSpots: env.towerSpots.filter(t => t.faction === pp.faction && t.slot === pp.slot),
      rally: null, st: null, score: 0, eliminated: false, input: null, online: true,
    }));
    Object.assign(world, {
      env, layout, seed: msg.seed, half: layout.half, teamSize: msg.teamSize, towerSpots: env.towerSpots, nodes: env.nodes, lanePoints: env.lanePoints,
      obstacles: env.obstacles, bases: env.bases, players, humans: players.filter(p => p.human), limits: limitsFor(players.length), camps: [],
      time: msg.time || 0, paused: false, ended: false, running: true, difficulty: msg.difficulty, outcome: null, report: null, timeline: [],
    });
    world.obstacleVersion++;
    world.me = players.find(p => p.id === msg.you) || players[0];
    // İzlenen takım: sis, bilinen yapılar, renkler ve sayımlar senin takımının gözünden (PvP'de kırmızı da olabilir).
    world.side = world.me.faction;
    world.player = null;
    initResources(world);
    world.fog.reset();
    lastSnapTime = msg.time || 0; lastSnapWall = performance.now(); clockReady = false;
    world.replicated = true;
    hooks.onArena && hooks.onArena();
  }

  // ---------- Olaylar ----------
  const typeIndex = new Map(SOLDIER_TYPES.map(t => [t.key, t]));
  function applyEvents(list) {
    for (const ev of list) {
      switch (ev[0]) {
        case EV.ENTITY_ADD: addEntity(ev); break;
        case EV.ENTITY_DEL: { const e = byE.get(ev[1]); if (!e) break; byE.delete(ev[1]); world.fx.removeEntity(e); const i = world.entities.indexOf(e); if (i >= 0) world.entities.splice(i, 1); break; }
        case EV.ENTITY_REFRESH: { const e = byE.get(ev[1]); if (!e) break; e.loadout = { weapon: ev[2], shield: Boolean(ev[3]), horse: Boolean(ev[4]) }; e.stats = makeStats(e.loadout, e.isPlayer); e.stats.maxHp = ev[5]; e.stats.speed = ev[6]; e.radius = ev[7]; world.fx.refreshEntity(e); break; }
        case EV.STRUCT_ADD: addStructure(ev); break;
        case EV.STRUCT_DEL: { const s = byS.get(ev[1]); if (!s) break; byS.delete(ev[1]); world.fx.removeStructure(s); dropObstacle(s); const i = world.structures.indexOf(s); if (i >= 0) world.structures.splice(i, 1); if (world.sel && world.sel.structure === s) world.sel.structure = null; break; }
        case EV.ITEM_ADD: addItem(ev); break;
        case EV.ITEM_DEL: { const it = byI.get(ev[1]); if (!it) break; byI.delete(ev[1]); world.fx.removeItem(it); const i = world.items.indexOf(it); if (i >= 0) world.items.splice(i, 1); break; }
        case EV.ARROW_ADD: { const a = { id: ev[1], pos: new T.Vector3(ev[2], ev[3], ev[4]), yaw: ev[5], siege: Boolean(ev[6]), homing: Boolean(ev[7]), scale: ev[8] || 1, view: null, net: null }; byA.set(a.id, a); world.arrows.push(a); world.fx.addArrow(a); break; }
        case EV.ARROW_DEL: { const a = byA.get(ev[1]); if (!a) break; byA.delete(ev[1]); world.fx.removeArrow(a); const i = world.arrows.indexOf(a); if (i >= 0) world.arrows.splice(i, 1); break; }
        case EV.ZONE_ADD: addZone(ev); break;
        case EV.ZONE_DEL: { const z = byZ.get(ev[1]); if (!z) break; byZ.delete(ev[1]); world.fx.removeZone(z); for (const list of [world.spins, world.tornadoes, world.zones]) { const i = list.indexOf(z); if (i >= 0) list.splice(i, 1); } break; }
        case EV.BURST: world.fx.burst(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6]); break;
        case EV.RING: world.fx.ring(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
        case EV.HEAL: world.fx.heal(ev[1], ev[2], ev[3]); break;
        case EV.STRIP: world.fx.strip(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6], ev[7], ev[8]); break;
        case EV.PING: world.fx.ping(me(), ev[1]); break;
        case EV.FLASH: world.fx.flash(me(), ev[1]); break;
        case EV.FLOAT: world.fx.float(me(), ev[1], { x: ev[2], y: ev[3], z: ev[4] }, ev[5]); break;
        case EV.ALERT: { const s = byS.get(ev[1]); if (s) world.fx.alert(me(), s); break; }
        case EV.KILLER: { const src = ev[1] === 's' ? byS.get(ev[2]) : byE.get(ev[2]); if (src) world.fx.killer(me(), src); break; }
        case EV.RALLY: {
          const p = me(); if (!p) break;
          if (ev[1] == null) p.rally = null;
          else { let target = null; if (typeof ev[4] === 'string') { const id = Number(ev[4].slice(1)); target = ev[4][0] === 's' ? byS.get(id) : byE.get(id); } p.rally = { x: ev[1], z: ev[2], color: ev[3], target: target || null }; }
          world.fx.rally(p); break;
        }
        default: break;
      }
    }
  }
  function addEntity(ev) {
    const [, id, typeKey, ownerIdx, faction, weapon, shield, horse, flags, workerKind, radius, vision, maxHp, speed, x, z, facing, spawnTimer, campId] = ev;
    if (byE.has(id)) return;
    const owner = ownerIdx >= 0 ? world.players[ownerIdx] : null;
    const e = createEntity({ faction, owner, loadout: { weapon, shield: Boolean(shield), horse: Boolean(horse) }, isPlayer: Boolean(flags & 1), x, z });
    e.id = id; e.typeKey = typeKey || null; e.isHero = Boolean(flags & 2); e.isWorker = Boolean(flags & 4); e.isBeast = Boolean(flags & 8); e.isSiege = Boolean(flags & 16); e.isBandit = Boolean(flags & 32);
    e.workerKind = workerKind || null; e.radius = radius; e.vision = vision; e.stats.maxHp = maxHp; e.hp = maxHp; e.stats.speed = speed; e.facing = facing; e.spawnTimer = spawnTimer;
    if (e.isWorker) e.tier = 1;
    e.camp = campId >= 0 ? byS.get(campId) || null : null;
    e.brain = null;
    e.net = { t0: lastSnapTime, x0: x, z0: z, f0: facing, j0: 0, t1: lastSnapTime, x1: x, z1: z, f1: facing, j1: 0 };
    byE.set(id, e); world.entities.push(e); world.fx.addEntity(e);
    if (owner && (e.isPlayer || e.isHero)) { owner.hero = e; if (owner === world.me) { world.player = e; world.loadout = e.loadout; hooks.onHero && hooks.onHero(e); } }
  }
  function addStructure(ev) {
    const [, id, kind, faction, ownerIdx, x, z, ready, buildTime, hp, maxHp, raidSide] = ev;
    if (byS.has(id)) return;
    const owner = ownerIdx >= 0 ? world.players[ownerIdx] : null, spec = BUILDINGS[kind];
    const pos = new T.Vector3(x, 0, z);
    const s = { id, kind, faction, owner, pos, radius: spec.radius, hp, maxHp, alive: true, hitFlash: 0, cooldown: 0, spawnTimer: 0, buildTime, buildTimer: ready ? 0 : buildTime, ready: Boolean(ready),
      obstacle: { pos, vel: new T.Vector3(), push: new T.Vector3(), radius: spec.radius, invMass: 0 }, deadTimer: 0, queue: [], progress: 0, seen: faction !== 'red', seenByRed: faction !== 'blue',
      respawnTimer: 0, waveTimer: 0, raidSide: raidSide || null, shots: 0, demolished: false, view: null };
    byS.set(id, s); world.structures.push(s); world.obstacles.push(s.obstacle); world.obstacleVersion++;
    world.fx.addStructure(s);
    if (kind === 'camp') world.camps.push(s);
    if (kind === 'banner' && owner) owner.banner = s;
  }
  function dropObstacle(s) { const j = world.obstacles.indexOf(s.obstacle); if (j >= 0) { world.obstacles.splice(j, 1); world.obstacleVersion++; } }
  function addItem(ev) {
    const [, id, kind, ownerIdx, x, z, fx, fz, tx, tz, dur, ttl, amount] = ev;
    if (byI.has(id)) return;
    const it = { id, kind, owner: ownerIdx >= 0 ? world.players[ownerIdx] : null, amount, pos: new T.Vector3(x, dur > 0 ? 0.6 : 0, z), claimedBy: null, taken: false, phase: Math.random() * 6, ttl,
      fly: dur > 0 ? { fx, fz, tx, tz, t: 0, dur } : null, view: null };
    byI.set(id, it); world.items.push(it); world.fx.addItem(it);
  }
  function addZone(ev) {
    const [, id, kind, ownerId, x, z, radius, life, maxLife, bow, count, vacR, vacLife, arrows, blades, stakes, tickEvery] = ev;
    if (byZ.has(id)) return;
    const owner = ownerId >= 0 ? byE.get(ownerId) || null : null;
    const zn = { id, kind, owner: kind === 'spin' ? owner : null, source: owner, x, z, radius, life, maxLife, bow: Boolean(bow), count, arrows, blades, stakes, tickEvery,
      vacuum: vacR > 0 ? { radius: vacR, life: vacLife, maxLife: vacLife } : null, view: null };
    byZ.set(id, zn);
    (kind === 'spin' ? world.spins : kind === 'tornado' ? world.tornadoes : world.zones).push(zn);
    world.fx.addZone(zn);
  }

  // ---------- Durum paketi ----------
  function onSnapshot(snap) {
    if (!snap || !world.replicated) return;
    const T0 = snap.time;
    lastSnapTime = T0; lastSnapWall = performance.now(); world.time = T0;
    // Saat yumuşatma: ölçülen fark harmanlanır; büyük sapmada (arka plan sekme, yeniden bağlanma) doğrudan kurulur.
    const measured = T0 - lastSnapWall / 1000;
    if (!clockReady || Math.abs(measured - clockOffset) > NET.clockJump) { clockOffset = measured; clockReady = true; }
    else clockOffset += (measured - clockOffset) * NET.clockSmooth;
    for (const r of snap.entities) {
      const e = byE.get(r.id); if (!e) continue;
      const n = e.net;
      n.t0 = n.t1; n.x0 = n.x1; n.z0 = n.z1; n.f0 = n.f1; n.j0 = n.j1;
      n.t1 = T0; n.x1 = r.x; n.z1 = r.z; n.f1 = r.facing; n.j1 = r.jumpY;
      if (n.t1 - n.t0 > 0.5) { n.t0 = n.t1; n.x0 = n.x1; n.z0 = n.z1; n.f0 = n.f1; n.j0 = n.j1; }
      const wasAlive = e.alive;
      e.hp = r.hp; e.stats.maxHp = r.maxHp; e.alive = r.alive; e.sprinting = r.sprinting; e.working = r.working; e.charging = r.charging; e.charge = r.charge;
      e.stun = r.stun ? 0.1 : 0; e.dodgeTimer = r.dodge ? 0.1 : 0; e.blocking = r.blocking; e.merged = r.merged;
      e.attackTimer = r.attackTimer; e.hitFlash = Math.max(e.hitFlash, r.hitFlash);
      if (r.level !== e.level) { const old = e.level; e.level = r.level; if (e.view && old !== r.level) hooks.onLevel && hooks.onLevel(e); }
      e.tier = r.tier; e.deaths = r.deaths; e.xp = r.xp;
      if (wasAlive && !e.alive) { e.deathTimer = 0; if (e === world.player) hooks.onOwnDeath && hooks.onOwnDeath(); }
      if (!wasAlive && e.alive) { e.deathTimer = 0; e.hitFlash = 0; }
    }
    for (const r of snap.structures) {
      const s = byS.get(r.id); if (!s) continue;
      const wasAlive = s.alive;
      s.hp = r.hp; s.alive = r.alive; s.ready = r.ready; s.seen = s.seen || r.seen; s.seenByRed = s.seenByRed || r.seenByRed;
      s.buildTimer = r.buildTimer; s.respawnTimer = r.respawnTimer; s.waveTimer = r.waveTimer; s.hitFlash = Math.max(s.hitFlash, r.hitFlash); s.shots = r.shots;
      s.queue = r.queue.filter(Boolean);
      const t0 = s.queue.length ? typeIndex.get(s.queue[0]) : null; s.progress = t0 ? r.progressK * t0.train : 0;
      if (wasAlive && !s.alive) { dropObstacle(s); s.queue.length = 0; if (world.sel && world.sel.structure === s) world.sel.structure = null; if (s.owner && s.owner.human && s.kind === 'banner') s.owner.eliminated = true; }
      if (!wasAlive && s.alive && !world.obstacles.includes(s.obstacle)) { world.obstacles.push(s.obstacle); world.obstacleVersion++; }
    }
    for (const r of snap.arrows) {
      const a = byA.get(r.id); if (!a) continue;
      a.net = a.net || { t0: T0, x0: r.x, y0: r.y, z0: r.z, t1: T0, x1: r.x, y1: r.y, z1: r.z };
      const n = a.net; n.t0 = n.t1; n.x0 = n.x1; n.y0 = n.y1; n.z0 = n.z1; n.t1 = T0; n.x1 = r.x; n.y1 = r.y; n.z1 = r.z; a.yaw = r.yaw;
    }
    for (const r of snap.zones) {
      const z = byZ.get(r.id); if (!z) continue;
      z.x = r.x; z.z = r.z; z.radius = r.radius; z.life = r.life; if (z.vacuum) z.vacuum.life = r.vacuumLife;
    }
  }
  function applyPlayers(msg) {
    if (!world.replicated) return;
    msg.list.forEach((r, i) => {
      const p = world.players[i]; if (!p) return;
      p.eco.gold = r.g; p.eco.wood = r.w; p.eco.food = r.f; p.eco.soldiersSpawned = r.sp;
      if (p.ai) p.ai.attacking = r.att; p.eliminated = r.elim; p.score = r.sc; p.online = r.on;
      // Kopan insanı bot devraldıysa listelerde bot olarak görünür.
      if (r.hu === false && p.human) { p.human = false; p.ai = { attacking: r.att }; }
    });
  }

  // ---------- Her kare ----------
  const zoneLists = [world.spins, world.tornadoes, world.zones];
  function update(dt, nowWall) {
    if (!world.replicated) return;
    const wall = nowWall / 1000;
    const renderTime = (clockReady ? wall + clockOffset : lastSnapTime + (nowWall - lastSnapWall) / 1000) - NET.interpDelay;
    for (const e of world.entities) {
      const n = e.net; if (!n) continue;
      const span = n.t1 - n.t0;
      const k = span > 1e-4 ? Math.max(0, Math.min(1, (renderTime - n.t0) / span)) : 1;
      const px = e.pos.x, pz = e.pos.z;
      e.pos.x = n.x0 + (n.x1 - n.x0) * k; e.pos.z = n.z0 + (n.z1 - n.z0) * k; e.jumpY = n.j0 + (n.j1 - n.j0) * k;
      let df = n.f1 - n.f0; df = ((df + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; e.facing = n.f0 + df * k;
      // Yürüyüş animasyonu için hız: bu karedeki yer değiştirmeden.
      if (dt > 0) { e.vel.x = (e.pos.x - px) / dt; e.vel.z = (e.pos.z - pz) / dt; e.push.x = e.push.z = 0; }
      if (!e.alive) e.deathTimer += dt;
      if (e.attackTimer > 0) e.attackTimer = Math.max(0, e.attackTimer - dt);
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.working) e.workTimer += dt;
    }
    leadSelf(dt);
    for (const a of world.arrows) {
      const n = a.net; if (!n) continue;
      const span = n.t1 - n.t0, k = span > 1e-4 ? Math.max(0, Math.min(1.5, (renderTime - n.t0) / span)) : 1;
      a.pos.set(n.x0 + (n.x1 - n.x0) * k, n.y0 + (n.y1 - n.y0) * k, n.z0 + (n.z1 - n.z0) * k);
    }
    for (const s of world.structures) { if (s.buildTimer > 0) s.buildTimer -= dt; if (s.spawnTimer > 0) s.spawnTimer -= dt; if (s.hitFlash > 0) s.hitFlash -= dt; if (s.respawnTimer > 0) s.respawnTimer -= dt; if (s.waveTimer > 0) s.waveTimer -= dt; }
    // Kare başına dizi kopyalamadan: üç listeyi ayrı gez (çöp toplayıcıyı boşuna yormasın).
    for (const list of zoneLists) for (const z of list) { z.life -= dt; if (z.vacuum) z.vacuum.life -= dt; }
    world.fog.update(dt);
    // Girdi: saniyede 20 kez; kenar bayrakları gönderimden sonra sıfırlanır.
    inputTimer += dt;
    if (inputTimer >= NET.inputEvery && world.player) {
      inputTimer = 0;
      send({ t: C2S.INPUT, mv: [+pending.mv[0].toFixed(3), +pending.mv[1].toFixed(3)], aim: [+pending.aim[0].toFixed(2), +pending.aim[1].toFixed(2)], ha: pending.ha, sp: pending.sp, aq: pending.aq, ah: pending.ah, ar: pending.ar, dq: pending.dq, jq: pending.jq, yaw: +pending.yaw.toFixed(3), ly: pending.ly });
      pending.aq = pending.ar = pending.dq = pending.jq = false;
    }
    keepAlive += dt;
    if (keepAlive >= NET.keepAlive) { keepAlive = 0; send({ t: C2S.PING, at: performance.now() }); }
  }

  /**
   * **İleri kayma**: kendi kahramanın ara değer yüzünden interpDelay kadar geriden çizilir; bu gecikmeyi kapatmak
   * için çizim konumuna, yerel girdiden üretilmiş yumuşak bir kayma eklenir. Kayma paketlerle **hiç konuşmaz**,
   * bu yüzden paket başına düzeltme zonklaması olmaz: ara değer kadar pürüzsüz, girdiye ise anında cevap verir.
   * Yürürken kayma hız x interpDelay'e oturur (gecikme kapanır), tuş bırakılınca yumuşakça sıfırlanır.
   * Duvara dayanınca sunucu durur ama kayma sürdüğü için kahraman en çok NET.leadMax kadar içeri taşmış görünür.
   */
  function leadSelf(dt) {
    const e = world.player;
    if (!NET.predict || !e || !e.net || !e.alive || dt <= 0) { predReset(); return; }
    let dx = pending.mv[0], dz = pending.mv[1];
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) { dx /= len; dz /= len; } else { dx = dz = 0; }
    const st = e.stats;
    const control = e.attackTimer > 0 ? (st.attackControl != null ? st.attackControl : st.weapon.ranged ? 0.35 : 0.22) : 1;
    const mult = (pending.sp && len > 1e-6 ? SPRINT_MULT : 1) * (e.charging ? CHARGE.speedMult : 1);
    const target = st.speed * control * mult;
    const kv = Math.exp(-st.accel * dt);
    pred.vx = dx * target + (pred.vx - dx * target) * kv;
    pred.vz = dz * target + (pred.vz - dz * target) * kv;
    let wantX = pred.vx * NET.interpDelay, wantZ = pred.vz * NET.interpDelay;
    const w = Math.hypot(wantX, wantZ);
    if (w > NET.leadMax) { wantX = wantX / w * NET.leadMax; wantZ = wantZ / w * NET.leadMax; }
    const k = 1 - Math.exp(-dt / NET.leadSmooth);
    pred.offX += (wantX - pred.offX) * k; pred.offZ += (wantZ - pred.offZ) * k;
    e.pos.x += pred.offX; e.pos.z += pred.offZ;
  }

  const client = {
    id: 0, nick: '', lobby: null, rtt: 0, pending,
    connect, get connected() { return connected; },
    disconnect() { wantReconnect = false; if (ws) ws.close(); ws = null; world.replicated = false; },
    create(settings) { send({ t: C2S.CREATE, ...settings }); },
    join(code) { send({ t: C2S.JOIN, code }); },
    settings(s) { send({ t: C2S.SETTINGS, ...s }); },
    team(team) { send({ t: C2S.TEAM, team }); },
    move(m) { send({ t: C2S.MOVE, ...m }); },
    start() { send({ t: C2S.START }); },
    leave() { send({ t: C2S.LEAVE }); client.lobby = null; world.replicated = false; remember(null); },
    /** Sayfa yenilendiyse ya da yeniden açıldıysa: son odanın kodu (geri bağlanma için). */
    rememberedRoom() { try { return sessionStorage.getItem('cm.room'); } catch { return null; } },
    forgetRoom() { remember(null); },
    cmd(obj) { send({ t: C2S.CMD, ...obj }); },
    update, clearWorld,
  };
  return client;
}
