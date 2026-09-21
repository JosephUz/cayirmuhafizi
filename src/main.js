import * as T from '/vendor/three.module.js';
import { giveOrder, updateUnit } from './ai.js';
import { animateView, applyLevelUp, buildView, createEntity, makeStats, rebuildSwing, removeView, xpNeeded, kitKey } from './characters.js';
import { burst, damageMult, fireArrow, healBubble, heroArrows, reachMult, ring, towerTarget, updateArrows, updateCombat, updateEffects, updateSpins, updateTornadoes } from './combat.js';
import { ALERT, BUILD, BUILDINGS, CAMERA, CAMPS, COMBAT, DIFFICULTY, KIT, ECONOMY, ENEMY, ENEMY_HERO, HALF, HERO_UPGRADE, LEVEL, PHYSICS, POSITIONS, RESPAWN, SOLDIER_TYPES, TOWER, VISION, RALLY, heroConvertCost, respawnDelay } from './config.js';
import { buildStructure, clearResources, createEconomy, createEnemyEconomy, dropLoot, dropXp, heroGather, hitNode, initBandits, initCamps, initResources, pickRadiusOf, updateCamps, updateEconomy, updateEnemyEconomy } from './economy.js';
import { buildEnvironment } from './environment.js';
import { createFog } from './fog.js';
import { updateZones } from './abilities.js';
import { attachInput, clearSelection, createInput, lockPointer, unlockPointer, updateCamera, updatePlayerControl, updateTpsCamera } from './input.js';
import { createMinimap } from './minimap.js';
import { clampBounds, integrate, resolveEntityCollisions, resolveObstacleCollisions } from './physics.js';
import { cancelQueued, enqueue, unitClass, updateProduction } from './production.js';
import { canPlace, collapseStructure, createStructure, placementError, rallyFlag, removeStructure, updateStructureBars, updateStructures } from './structures.js';
import { createUI } from './ui.js';

export async function start(root) {
  const view = root.querySelector('#mg-view');

  const scene = new T.Scene();
  scene.background = new T.Color('#adb777');
  scene.fog = new T.Fog('#adb777', 70, 125);
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  view.insertBefore(renderer.domElement, view.firstChild);
  renderer.domElement.setAttribute('aria-label', 'Ağaçlar, tarlalar ve hayvanlarla çevrili izometrik savaş alanı');
  // İki kamera: izometrik (ortografik) ve omuz üstü (perspektif), V ile geçilir; world.camera etkin olandır.
  const isoCamera = new T.OrthographicCamera(-20, 20, 15, -15, 0.1, 160);
  const tpsCamera = new T.PerspectiveCamera(CAMERA.tps.fov, 1, 0.1, 420);
  let camera = isoCamera;

  scene.add(new T.HemisphereLight('#fff3cf', '#65704a', 2.2));
  const sun = new T.DirectionalLight('#ffe6b0', 2.6);
  sun.position.set(-72, 140, 48); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -HALF - 8, right: HALF + 8, top: HALF + 8, bottom: -HALF - 8, near: 1, far: 420 });
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = 0.06; scene.add(sun);

  const env = buildEnvironment(scene);
  const world = {
    scene, camera, renderer, time: 0, clock: 0, running: false, paused: false, ended: false,
    entities: [], structures: [], towerSpots: env.towerSpots, nodes: env.nodes, lanePoints: env.lanePoints,
    obstacles: env.obstacles, animals: env.animals, bases: env.bases, spots: [], items: [],
    arrows: [], tornadoes: [], spins: [], zones: [], effects: [], eco: createEconomy(), enemyEco: createEnemyEconomy(), input: createInput(), ui: null, player: null, enemyHero: null,
    kills: 0, loadout: null, difficulty: 'normal', tmpVec: new T.Vector3(),
    // Kahraman (moba) / Komutan (aoe) modu; seçim; inşa / toplanma / saldır-yürü modları; serbest kamera hedefi.
    // sel.structure: bilgi kartındaki ana yapı; sel.structures: çift tıkla seçilen aynı türdeki tüm yapılar.
    mode: 'moba', sel: { units: new Set(), structure: null, structures: [] }, placing: null, rallyMode: false, heroMenu: false, camTarget: new T.Vector3(),
    /** Kamera modu: 'iso' izometrik / 'tps' omuz üstü; look: omuz üstü bakış açıları; tpsLook: kameranın izlediği nokta. */
    cam: 'iso', look: { yaw: 0, pitch: CAMERA.tps.pitch }, tpsLook: new T.Vector3(),
    /** Sınıf toplanma yerleri: { foot | archer | cavalry | siege: { x, z, g } }. */
    rally: {},
    fog: null,
  };
  // structures.js'in eski alanı: seçili yapı.
  Object.defineProperty(world, 'selected', { get: () => world.sel.structure, set: v => { world.sel.structure = v; } });
  createStructure(world, 'banner', 'blue', POSITIONS.playerBanner.x, POSITIONS.playerBanner.z, { instant: true });
  createStructure(world, 'banner', 'red', POSITIONS.enemyBanner.x, POSITIONS.enemyBanner.z, { instant: true });
  world.fog = createFog(world);

  // Seçim halkası (yapı), inşa hayaleti, emir işareti.
  const makeSelRing = () => {
    const m = new T.Mesh(new T.RingGeometry(0.86, 1, 56), new T.MeshBasicMaterial({ color: '#ffd12e', transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.visible = false; scene.add(m);
    return m;
  };
  // Toplu seçimde (çift tık) her yapıya bir halka: havuz büyüdükçe yeniden kullanılır.
  const selRings = { list: [makeSelRing()], make: makeSelRing };
  const ghost = new T.Group(); ghost.visible = false; scene.add(ghost);
  const ghostMat = new T.MeshBasicMaterial({ color: '#8fe08f', transparent: true, opacity: 0.5, depthWrite: false });
  const ghostBody = new T.Mesh(new T.CylinderGeometry(1, 1, 2.4, 16), ghostMat); ghostBody.position.y = 1.2; ghost.add(ghostBody);
  const ghostRing = new T.Mesh(new T.RingGeometry(0.86, 1, 48), new T.MeshBasicMaterial({ color: '#8fe08f', transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false }));
  ghostRing.rotation.x = -Math.PI / 2; ghostRing.position.y = 0.05; ghost.add(ghostRing);
  const rangeRing = new T.Mesh(new T.RingGeometry(TOWER.range - 0.12, TOWER.range, 64), new T.MeshBasicMaterial({ color: '#8fe08f', transparent: true, opacity: 0.25, side: T.DoubleSide, depthWrite: false }));
  rangeRing.rotation.x = -Math.PI / 2; rangeRing.position.y = 0.04; ghost.add(rangeRing);
  // İnşa alanı: kahramanın çevresindeki halka (yalnızca yerleştirme sırasında).
  const heroRing = new T.Mesh(new T.RingGeometry(BUILD.heroRadius - 0.18, BUILD.heroRadius, 96), new T.MeshBasicMaterial({ color: '#ffd12e', transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
  heroRing.rotation.x = -Math.PI / 2; heroRing.position.y = 0.045; heroRing.visible = false; scene.add(heroRing);

  world.onDeath = (target, source) => {
    if (target.isPlayer) {
      const loss = Math.floor(world.eco.gold * ECONOMY.deathGoldLoss);
      world.eco.gold -= loss;
      // Her ölüm bir sonrakini geciktirir: ölüm sayısı arttıkça bekleme uzar (en çok RESPAWN.max).
      target.deaths = (target.deaths || 0) + 1;
      const wait = respawnDelay(target.deaths);
      world.ui.cancelModes();
      world.ui.say(world.structures[0].alive
        ? `Düştün! ${loss} altın kaybettin. ${target.deaths}. ölüm: ${wait} sn sonra sancakta doğarsın${wait >= RESPAWN.max ? ' (en uzun bekleme)' : ' · her ölümde bekleme uzar'}.`
        : 'Düştün!', 4000);
      return;
    }
    // Ölen asker çevreye yiyecek bırakır (her iki taraf); yalnızca kahramanlar toplar.
    if (!target.isHero && !target.isWorker) dropLoot(world, 'food', target.pos.x, target.pos.z, ECONOMY.loot.soldierFood);
    if (target.faction === 'red') {
      world.kills++;
      if (target.isHero) {
        target.deaths = (target.deaths || 0) + 1;
        const wait = respawnDelay(target.deaths, ENEMY_HERO.respawn);
        world.ui.say(world.structures[1].alive ? `Rakip kahraman düştü! ${target.deaths}. ölümü: ${wait} sn sonra sancağında doğar.` : 'Rakip kahraman düştü!', 3000);
      }
      if (source && source.isPlayer) { world.eco.gold += ENEMY.bounty; world.ui.flash('gold'); }
    }
    // Ölen her birim yere bir exp küresi bırakır: kim toplarsa tecrübeyi o kahraman kazanır.
    dropXp(world, target.pos.x, target.pos.z, xpFor(target));
    if (source && (source.isPlayer || source.isHero) && target.faction !== source.faction) source.heroKills++;
  };
  /**
   * Kendi sancağın ya da kulen saldırı aldı: ekran kenarları kızarır, vurulan yerde kırmızı halka belirir ve
   * minimapte genişleyen halka çıkar. ALERT.cooldown süresince aynı yapı için tekrarlanmaz.
   */
  world.alerts = [];
  world.onOwnStructureHit = (s, source) => {
    if (world.clock - (s.alertAt || -99) < ALERT.cooldown) return;
    s.alertAt = world.clock;
    ring(world, s.pos.x, s.pos.z, '#ff4438', ALERT.worldRing, 0.7);
    world.alerts.push({ x: s.pos.x, z: s.pos.z, t: world.clock });
    if (world.alerts.length > 12) world.alerts.shift();
    world.ui.alert(s.kind === 'banner' ? 'Sancağın saldırı altında!' : 'Kulen saldırı altında!');
    void source;
  };
  /** Kahraman bir exp küresi topladı. */
  world.onXpCollected = (hero, amount) => gainXp(world, hero, amount);
  world.onStructureDestroyed = s => {
    collapseStructure(world, s);
    dropLoot(world, 'wood', s.pos.x, s.pos.z, BUILDINGS[s.kind].loot);
    // Yıkılan kule / bina da exp bırakır (kule en değerlisi); kendi yıktığın yapı vermez, yoksa bedava exp olurdu.
    if (!s.demolished && s.kind !== 'banner') dropXp(world, s.pos.x, s.pos.z, s.kind === 'tower' ? LEVEL.xp.tower : s.kind === 'camp' ? LEVEL.xp.camp : LEVEL.xp.building);
    if (s.kind === 'camp') {
      world.ui.say(`Haydut kampı yıkıldı! ${Math.round(CAMPS.respawn / 60)} dakika içinde yeniden kurulur.`, 3000);
      world.ui.update(); return;
    }
    if (s.kind !== 'banner') {
      const label = BUILDINGS[s.kind].label;
      world.ui.say(s.faction === 'red' ? `Düşman ${label.toLowerCase()} yapısı yıkıldı!` : `${label} yıkıldı!`, 2500);
      world.ui.update(); return;
    }
    s.g.rotation.z = 1.05;
    if (s.faction === 'red') {
      world.ended = true;
      world.ui.showEnd('Zafer!', `Düşman sancağı yıkıldı. ${world.kills} düşman yenildi, ${world.eco.soldiersSpawned} birim basıldı, kahraman seviye ${world.player.level}.`);
    } else {
      world.ended = true;
      world.ui.showEnd('Sancak düştü', 'Düşman sancağını ele geçirdi. Yeni oyunda daha erken kule dik, asker bas ve kampı savun.');
    }
    world.ui.update();
  };
  /** İşçi birleşti: hedefin kademesi arttı, gelen işçi sahneden kalkar. */
  world.onWorkerMerged = (target, source) => {
    const blue = target.faction === 'blue', color = blue ? '#9fd6ff' : '#ffb59f';
    burst(world, target.pos.x, 1.2, target.pos.z, color, 10, 0.1);
    ring(world, target.pos.x, target.pos.z, color, 1.8, 0.45);
    if (blue) {
      const label = target.workerKind === 'wood' ? 'Oduncu' : target.workerKind === 'gold' ? 'Madenci' : 'Çiftçi';
      world.ui.say(`${label} güçlendi: x${target.tier} üretim`, 1600);
      world.ui.ping('worker');
    }
    void source;
    world.ui.update();
  };
  world.onNodeHit = (node, attacker) => {
    if (!hitNode(world, node, attacker)) return;
    world.ui.ping('worker');
    if (node.animal) node.animal.startle = 0.8; // koyun ürker, ölmez
  };

  globalThis.__meadow = world;
  world.simulate = seconds => { const n = Math.ceil(seconds / 0.05); for (let i = 0; i < n; i++) step(world, 0.05); };

  world.ui = createUI(root, world, {
    newGame: (loadout, difficulty) => resetWorld(world, loadout, true, difficulty),
    enqueue: (key, building) => enqueue(world, building, key, 'blue'),
    cancelQueued: (building, i) => cancelQueued(world, building, i, 'blue'),
    build: (kind, x, z) => buildStructure(world, kind, 'blue', x, z),
    demolish: s => demolishStructure(world, s),
    setRally: (cls, x, z) => setRallyPoint(world, cls, x, z),
    setMode: mode => setMode(world, mode),
    heroConvert: key => heroConvert(world, key),
    toggleFullscreen: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => world.ui.say('Tarayıcı tam ekrana izin vermedi (F11 dene)', 2500)); },
    toggleCamera: () => world.toggleCamera(),
  });
  /**
   * Kamera modu: 'iso' izometrik (nişan fare imleci) / 'tps' omuz üstü (fare kilidiyle bakış, nişan ekran ortası).
   * Geçişte sis düzlemi de yer değiştirir (izometrikte kamera açısına göre kaydırılmış yüksekte durur, perspektifte zemine iner).
   */
  const setCameraMode = mode => {
    if (mode === world.cam) return;
    world.cam = mode;
    const tps = mode === 'tps';
    camera = tps ? tpsCamera : isoCamera; world.camera = camera;
    root.classList.toggle('tps', tps);
    world.fog.setPerspective(tps);
    // Perspektifte ufuk pusa gömülür: uzaktaki ağaçlar ve sis düzleminin kenarı arka plan rengine karışır.
    scene.fog.near = tps ? CAMERA.tps.fogNear : 70; scene.fog.far = tps ? CAMERA.tps.viewDist : 125;
    if (tps) {
      const p = world.player;
      world.look.yaw = p.facing; world.look.pitch = CAMERA.tps.pitch;
      world.input.lookDX = world.input.lookDY = 0;
      updateTpsCamera(world, tpsCamera, 0);
      lockPointer(renderer.domElement);
      world.ui.say('Omuz üstü kamera: fare bakışı döndürür, WASD kameraya göre, sol tık artıya vurur · Orta tuş fareyi serbest bırakır / yeniden kilitler · V izometriğe döner', 4500);
    } else {
      unlockPointer();
      world.ui.say('İzometrik kamera', 1200);
    }
    world.ui.update();
  };
  world.toggleCamera = () => setCameraMode(world.cam === 'tps' ? 'iso' : 'tps');
  attachInput(world, renderer.domElement, camera, root.querySelector('#mg-dragbox'));
  initResources(world);
  const minimap = createMinimap(root.querySelector('#mg-minimap'), world, world.fog, {
    viewCorners: () => world.viewCorners(),
    onLeft: (x, z) => { if (world.mode === 'aoe') world.camTarget.set(x, 0, z); else world.ui.say('Kamera kahramanı izler', 1200); },
    onRight: () => {},
  });

  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    isoCamera.left = -17 * w / h; isoCamera.right = 17 * w / h; isoCamera.top = 17; isoCamera.bottom = -17;
    isoCamera.updateProjectionMatrix();
    tpsCamera.aspect = w / h; tpsCamera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  new ResizeObserver(resize).observe(view); resize();

  resetWorld(world, { ...HERO_UPGRADE.startLoadout }, false, 'normal');
  world.ui.showSelect(false);
  world.ui.say('Karakterini seç ve savaşı başlat', 0);

  const look = new T.Vector3().copy(world.player.pos);
  let prev = 0, mapTick = 0;
  renderer.setAnimationLoop(ms => {
    const dt = Math.min((ms - prev) / 1000 || 0.016, 0.1); prev = ms;
    world.clock += dt;
    const active = world.running && !world.paused && !world.ended;
    if (active) step(world, dt);
    else if (world.ended) { updateEffects(world, dt); updateLifecycle(world, dt); }
    if (world.mode === 'aoe' && !world.paused) updateCamera(world, dt);

    const animDt = world.paused ? 0 : dt;
    const fog = world.fog;
    // Görünürlük: izometrikte savaş sisi ızgarası; omuz üstünde sis düzlemi yok, kahramana uzaklık (görüş mesafesi) belirler.
    const hero = world.player, vd2 = CAMERA.tps.viewDist * CAMERA.tps.viewDist;
    const sees = world.cam === 'tps'
      ? (x, z) => (x - hero.pos.x) ** 2 + (z - hero.pos.z) ** 2 <= vd2
      : (x, z) => fog.isVisible(x, z);
    for (const e of world.entities) {
      animateView(e, animDt, camera.quaternion);
      const v = e.view; if (!v) continue;
      v.sel.visible = world.sel.units.has(e);
      if (e.faction !== 'blue' && !sees(e.pos.x, e.pos.z)) { v.g.visible = false; if (v.hpBar) v.hpBar.visible = false; }
    }
    for (const s of world.structures) if (s.faction !== 'blue' && !s.seen && sees(s.pos.x, s.pos.z)) { s.seen = true; s.g.visible = true; }
    updateStructureBars(world, camera.quaternion);
    world.ui.updateCampLabels();
    animateScenery(world, env, animDt);
    updateMarkers(world, selRings, ghost, ghostMat, ghostRing, rangeRing, heroRing);

    if (world.cam === 'tps') {
      // Omuz üstü: kamera kahramanın arkasında, nişan bir sonraki karenin girdisi için ekran ortasından hesaplanır.
      world.camTarget.copy(world.player.pos); look.copy(world.player.pos);
      updateTpsCamera(world, tpsCamera, animDt);
    } else {
      if (world.mode === 'aoe') look.lerp(world.camTarget, 1 - Math.exp(-dt * 8));
      else { world.camTarget.copy(world.player.pos); look.lerp(world.player.pos, 1 - Math.exp(-dt * 5)); }
      camera.position.set(look.x + 24, 29, look.z + 24);
      camera.lookAt(look.x, 0, look.z);
    }
    renderer.render(scene, camera);
    if ((mapTick++ & 1) === 0) minimap.draw();
  });
}

/**
 * Seçili kendi yapını yıkma (sancak hariç): yapı yıkılır, yerine yenisi dikilebilir ve enkazdan odun düşer
 * (yıkılan yapıyla aynı yol). Sınır dolduğunda yer açmanın yolu budur.
 */
function demolishStructure(world, s) {
  if (!s || !s.alive) return 'Yapı yok';
  if (s.faction !== 'blue') return 'Yalnızca kendi yapını yıkabilirsin';
  if (s.kind === 'banner') return 'Sancak yıkılamaz';
  const label = BUILDINGS[s.kind].label;
  s.demolished = true;
  world.onStructureDestroyed(s, null);
  world.ui.say(`${label} yıkıldı · yerine yenisini dikebilirsin`, 2200);
  return null;
}

/** Kahraman / komutan modu geçişi. Komutan modunda kahraman da bir asker gibi emir alır. */
function setMode(world, mode) {
  world.mode = mode;
  const p = world.player;
  if (mode === 'aoe') {
    world.camTarget.copy(p.pos);
    p.brain.order = null; p.brain.target = null; p.brain.home = { x: p.pos.x, z: p.pos.z };
  } else {
    p.brain.order = null; p.moveDir.set(0, 0, 0);
    world.sel.units.clear();
  }
  // Mod değişince ordunun emirleri sıfırlanır: kahraman modunda görünen düşmana saldırır, komutan modunda yerini tutar.
  for (const e of world.entities) if (e.alive && e.faction === 'blue' && !e.isPlayer && !e.isWorker && e.brain) { e.brain.order = null; e.brain.target = null; e.brain.retarget = 0; e.brain.home = { x: e.pos.x, z: e.pos.z }; }
  world.input.keys.clear();
}

/** Sabit adımlı simülasyon: kontrol -> yapay zekâ -> fizik -> savaş -> yaşam döngüsü. */
const aliveList = [];
function step(world, dt) {
  const steps = Math.min(Math.ceil(dt / PHYSICS.fixedStep), PHYSICS.maxSteps);
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    world.time += h;
    updatePlayerControl(world, h);
    for (const e of world.entities) if (e.brain) updateUnit(world, e, h);
    integrate(world.entities, h);
    aliveList.length = 0;
    for (const e of world.entities) if (e.alive) aliveList.push(e);
    resolveEntityCollisions(aliveList);
    resolveObstacleCollisions(aliveList, world.obstacles);
    clampBounds(world.entities);
    updateCombat(world, h);
    updateTowers(world, h);
    updateArrows(world, h);
    updateTornadoes(world, h);
    updateSpins(world, h);
    updateZones(world, h);
    updateLifecycle(world, h);
  }
  updateEffects(world, dt);
  updateStructures(world, dt);
  updateProduction(world, dt);
  world.fog.update(dt);
  checkVictory(world);
  updateCamps(world, dt);
  updateHeroRegen(world, dt);
  updateEconomy(world, dt);
  updateEnemyEconomy(world, dt);
  world.ui.update();
}

/** Seçim halkası seçili yapıda; inşa hayaleti imleçte, yer uygunsa yeşil, değilse kırmızı. */
function updateMarkers(world, selRings, ghost, ghostMat, ghostRing, rangeRing, heroRing) {
  // Seçili yapıların hepsi halkalanır (çift tıkla tür seçimi birden çok bina seçer).
  const list = (world.sel.structures || []).filter(s => s && s.alive);
  if (!list.length && world.sel.structure && world.sel.structure.alive) list.push(world.sel.structure);
  const opacity = 0.55 + Math.sin(world.clock * 5) * 0.25;
  for (let i = 0; i < Math.max(list.length, selRings.list.length); i++) {
    if (i >= selRings.list.length) selRings.list.push(selRings.make());
    const ringMesh = selRings.list[i], s = list[i];
    ringMesh.visible = Boolean(s);
    if (!s) continue;
    ringMesh.position.x = s.pos.x; ringMesh.position.z = s.pos.z;
    const r = s.radius + 1; ringMesh.scale.set(r, r, 1); ringMesh.material.opacity = opacity;
  }
  const kind = world.placing, p = world.player;
  heroRing.visible = Boolean(kind && p.alive);
  if (heroRing.visible) { heroRing.position.x = p.pos.x; heroRing.position.z = p.pos.z; }
  ghost.visible = Boolean(kind && world.input.hasAim && world.input.pointer.inside);
  if (!ghost.visible) return;
  const spec = BUILDINGS[kind], a = world.input.aim;
  ghost.position.set(a.x, 0, a.z);
  ghost.children[0].scale.set(spec.radius, 1, spec.radius); ghostRing.scale.set(spec.radius + 0.6, spec.radius + 0.6, 1);
  rangeRing.visible = kind === 'tower';
  const nearHero = p.alive && Math.hypot(a.x - p.pos.x, a.z - p.pos.z) <= BUILD.heroRadius;
  const ok = nearHero && !canPlace(world, a.x, a.z, spec.radius, 'blue') && !placementError(world, kind, a.x, a.z, 'blue');
  const c = ok ? '#8fe08f' : '#ff7a6a';
  ghostMat.color.set(c); ghostRing.material.color.set(c); rangeRing.material.color.set(c);
}

// Seviye altınla alınmaz: kahraman öldürdüğü düşmanlardan exp kazanıp kendiliğinden atlar (bkz. gainXp).

/**
 * Sınıf toplanma yeri: bayrağı diker, o sınıftaki tüm mavi askerleri oraya yürütür; 'all' tüm sınıfları aynı noktaya alır.
 * Kahraman hiçbir zaman toplanma alanına gitmez (komutan modunda da yerini tutar). Yürütülen asker sayısını döner.
 */
function setRallyPoint(world, cls, x, z) {
  const classes = cls === 'all' ? RALLY.classes : RALLY.classes.filter(c => c.key === cls);
  let n = 0;
  for (const c of classes) {
    const old = world.rally[c.key]; if (old) world.scene.remove(old.g);
    world.rally[c.key] = { x, z, g: rallyFlag(world, x, z, cls === 'all' ? RALLY.allColor : c.color) };
    const units = world.entities.filter(e => e.alive && e.faction === 'blue' && !e.isWorker && !e.isHero && !e.isPlayer && unitClass(e) === c.key);
    n += giveOrder(world, units, { kind: 'move', x, z });
  }
  ring(world, x, z, '#ffd12e', 3, 0.7);
  return n;
}

/**
 * Can yenilenmesi: kahraman **kendi sancağının alanında** (sancak çemberi, BUILD.bannerRadius) durdukça saniyede
 * HERO_UPGRADE.regenPerSecond can kazanır. Başka hiçbir yol iyileştirmez (altın yok, yiyecek yok, seviye yok).
 * Aynı kural rakip kahraman için kendi sancağında geçerlidir.
 */
function updateHeroRegen(world, dt) {
  for (const [hero, banner] of [[world.player, world.structures[0]], [world.enemyHero, world.structures[1]]]) {
    if (!hero || !hero.alive || !banner || !banner.alive) continue;
    if (hero.hp >= hero.stats.maxHp) continue;
    if (Math.hypot(hero.pos.x - banner.pos.x, hero.pos.z - banner.pos.z) > BUILD.bannerRadius) continue;
    hero.hp = Math.min(hero.stats.maxHp, hero.hp + HERO_UPGRADE.regenPerSecond * dt);
    // Görsel: iyileşirken tepesinden can baloncukları çıkar, canı dolunca tek halka.
    hero.healFx = (hero.healFx || 0) - dt;
    if (hero.healFx <= 0) {
      hero.healFx = HERO_UPGRADE.bubbleEvery;
      healBubble(world, hero.pos.x, 2.1 + hero.jumpY + (hero.view && hero.view.mounted ? 0.9 : 0), hero.pos.z);
    }
    if (hero.isPlayer && hero.hp >= hero.stats.maxHp) { ring(world, hero.pos.x, hero.pos.z, '#8fe08f', 3, 0.6); world.ui.say('Can doldu (sancak alanı)', 1500); world.ui.flash('health'); }
  }
}

/** Sancakta altınla başka bir asker türüne dönüşme: donanım ve görünüm değişir, seviye 1'e döner. */
function heroConvert(world, key) {
  const p = world.player, b = world.structures[0], t = SOLDIER_TYPES.find(x => x.key === key && !x.worker && !x.siege);
  if (!t) return 'Bilinmeyen tür';
  if (!p.alive) return 'Kahraman yerde';
  if (Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) > HERO_UPGRADE.range) return 'Kahraman sancağa yaklaşmalı';
  if (p.loadout.weapon === t.weapon && p.loadout.shield === t.shield && p.loadout.horse === t.horse) return `Zaten ${t.label}sın`;
  const cost = heroConvertCost(t);
  if (world.eco.gold < cost) return `Yetersiz altın: ${t.label} ${cost} altın`;
  world.eco.gold -= cost; world.ui.flash('gold');
  const ratio = p.hp / p.stats.maxHp;
  p.loadout = { weapon: t.weapon, shield: t.shield, horse: t.horse };
  p.stats = makeStats(p.loadout, true);
  p.radius = p.stats.radius; p.invMass = p.stats.invMass;
  // Seviye ve exp korunur: yeni türün taban canına seviyelerin can artışı yeniden eklenir.
  p.stats.maxHp += LEVEL.hpPerLevel * (p.level - 1);
  p.hp = Math.max(1, Math.round(p.stats.maxHp * ratio));
  p.attackTimer = 0; p.cooldown = 0; p.blocking = false; p.aimLocked = false;
  removeView(p); buildView(world.scene, p);
  rebuildSwing(p);
  world.loadout = p.loadout;
  ring(world, p.pos.x, p.pos.z, '#ffd12e', 3.5, 0.8); burst(world, p.pos.x, 1.6, p.pos.z, '#ffd12e', 16, 0.13);
  const kit = KIT[kitKey(p.loadout)] || KIT.sword;
  world.ui.say(`Artık ${t.label}sın · seviye ${p.level} korundu. Sol tık: ${kit.primary}, sağ tık: atılma + ${kit.secondary}.`, 3000);
  world.ui.flash('level');
  return null;
}

/** Öldürülen birimin verdiği exp: rakip kahraman > mancınık > asker > işçi. */
function xpFor(target) {
  if (target.isBeast) return LEVEL.xp.beast;
  // Kahraman: seviyesi arttıkça ölümü daha büyük ödül olur (sv 1: 120, sv 5: 220, sv 10: 345 exp).
  if (target.isPlayer || target.isHero) return LEVEL.xp.hero + LEVEL.xpHeroPerLevel * ((target.level || 1) - 1);
  if (target.isWorker) return LEVEL.xp.worker;
  if (target.isSiege) return LEVEL.xp.siege;
  // Atlı birlikler pahalı ve güçlüdür: düşürmek yaya askerin iki katından çok exp verir.
  if (target.loadout && target.loadout.horse) return LEVEL.xp.cavalry;
  return LEVEL.xp.soldier;
}
/**
 * Toplanan exp küresini işler: yeter sayıya ulaştıkça (birden çok kez olabilir) seviye atlatır; artan exp sonrakine kalır.
 * Oyuncuda mesaj ve efekt çıkar, rakip kahramanda yalnızca küçük bir halka.
 */
function gainXp(world, e, amount) {
  if (!(amount > 0)) return;
  e.xp = (e.xp || 0) + amount;
  while (e.xp >= xpNeeded(e.level)) {
    e.xp -= xpNeeded(e.level);
    if (e.isPlayer) levelUp(world, e);
    else { applyLevelUp(e); ring(world, e.pos.x, e.pos.z, '#ffb59f', 3, 0.6); }
  }
  if (e.isPlayer) world.ui.update();
}

function levelUp(world, p) {
  applyLevelUp(p);
  ring(world, p.pos.x, p.pos.z, '#ffd12e', 3, 0.7);
  burst(world, p.pos.x, 1.6, p.pos.z, '#ffd12e', 12, 0.12);
  const extra = p.stats.weapon.ranged ? `ok sayısı ${heroArrows(p)}` : `vuruş alanı x${reachMult(p).toFixed(2)}`;
  const dmg = Math.round(p.stats.weapon.damage * damageMult(p));
  world.ui.say(`Seviye ${p.level}! Can ${p.stats.maxHp}, vuruş ${dmg} (x${damageMult(p).toFixed(2)}), ${extra} · sonraki seviye ${xpNeeded(p.level)} exp.`, 3000);
  world.ui.flash('level');
}

/** Kuleler: menzildeki en yakın düşmana takipli ok atar. */
function updateTowers(world, dt) {
  for (const t of world.structures) {
    if (t.kind !== 'tower' || !t.alive || !t.ready) continue;
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const sh = t.shooter; sh.facing = 0;
    const target = towerTarget(world, sh, TOWER.range);
    if (!target) continue;
    t.cooldown = TOWER.cooldown;
    const dir = world.tmpVec.set(target.pos.x - t.pos.x, 0, target.pos.z - t.pos.z).normalize();
    fireArrow(world, sh, dir, target);
    t.flag.rotation.y += 0.6;
  }
}

function checkVictory(world) {
  if (world.ended || world.structures[1].alive) return;
  if (world.entities.some(e => e.faction === 'red' && e.alive)) return;
  world.ended = true;
  world.ui.showEnd('Zafer!', `Düşman sancağı yıkıldı ve son düşman da düştü. ${world.kills} düşman yenildi, ${world.eco.soldiersSpawned} birim basıldı.`);
  world.ui.update();
}

function updateLifecycle(world, dt) {
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i];
    // Birleşen işçi: ölmez, sessizce sahneden kalkar.
    if (e.merged) { removeView(e); world.entities.splice(i, 1); continue; }
    if (e.alive) continue;
    e.deathTimer += dt;
    if (e.isPlayer) {
      if (e.deathTimer >= respawnDelay(e.deaths) && world.structures[0].alive && !world.ended) respawnPlayer(world);
      continue;
    }
    if (e.isHero) {
      if (e.deathTimer >= respawnDelay(e.deaths, ENEMY_HERO.respawn) && world.structures[1].alive && !world.ended) respawnHero(world);
      else if (!world.structures[1].alive && e.deathTimer > COMBAT.deathDuration + COMBAT.sinkDuration + 0.1) { removeView(e); world.entities.splice(i, 1); }
      continue;
    }
    if (e.deathTimer > COMBAT.deathDuration + COMBAT.sinkDuration + 0.1) { removeView(e); world.entities.splice(i, 1); }
  }
}

function respawnPlayer(world) {
  const p = world.player, b = world.structures[0];
  p.hp = p.stats.maxHp; p.alive = true; p.deathTimer = 0; p.stun = 0; p.hitFlash = 0; p.cooldown = 0; p.attackTimer = 0;
  p.vel.set(0, 0, 0); p.push.set(0, 0, 0); p.moveDir.set(0, 0, 0); p.jumpY = 0; p.vy = 0; p.dodgeTimer = 0; p.invuln = 0;
  p.pos.set(b.pos.x + 2.2, 0, b.pos.z + 1.5); p.facing = Math.PI * 0.75;
  p.brain.order = null; p.brain.home = { x: p.pos.x, z: p.pos.z };
  burst(world, p.pos.x, 1, p.pos.z, '#9fd6ff', 8, 0.1);
  const next = respawnDelay((p.deaths || 0) + 1);
  world.ui.say(`Sancakta yeniden doğdun · sonraki ölümde ${next} sn beklersin`, 1800);
}

/** Rakip kahraman: kırmızı sancakta doğar; kaynak toplar, keşfe çıkar, bina yerine gider, gördüğü düşman birimine saldırır. */
function spawnEnemyHero(world) {
  const b = world.structures[1];
  const e = createEntity({ faction: 'red', loadout: { weapon: 'spear', shield: true, horse: true }, x: b.pos.x - 2.2, z: b.pos.z + 1.5 });
  e.isHero = true; e.work = { spot: null, item: null }; e.vision = VISION.hero;
  e.stats.maxHp = ENEMY_HERO.hp; e.hp = e.stats.maxHp;
  e.stats.speed *= ENEMY_HERO.speedMult;
  e.facing = -Math.PI * 0.25;
  buildView(world.scene, e);
  world.entities.push(e);
  world.enemyHero = e;
  return e;
}

function respawnHero(world) {
  const e = world.enemyHero, b = world.structures[1];
  e.hp = e.stats.maxHp; e.alive = true; e.deathTimer = 0; e.stun = 0; e.hitFlash = 0; e.cooldown = 0; e.attackTimer = 0;
  e.vel.set(0, 0, 0); e.push.set(0, 0, 0); e.moveDir.set(0, 0, 0); e.brain.target = null; e.brain.retarget = 0;
  e.work = { spot: null, item: null }; e.working = false; e.workTimer = 0;
  e.pos.set(b.pos.x - 2.2, 0, b.pos.z + 1.5);
  burst(world, e.pos.x, 1, e.pos.z, '#ffb59f', 8, 0.1);
}

/** Dünyayı sıfırlar: sancaklar tazelenir, hat kuleleri ve her tarafa bir kışla kurulur, sis temizlenir. */
function resetWorld(world, loadout, run, difficulty = world.difficulty) {
  for (const e of world.entities) removeView(e);
  world.entities.length = 0;
  world.alerts.length = 0;
  for (const a of world.arrows) world.scene.remove(a.g); world.arrows.length = 0;
  for (const f of world.effects) world.scene.remove(f.m); world.effects.length = 0;
  clearResources(world);
  Object.assign(world, { eco: createEconomy(), enemyEco: createEnemyEconomy(), time: 0, kills: 0, paused: false, ended: false, running: run, loadout, difficulty, placing: null, rallyMode: false, heroMenu: false, mode: 'moba' });
  clearSelection(world);
  for (const r of Object.values(world.rally)) world.scene.remove(r.g); world.rally = {};
  world.input.blockToggle = false; world.input.rightDown = false; world.input.keys.clear();
  for (const n of world.nodes) n.hitCd = 0;

  for (let i = world.structures.length - 1; i >= 2; i--) removeStructure(world, world.structures[i]);
  for (const s of world.structures) {
    s.maxHp = BUILDINGS.banner.hp; s.hp = s.maxHp; s.alive = true; s.hitFlash = 0; s.deadTimer = 0; s.queue.length = 0; s.progress = 0;
    s.g.rotation.z = 0; s.g.scale.setScalar(1); s.flag.visible = true; if (s.ring) s.ring.visible = true;
    s.seen = s.faction === 'blue'; s.g.visible = s.seen; s.seenByRed = false;
    if (!world.obstacles.includes(s.obstacle)) world.obstacles.push(s.obstacle);
  }
  for (const t of world.towerSpots) createStructure(world, 'tower', t.faction, t.x, t.z, { instant: true });
  for (const f of ['blue', 'red']) { const p = world.bases[f].at(POSITIONS.base.barracks); createStructure(world, 'barracks', f, p.x, p.z, { instant: true }); }

  const b = world.structures[0];
  const p = createEntity({ faction: 'blue', loadout, isPlayer: true, x: b.pos.x + 2.2, z: b.pos.z + 1.5 });
  p.facing = Math.PI * 0.75; p.vision = VISION.hero;
  // Komutan modunda kahraman da asker gibi yönetilir; kahraman modunda beyin devre dışıdır.
  p.brain = { mode: 'hold', timer: 0, target: null, retarget: 0, home: { x: p.pos.x, z: p.pos.z }, order: null };
  buildView(world.scene, p);
  world.player = p; world.entities.push(p);
  world.camTarget.copy(p.pos);

  const d = DIFFICULTY[difficulty];
  spawnEnemyHero(world);
  // Tarafsız kamplar boş köşelere, haydutlar araziye serpiştirilir.
  initCamps(world);
  initBandits(world);
  world.fog.reset();

  if (run) {
    world.ui.say(`Kılıçlı kahramanla yola çıktın (${d.label}). Soldan bina dik ve toplanma alanı kur; sancağına tıkla: işçi sıraya al, kahramanı geliştir.`, 5000);
  }
  world.ui.update();
}

function animateScenery(world, env, dt) {
  for (const r of Object.values(world.rally)) r.g.children[1].rotation.y = Math.sin(world.clock * 3) * 0.2;
  const t = world.clock;
  for (const a of world.animals) {
    a.g.position.x = a.x + Math.sin(t * 0.12 + a.phase) * 1.5;
    a.g.position.z = a.z + Math.cos(t * 0.12 + a.phase) * 1.5;
    a.g.rotation.y = -t * 0.12 - a.phase + Math.PI / 2;
    // Vurulan koyun ürküp zıplar (ölmez).
    if (a.startle > 0) { a.startle = Math.max(0, a.startle - dt); a.g.position.y = Math.abs(Math.sin(a.startle * 18)) * 0.45 * (a.startle / 0.8); }
    else if (a.g.position.y) a.g.position.y = 0;
  }
  for (const s of world.structures) {
    if (!s.alive || !s.ready) continue;
    if (s.flag && s.kind !== 'tower') { s.flag.rotation.y = Math.sin(t * 3 + s.pos.x) * 0.18; s.flag.scale.x = 1 + Math.sin(t * 5) * 0.04; }
    if (s.spawnTimer > 0) { s.spawnTimer -= dt; const k = 1 - Math.max(0, s.spawnTimer) / 0.5; s.g.scale.setScalar(0.75 + 0.25 * (1 - Math.pow(1 - k, 3))); continue; }
    s.g.scale.setScalar(1 + s.hitFlash * 0.4);
  }
  for (const f of [env.bases.blue.fire, env.bases.red.fire]) { f.scale.y = 0.5 + Math.sin(t * 21) * 0.08 + Math.sin(t * 13) * 0.05; f.position.y = 0.35 + Math.sin(t * 17) * 0.03; }
}
