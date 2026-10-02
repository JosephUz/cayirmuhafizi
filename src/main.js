import * as T from 'three';
import { pickHostile } from './ai.js';
import { animateView, applyUnitShadows, rebuildSwing, setUnitShadows } from './characters.js';
import { BUILD, BUILDINGS, CAMERA, GOSTERI, PERF, QUALITY, TOWER } from './config.js';
import { buildError } from './economy.js';
import { buildEnvironmentView } from './environment.js';
import { createGosteri, gosteriAcik, gosteriKipi } from './gosteri.js';
import { createKahramanGosteri } from './gosteri-kahraman.js';
import { attachInput, attachKeyboardLock, clearSelection, createInput, lockPointer, resolveHeroInput, unlockPointer, updateTpsCamera } from './input.js';
import { createMinimap } from './minimap.js';
import { createNetClient } from './net/client.js';
import { macBasladi, macBitti, macKontrol } from './olcum.js';
import { isApp, onlineEnabled } from './platform.js';
import { createScreens } from './screens.js';
import { enterFullscreen, touchDevice } from './touch.js';
import { createUI } from './ui.js';
import { clearEffects, updateEffects } from './view/effects.js';
import { syncArrowView, syncItemView } from './view/itemview.js';
import { createSceneFx } from './view/scenefx.js';
import { syncStructureView } from './view/structview.js';
import { syncZoneView } from './view/zones.js';
import { enqueueError } from './production.js';
import { knownBy, markKnown } from './structures.js';
import { cmdBuild, cmdCancel, cmdConvert, cmdDemolish, cmdEnqueue, cmdRally, convertError, createWorld, setupGame, step } from './world.js';

/**
 * İstemci uygulaması: sahne, kameralar, arayüz, ekranlar ve iki oyun kipi.
 *  - **Tek başına**: simülasyon (world.js) bu tarayıcıda koşar, görseller fx ile doğrudan sahneye iner.
 *  - **Çevrim içi**: sunucu koşar; istemci (net/client.js) olay ve durum paketleriyle dünyayı kopyalar, aynı görünüm kodu
 *    çizer. Girdi ağa gider, komutlar sunucuda doğrulanır.
 * Her karede: (yerel adım) -> ara değer / sayaçlar -> görünüm eşitleme -> arayüz -> kamera -> çizim.
 * **Dokunmatik** kip (telefon, tablet, Android uygulaması; ?touch ile masaüstünde de): joystick ve düğmeler (touch.js,
 * input.js), alt bant çekmece olur (⚒ açar; yapı seçilince açılır, inşa yeri seçerken kapanır), görüntü hafifler.
 * Çevrim içi kapalıysa (config.js → ONLINE, ör. uygulamada) sunucuya hiç bağlanılmaz; oda düğmeleri "Yakında" yazar.
 * **Gösteri kipi** (yalnız web, `?gosteri=1`; bkz. gosteri.js): menü atlanır, iki tarafı da bot yönetir, arayüz gizlenir,
 * kamera en kalabalık çatışmayı izler; ölçüm olayı gitmez, sunucuya bağlanılmaz. Normal oyun akışı değişmez.
 * `?gosteri=kahraman` (bkz. gosteri-kahraman.js) aynı kipin sahnelenmiş sürümüdür: maç değil, tekrarlanan tek bir
 * gösteri; kamera izometrik değil **3B**'dir (sahne yerleştirir) ve kadraj elemesi / birim sadeleştirmesi sahneden gelir.
 */
export async function start(root) {
  const view = root.querySelector('#mg-view');
  const touch = touchDevice(), networked = onlineEnabled();
  root.classList.toggle('touch', touch);

  const scene = new T.Scene();
  scene.background = new T.Color('#adb777');
  scene.fog = new T.Fog('#adb777', 70, 125);
  // Telefonda kenar yumuşatma (MSAA) kapalı ve piksel oranı 1: çizim tamponu belleği az RAM'li telefonda sekmeyi
  // kapatabiliyordu (yoğun ekranda 1 bile keskin kalır).
  const renderer = new T.WebGLRenderer({ antialias: !touch });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1 : 1.6));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  view.insertBefore(renderer.domElement, view.firstChild);
  renderer.domElement.setAttribute('aria-label', 'Ağaçlar ve tarlalarla çevrili izometrik savaş alanı');
  const isoCamera = new T.OrthographicCamera(-20, 20, 15, -15, 0.1, 160);
  const tpsCamera = new T.PerspectiveCamera(CAMERA.tps.fov, 1, 0.1, 420);
  let camera = isoCamera;

  scene.add(new T.HemisphereLight('#fff3cf', '#65704a', 2.2));
  const SUN = new T.Vector3(-72, 140, 48);
  const sun = new T.DirectionalLight('#ffe6b0', 2.6);
  sun.position.copy(SUN); sun.castShadow = true;
  sun.shadow.mapSize.set(PERF.shadowMapSize, PERF.shadowMapSize);
  sun.shadow.normalBias = 0.06; scene.add(sun); scene.add(sun.target);
  let shadowBox = PERF.shadowBox.iso;
  const fitShadow = () => {
    shadowBox = PERF.shadowBox[world.cam] || PERF.shadowBox.iso;
    Object.assign(sun.shadow.camera, { left: -shadowBox, right: shadowBox, top: shadowBox, bottom: -shadowBox, near: 1, far: 480 });
    sun.shadow.camera.updateProjectionMatrix();
  };
  const lightZ = SUN.clone().normalize(), lightX = new T.Vector3(0, 1, 0).cross(lightZ).normalize(), lightY = lightZ.clone().cross(lightX);
  const shadowCenter = new T.Vector3();
  const followShadow = (x, z) => {
    const texel = (2 * shadowBox) / PERF.shadowMapSize;
    shadowCenter.set(x, 0, z);
    const u = shadowCenter.dot(lightX), v = shadowCenter.dot(lightY);
    shadowCenter.addScaledVector(lightX, Math.round(u / texel) * texel - u).addScaledVector(lightY, Math.round(v / texel) * texel - v);
    sun.target.position.copy(shadowCenter);
    sun.position.copy(shadowCenter).add(SUN);
  };

  /**
   * Grafik kalitesi: geç safhada sahada yüzlerce asker olur ve **gölge geçişi** çizimi ikiye katlar. Seçim
   * Esc menüsünden yapılır, localStorage'da saklanır. Asker gölgesi kapalıyken yapılar ve ağaçlar gölge düşürmeye
   * devam eder, yani sahne yassılaşmaz; en pahalı kısım (yüzlerce kutu) gölge geçişinden çıkar.
   */
  /** Ölçülen kare hızı ve o karede çizilen birim sayısı (Esc menüsündeki ölçüm satırı; app.quality bunları okur). */
  let fps = 0, fpsFrames = 0, fpsSince = 0, drawn = 0;
  // Telefonda gölgesiz başlar (menüden yükseltilebilir).
  let qualityKey = touch ? 'low' : QUALITY.default;
  try { const k = localStorage.getItem('cm.quality'); if (k && QUALITY[k]) qualityKey = k; } catch { /* yok */ }
  let shadowTick = 0;
  function applyQuality(key) {
    qualityKey = QUALITY[key] ? key : QUALITY.default;
    const q = QUALITY[qualityKey];
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.autoUpdate = q.shadows && q.every <= 1;
    if (q.shadows) { sun.shadow.mapSize.set(q.map, q.map); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    sun.castShadow = q.shadows;
    setUnitShadows(q.units);
    for (const e of world.entities) applyUnitShadows(e, q.units);
    renderer.shadowMap.needsUpdate = q.shadows;
    fitShadow();
    // Gösteride kalite sahnenin kendi ayarıdır (bkz. gosteri.kalite): oyuncunun menüden seçtiği kalite bozulmasın.
    if (!gosteri) try { localStorage.setItem('cm.quality', qualityKey); } catch { /* yok */ }
  }

  // Dünya: simülasyon + istemciye özel alanlar.
  const world = createWorld({ scene });
  world.fx = createSceneFx(world);
  Object.assign(world, {
    camera, renderer, clock: 0, input: createInput(), ui: null,
    sel: { units: new Set(), structure: null, structures: [] }, placing: null, heroMenu: false, camTarget: new T.Vector3(),
    cam: 'iso', look: { yaw: 0, pitch: CAMERA.tps.pitch }, tpsLook: new T.Vector3(),
    effects: [], alerts: [], rallyView: null, envView: null, loadout: null, replicated: false, net: null, uiTimer: 0,
    /** Ölüm kamerası: { target, until } — seni öldüren birim / yapı (bkz. view/scenefx.js setKillcam). */
    killcam: null,
  });
  Object.defineProperty(world, 'selected', { get: () => world.sel.structure, set: v => { world.sel.structure = v; } });
  globalThis.__meadow = world;

  // İşaretler: seçim halkaları, inşa hayaleti, kahraman inşa halkası.
  const makeSelRing = () => {
    const m = new T.Mesh(new T.RingGeometry(0.86, 1, 56), new T.MeshBasicMaterial({ color: '#ffd12e', transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.visible = false; scene.add(m);
    return m;
  };
  const selRings = { list: [makeSelRing()], make: makeSelRing };
  const ghost = new T.Group(); ghost.visible = false; scene.add(ghost);
  const ghostMat = new T.MeshBasicMaterial({ color: '#8fe08f', transparent: true, opacity: 0.5, depthWrite: false });
  const ghostBody = new T.Mesh(new T.CylinderGeometry(1, 1, 2.4, 16), ghostMat); ghostBody.position.y = 1.2; ghost.add(ghostBody);
  const ghostRing = new T.Mesh(new T.RingGeometry(0.86, 1, 48), new T.MeshBasicMaterial({ color: '#8fe08f', transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false }));
  ghostRing.rotation.x = -Math.PI / 2; ghostRing.position.y = 0.05; ghost.add(ghostRing);
  const rangeRing = new T.Mesh(new T.RingGeometry(TOWER.range - 0.12, TOWER.range, 64), new T.MeshBasicMaterial({ color: '#8fe08f', transparent: true, opacity: 0.25, side: T.DoubleSide, depthWrite: false }));
  rangeRing.rotation.x = -Math.PI / 2; rangeRing.position.y = 0.04; ghost.add(rangeRing);
  const heroRing = new T.Mesh(new T.RingGeometry(BUILD.heroRadius - 0.18, BUILD.heroRadius, 96), new T.MeshBasicMaterial({ color: '#ffd12e', transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
  heroRing.rotation.x = -Math.PI / 2; heroRing.position.y = 0.045; heroRing.visible = false; scene.add(heroRing);

  // ---- Ağ istemcisi ve ekranlar
  const net = createNetClient(world, {
    onWelcome() {
      screens.setServer(true);
      // Boşta bağlantının karşılaması durum yazısına dokunmaz (örn. "adını yazıp Katıl'a bas" kalsın).
      if (!pendingRoom) return;
      screens.setStatus('');
      const r = pendingRoom; pendingRoom = null;
      // Geri bağlanmada sunucu koltuğu token'dan tanır ve lobiyi / oyunu kendisi yollar; tanımadıysa koda yeniden katılmayı dener.
      if (r.rejoin) { setTimeout(() => { if (!world.replicated && !net.lobby) net.join(r.code); }, 400); return; }
      if (r.create) net.create(r.settings); else net.join(r.code);
    },
    // Oyun sürerken gelen lobi güncellemesi (biri koptu / döndü) ekranı açmaz; yalnızca lobideyken çizilir.
    onLobby(lobby) { if (!world.replicated || !world.running || world.ended) screens.lobby(lobby); },
    onError(msg) { screens.setStatus(msg); },
    onStart(msg, first) { screens.show(null); if (first) macBasladi(); }, // ölçüm: yalnız gerçek başlangıç (geri bağlanma START'ı değil)
    onArena() { arenaReady(); },
    onHero(e) { world.camTarget.copy(e.pos); look.copy(e.pos); },
    onLevel(e) { rebuildSwing(e); },
    onOwnDeath() { world.ui.cancelModes(); },
    onEnd(report) { if (world.replicated && world.running) macBitti(); /* ölçüm: yalnız maçı oynayan için */ world.ui.cancelModes(true); unlockPointer(); screens.end(report, { lobby: () => { screens.show(null); if (net.lobby) screens.lobby(net.lobby); else screens.home(); }, home: () => { leaveGame(); screens.home(); } }); },
    onDisconnect() { screens.setServer(false); screens.setOnline(0); if (world.replicated) screens.netStrip(true); },
    onConnect() { screens.netStrip(false); },
    onOnline(n) { screens.setOnline(n); },
  });
  let pendingRoom = null;

  const online = () => world.replicated && world.net;
  const actions = {
    enqueue: (key, building) => {
      if (!online()) return cmdEnqueue(world, world.me, building, key);
      // Çevrim içi: ücret ve bina denetimi yerelde (anında geri bildirim), emir sunucuda yeniden denetlenir.
      const err = enqueueError(world, world.me, building, key);
      if (!err) net.cmd({ k: 'enqueue', type: key, sid: building.id });
      return err;
    },
    cancelQueued: (building, i) => (online() ? (building && net.cmd({ k: 'cancel', sid: building.id, i }), null) : cmdCancel(world, world.me, building, i)),
    build: (kind, x, z) => { if (!online()) return cmdBuild(world, world.me, kind, x, z); const err = buildError(world, kind, world.me, x, z); if (!err) net.cmd({ k: 'build', kind, x, z }); return err; },
    demolish: s => (online() ? (net.cmd({ k: 'demolish', sid: s.id }), null) : cmdDemolish(world, world.me, s)),
    setRally: (x, z) => {
      const target = pickHostile(world, x, z);
      if (!online()) return cmdRally(world, world.me, x, z, target);
      net.cmd({ k: 'rally', x, z, tid: target ? (target.kind ? 's' : 'e') + target.id : null });
      return { n: 0, target };
    },
    heroConvert: key => { if (!online()) return cmdConvert(world, world.me, key); const err = convertError(world, world.me, key); if (!err) net.cmd({ k: 'convert', type: key }); return err; },
    toggleFullscreen: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); },
    toggleCamera: () => world.toggleCamera(),
    escape: () => screens.escape(),
    toggleHelp: () => screens.toggleHelp(),
  };
  world.ui = createUI(root, world, actions);

  const app = {
    netId: () => net.id,
    startLocal(nick, difficulty, teamSize) { startLocal(nick, difficulty, teamSize); },
    // Bağlantı çoğunlukla açıktır (sayfa açılınca kurulur): önce ad yenilenir, oda isteği WELCOME'da (onWelcome) gider.
    createRoom(nick, settings) { world.net = net; pendingRoom = { create: true, settings }; if (net.connected) net.hello(nick); else net.connect(nick); },
    joinRoom(nick, code) { world.net = net; pendingRoom = { create: false, code }; if (net.connected) net.hello(nick); else net.connect(nick); },
    lobbySettings(s) { net.settings(s); },
    lobbyTeam(team) { net.team(team); },
    lobbyMove(m) { net.move(m); },
    startRoom() { net.start(); },
    leaveRoom() { net.leave(); },
    leaveGame() { leaveGame(); },
    resume() { if (!world.replicated && world.running && world.paused) { world.paused = false; world.ui.update(); } },
    pauseForMenu() { if (!world.replicated && world.running && !world.ended) { world.paused = true; unlockPointer(); world.ui.update(); } },
    toggleSound() { return world.ui.toggleSound(); },
    soundOn() { return world.ui.soundOn; },
    /** Esc menüsündeki grafik düğmesi ve ölçüm satırı: kalite, kare hızı, çizim çağrısı, çizilen birim sayısı. */
    quality() {
      const r = renderer.info.render;
      return { key: qualityKey, label: QUALITY.labels[qualityKey], fps, calls: r.calls, tris: r.triangles, drawn, units: world.entities.length };
    },
    cycleQuality() {
      const i = QUALITY.order.indexOf(qualityKey);
      applyQuality(QUALITY.order[(i + 1) % QUALITY.order.length]);
      return qualityKey;
    },
  };
  const screens = createScreens(root, world, app);

  /** Oyundan çık: yerel oyunu durdur ya da odadan ayrıl; dünya boşaltılır. */
  function leaveGame() {
    if (world.replicated) { net.leave(); net.clearWorld(); world.replicated = false; }
    world.running = false; world.paused = false; world.ended = false; world.net = null;
    clearSelection(world); world.placing = null; world.heroMenu = false;
    unlockPointer();
    world.ui.update();
  }

  /** Tek başına oyun: dünya bu tarayıcıda kurulur ve koşar. */
  function startLocal(nick, difficulty, teamSize) {
    if (world.replicated) { net.leave(); net.clearWorld(); world.replicated = false; }
    world.net = null; world.replicated = false;
    setupGame(world, { teamSize, difficulty, humans: [{ name: nick || 'Sen' }], seed: 1000 + Math.floor(Math.random() * 900000), light: touch });
    world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
    world.onEnd = report => { macBitti(); /* ölçüm: çevrimdışı maç bitti */ world.ui.cancelModes(true); unlockPointer(); screens.end(report, { again: () => { screens.show(null); startLocal(nick, difficulty, teamSize); }, home: () => { leaveGame(); screens.home(); } }); };
    arenaReady();
    world.camTarget.copy(world.player.pos); look.copy(world.player.pos);
    world.ui.update();
    macBasladi(); // ölçüm: çevrimdışı maç başladı
  }

  /** Arena kurulunca (yerel ya da çevrim içi): dekor görünümü, sis, minimap, gölge kutusu, seçimler. */
  function arenaReady() {
    if (world.envView) world.envView.dispose();
    world.envView = buildEnvironmentView(scene, world.env);
    clearEffects(world); world.alerts.length = 0; world.killcam = null;
    if (world.rallyView) { scene.remove(world.rallyView); world.rallyView = null; }
    clearSelection(world); world.placing = null; world.heroMenu = false;
    world.input.blockToggle = false; world.input.rightDown = false; world.input.keys.clear();
    world.fog.reset();
    minimap.rebuild(); fitShadow();
    world.ui.update();
  }

  // ---- Kamera modu
  const setCameraMode = mode => {
    if (mode === world.cam) return;
    world.cam = mode;
    const tps = mode === 'tps';
    camera = tps ? tpsCamera : isoCamera; world.camera = camera;
    root.classList.toggle('tps', tps);
    world.fog.setPerspective(tps);
    fitShadow();
    scene.fog.near = tps ? CAMERA.tps.fogNear : 70; scene.fog.far = tps ? CAMERA.tps.viewDist : 125;
    if (tps) {
      const p = world.player;
      if (p) { world.look.yaw = p.facing; world.look.pitch = CAMERA.tps.pitch; }
      world.input.lookDX = world.input.lookDY = 0;
      updateTpsCamera(world, tpsCamera, 0);
      if (!touch) lockPointer(renderer.domElement);
    } else unlockPointer();
    // Dokunmatikte fare kilidi yok: omuz üstünde bakış hep sağ yarıdaki parmaktır, nişan ortadaki artı.
    if (touch) { world.input.locked = tps; root.classList.toggle('locked', tps); }
    world.ui.update();
  };
  world.toggleCamera = () => { if (world.player) setCameraMode(world.cam === 'tps' ? 'iso' : 'tps'); };
  attachInput(world, renderer.domElement, camera, root.querySelector('#mg-dragbox'), touch ? view : null);
  const minimap = createMinimap(root.querySelector('#mg-minimap'), world, { viewCorners: () => world.viewCorners(), onLeft: () => {}, onRight: () => {} });
  /**
   * Gösteri kipi (yalnız web, arayüzsüz): `?gosteri=1` bot-bot maç (gosteri.js), `?gosteri=kahraman` sahnelenmiş
   * kahraman gösterisi (gosteri-kahraman.js). İkisi de aynı kancaları verir: basla / guncelle / odak.
   */
  const gosteri = !gosteriAcik() ? null
    : gosteriKipi() === 'kahraman' ? createKahramanGosteri(world, { arenaReady, root })
      : createGosteri(world, { arenaReady });
  // 3B gösteride etkin kamera perspektiftir: can çubukları ve dünya işaretleri ona göre döner (bkz. animateView).
  if (gosteri && gosteri.kamera3b) { camera = tpsCamera; world.camera = tpsCamera; }
  attachKeyboardLock();
  // Maç sürerken sekme kapanmak / yenilenmek istenirse tarayıcı sorar: Ctrl basılıyken W'ye basmak (Ctrl+W) pencerede
  // sayfaya gelmeden sekmeyi kapatıyordu. Giriş ekranında, maç bitince, gösteride ve uygulamada sormaz.
  let reloading = false;
  window.addEventListener('beforeunload', e => {
    if (reloading || gosteri || isApp() || !world.running || world.ended) return;
    e.preventDefault(); e.returnValue = '';
  });

  /**
   * Görüntü bağlamı kaybı (telefonda görüntü belleği dolunca tarayıcı WebGL'i düşürür): varsayılan davranış ekranın
   * kararıp donmasıdır. Kayıp kabul edilir (preventDefault) ki tarayıcı bağlamı geri verebilsin; bu sırada tek başına
   * oyun durur ve şerit çıkar. Geri gelince three.js kaynakları yeniden yükler, oyun kaldığı yerden sürer; gelmezse
   * "Yeniden yükle" düğmesi çıkar.
   */
  const glStrip = root.querySelector('#mg-gl'), glReload = glStrip.querySelector('button');
  let glTimer = 0, glPaused = false;
  glReload.onclick = () => { reloading = true; location.reload(); };
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    glPaused = !world.replicated && world.running && !world.paused && !world.ended;
    if (glPaused) world.paused = true;
    glStrip.hidden = false; glReload.hidden = true;
    clearTimeout(glTimer); glTimer = setTimeout(() => { glReload.hidden = false; }, 5000);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    clearTimeout(glTimer); glStrip.hidden = true;
    if (glPaused) { world.paused = false; glPaused = false; }
    applyQuality(qualityKey); world.ui.update();
  });

  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    // Telefonda izometrik kadraj daha yakın: küçük ekranda kahraman ve birimler seçilebilsin. Gösteride biraz yakın açı.
    const half = gosteri ? GOSTERI.kadraj : touch ? 12 : 17;
    isoCamera.left = -half * w / h; isoCamera.right = half * w / h; isoCamera.top = half; isoCamera.bottom = -half;
    isoCamera.updateProjectionMatrix();
    tpsCamera.aspect = w / h; tpsCamera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  new ResizeObserver(resize).observe(view); resize();

  // Boş bir arena: giriş ekranının arkasında çayır görünsün.
  setupGame(world, { teamSize: 1, humans: [{ name: 'Sen' }], run: false });
  world.me = world.players[0]; world.player = world.me.hero; world.loadout = world.player.loadout;
  arenaReady();
  const urlCode = gosteri ? null : screens.urlCode();
  const remembered = !gosteri && networked && net.rememberedRoom();
  if (gosteri) {
    // Gösteri: menü atlanır, sunucuya hiç bağlanılmaz, ölçüm olayı gitmez; maç hemen başlar.
    root.classList.add('gosteri');
    const ad = root.querySelector('#mg-gosteri'); if (ad) ad.hidden = false;
    screens.show(null);
    gosteri.basla();
  } else if (!networked) screens.home('');
  else if (remembered) {
    // Sayfa yenilendi ya da bağlantı koptu: aynı kimlikle sunucuya dönülür; oda sürüyorsa sunucu oyunu / lobiyi yeniden yollar.
    screens.home('Odaya geri bağlanıyor…');
    world.net = net; pendingRoom = { create: false, code: remembered, rejoin: true };
    net.connect(screens.nick());
    setTimeout(() => { if (!world.replicated && !net.lobby) { net.forgetRoom(); if (screens.visible() === screens.els.home) screens.home(''); } }, 4000);
  } else {
    screens.home(urlCode ? 'Odaya katılmak için adını yazıp Katıl’a bas' : '');
    // Boşta bağlantı: giriş ekranındaki "çevrim içi" sayısı için (oda kurulunca / katılınca aynı bağlantı kullanılır).
    net.connect(screens.nick());
  }

  // Android uygulamasında geri tuşu: pencereyi kapat / menüyü aç-kapat (Esc gibi); giriş ekranında uygulamadan çık.
  const nativeApp = isApp() ? window.Capacitor?.registerPlugin?.('App') : null;
  nativeApp?.addListener('backButton', () => {
    if (screens.visible() === screens.els.home) nativeApp.exitApp();
    else if (world.placing) world.ui.cancelModes(true);
    else if (drawer) setDrawer(false);
    else if (!screens.visible() || screens.visible() === screens.els.menu || screens.visible() === screens.els.help) screens.escape();
    else screens.home('');
  });

  /**
   * Dokunmatik çekmece (alt bant): ZIPLA'nın üstündeki ⚒ çekmeceyi açar (inşa yeri seçerken vazgeçer); çekmece açıkken
   * düğmeler gizlenir, sahanın sağ altındaki ✕ kapatır. Üstte 🎥 kamera, ☰ menü. Kendi yapına dokununca çekmece açılır;
   * inşa yeri seçerken kapanır ki saha görünsün.
   */
  let drawer = false, lastSel = null, lastPlacing = null, wasPlaying = false;
  const tbar = root.querySelector('#mg-tbar'), drawerClose = root.querySelector('#mg-drawer-close'), placeTap = root.querySelector('#mg-place-tap');
  const setDrawer = on => { drawer = on; root.classList.toggle('drawer', on); };
  if (touch) {
    world.touchBuild = () => { if (world.placing) world.ui.cancelModes(true); else setDrawer(!drawer); };
    drawerClose.onclick = () => setDrawer(false);
    tbar.querySelector('[data-tb=cam]').onclick = () => world.toggleCamera();
    tbar.querySelector('[data-tb=menu]').onclick = () => screens.escape();
  }
  function touchFrame() {
    const playing = world.running && !world.ended && !world.paused && !screens.visible();
    if (playing && !wasPlaying) enterFullscreen();
    wasPlaying = playing;
    world.input.touch.show(playing);
    tbar.hidden = !playing; drawerClose.hidden = !playing;
    const sel = world.sel.structure;
    if (sel && sel !== lastSel) setDrawer(true);
    if (world.placing && world.placing !== lastPlacing) { setDrawer(false); world.ui.hint('Yeri seçmek için sahaya dokun · ⚒ vazgeç', 4); }
    lastSel = sel; lastPlacing = world.placing;
    root.classList.toggle('placing-touch', !!world.placing);
    // İnşa: hayalet sahaya konunca (ilk dokunuş) tepesinde zıplayan ⚒: "aynı yere bir daha dokun, dikilsin".
    // Yer uygun değilse (kırmızı hayalet) gösterilmez: ikinci dokunuş dikmez, sebebi ipucu yazısında.
    const a = world.input.aim, ghostUp = playing && world.placing && world.input.hasAim && world.input.pointer.inside && !world.placeError;
    const sp = ghostUp ? world.toScreen({ x: a.x, y: BUILDINGS[world.placing].radius + 3.2, z: a.z }) : null;
    placeTap.hidden = !sp;
    if (sp) placeTap.style.transform = `translate(${sp.x}px,${sp.y}px)`;
  }

  const look = new T.Vector3().copy(gosteri ? gosteri.odak(0) : world.player.pos);
  let prev = 0, mapTick = 0, prevAlive = true;
  // Sahnenin kendi çizim ayarları (yalnız gösteride): kalite, kadraj elemesi ve birim sadeleştirme uzaklığı.
  // Telefonda sahne de düşük kalitede açılır: kalabalık gösteri gölgelerle telefon tarayıcısını zorlar.
  if (gosteri && gosteri.kalite && !touch) qualityKey = gosteri.kalite;
  const gosteriGorus = gosteri && gosteri.gorus ? gosteri.gorus() : null;
  const lodDist = gosteri && gosteri.lod ? gosteri.lod : PERF.lodDist;
  applyQuality(qualityKey);
  renderer.setAnimationLoop(ms => {
    const dt = Math.min((ms - prev) / 1000 || 0.016, 0.1); prev = ms;
    world.clock += dt;
    fpsFrames++;
    if (ms - fpsSince >= 500) { fps = Math.round((fpsFrames * 1000) / (ms - fpsSince)); fpsFrames = 0; fpsSince = ms; }
    // ölçüm: oyuncu 60 sn oynayınca bir kez "bir_dakika" (bayrak dolunca anında döner); gösteride hiç ölçüm gitmez
    if (world.running && !world.ended && !gosteri) macKontrol();
    const replicated = world.replicated;
    // Gösteri kipi: girdi yok, simülasyon iki kat hızda koşar, maç biterse yenisi başlar (bkz. gosteri.js).
    if (gosteri) gosteri.guncelle(dt);
    else if (!replicated) {
      const active = world.running && !world.paused && !world.ended;
      if (active) { resolveHeroInput(world, world.me.input); step(world, dt); }
      else world.input.attackQueued = world.input.dodgeQueued = world.input.jumpQueued = world.input.attackReleased = false;
    } else {
      if (world.running && !world.ended && world.player) resolveHeroInput(world, net.pending);
      net.update(dt, performance.now());
    }
    const hero = world.player;
    if (hero) { if (prevAlive && !hero.alive) world.ui.cancelModes(); prevAlive = hero.alive; }
    /**
     * Ölüm kamerası: kahraman düştüğünde kamera katilin üstüne gider ve o nesne **sisin içinde olsa da** çizilir.
     * Kahraman dirilince, süre dolunca ya da oyun bitince kendiliğinden kapanır.
     */
    let kc = world.killcam;
    if (kc && (!kc.target || !hero || hero.alive || world.ended || world.clock > kc.until)) { kc = world.killcam = null; }
    updateEffects(world, dt);
    const animDt = world.paused ? 0 : dt;
    const fog = world.fog;
    // Uzaklık ölçümünün merkezi (sadeleştirme ve omuz üstü görüş): normalde kahraman, gösteride kameranın baktığı yer.
    const hx = gosteri ? look.x : hero ? hero.pos.x : 0, hz = gosteri ? look.z : hero ? hero.pos.z : 0;
    const vd2 = CAMERA.tps.viewDist * CAMERA.tps.viewDist;
    const lod2 = lodDist * lodDist;
    let seen = 0;
    // Gösteride sis kapalıdır (fog.enabled = false): kamera nereye giderse gitsin iki tarafın da birlikleri görünür.
    const sees = world.cam === 'tps' && !kc ? (x, z) => (x - hx) ** 2 + (z - hz) ** 2 <= vd2 : (x, z) => fog.isVisible(x, z);
    // 3B gösteride kadraj elemesini sahne verir (izometrik köşe izdüşümü perspektif kamerada işlemez).
    const bounds = gosteriGorus ? (world.inView = gosteriGorus) : updateViewBounds(world, hero);
    // Ölüm kamerasında kadraj kahramanın değil katilin çevresidir: kırpma kapanır, katil her hâlükârda görünür.
    const inView = kc ? always : bounds;
    for (const e of world.entities) {
      const v = e.view; if (!v) continue;
      const shown = (kc && kc.target === e) || (inView(e.pos.x, e.pos.z, 0) && (e.faction === world.side || sees(e.pos.x, e.pos.z)));
      if (!shown) { v.g.visible = false; v.hpBar.visible = false; continue; }
      seen++;
      // Uzaktaki birim sade çizilir (uzuvlar gizli, animasyon yok): kalabalıkta en büyük tasarruf burada.
      const far = (e.pos.x - hx) ** 2 + (e.pos.z - hz) ** 2 > lod2;
      animateView(e, animDt, camera.quaternion, far);
      v.sel.visible = world.sel.units.has(e);
    }
    drawn = seen;
    for (const it of world.items) syncItemView(world, it, animDt, world.clock);
    for (const a of world.arrows) syncArrowView(a);
    for (const z of world.spins) syncZoneView(world, z, animDt);
    for (const z of world.tornadoes) syncZoneView(world, z, animDt);
    for (const z of world.zones) syncZoneView(world, z, animDt);
    for (const s of world.structures) {
      if (!knownBy(s, world.side) && world.cam === 'tps' && sees(s.pos.x, s.pos.z)) markKnown(s, world.side);
      // Ekran dışındaki yapı hiç çizilmez: matris ve kesme denetimi de düşer (yapı başına ~14 mesh). Kule ve sancak
      // halkası ekrana değdiği sürece yapı elenmez: yoksa kule ekran dışındayken halkası kaybolur, ok görünmeyen
      // bir halkanın içinden gelir ("çizginin dışına atıyor" gibi görünür).
      if (!inView(s.pos.x, s.pos.z, s.kind === 'tower' ? TOWER.range : s.kind === 'banner' ? BUILD.bannerRadius : 6)) { if (s.view) { s.view.g.visible = false; if (s.view.bars) s.view.bars.g.visible = false; } continue; }
      syncStructureView(s, animDt, world.clock, camera.quaternion, world.side);
    }
    // Gösteride arayüz yoktur: panel, etiket ve işaret güncellemeleri hiç koşmaz (bkz. style.css `.gosteri`).
    if (!gosteri) {
      world.ui.updateCampLabels();
      world.ui.updateHint();
      world.ui.updateCharge();
      world.ui.updateRespawn();
      if (touch) touchFrame();
    }
    animateScenery(world, animDt);
    if (!gosteri) updateMarkers(world, selRings, ghost, ghostMat, ghostRing, rangeRing, heroRing);
    if (world.running && !gosteri) { world.uiTimer -= dt; if (world.uiTimer <= 0) { world.uiTimer = PERF.uiEvery; world.ui.update(); } }

    // Ölüm kamerası omuz üstünde de izometrik kadrajla çizer: ölüyken bakış kahramanda değil katildedir.
    let frameCam = camera;
    if (world.cam === 'tps' && hero && !kc) {
      world.camTarget.copy(hero.pos); look.copy(hero.pos);
      updateTpsCamera(world, tpsCamera, animDt);
    } else {
      // Gösteride kamera kahramanı değil en kalabalık çatışmayı izler; yumuşatmayı gosteri.js yapar.
      const focus = kc ? kc.target.pos : gosteri ? gosteri.odak(dt) : (hero ? hero.pos : null);
      if (focus) { world.camTarget.copy(focus); if (gosteri) look.copy(focus); else look.lerp(focus, 1 - Math.exp(-dt * 5)); }
      // Sahnelenmiş gösteri (?gosteri=kahraman) izometrik değil 3B bakar: perspektif kamerayı sahnenin kendisi yerleştirir.
      if (!kc && gosteri && gosteri.kamera3b) { gosteri.bakis(dt, tpsCamera, look); frameCam = tpsCamera; }
      else {
        frameCam = isoCamera;
        isoCamera.position.set(look.x + 24, 29, look.z + 24);
        isoCamera.lookAt(look.x, 0, look.z);
      }
    }
    followShadow(look.x, look.z);
    // Gölge haritası: yüksek kalitede her kare, orta / düşükte birkaç karede bir yenilenir (maliyetin yarısı).
    const q = QUALITY[qualityKey];
    if (q.shadows && !renderer.shadowMap.autoUpdate) { if ((shadowTick++ % q.every) === 0) renderer.shadowMap.needsUpdate = true; }
    renderer.render(scene, frameCam);
    if ((mapTick++ & 1) === 0 && !gosteri) minimap.draw();
  });
}

/** Görüş sınırı: izometrikte ekran köşelerinin zemin izdüşümünün kutusu (+ pay), omuz üstünde kahraman çevresi. */
const viewBox = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
const boxView = (x, z, pad = 0) => x >= viewBox.minX - pad && x <= viewBox.maxX + pad && z >= viewBox.minZ - pad && z <= viewBox.maxZ + pad;
const tpsC = { x: 0, z: 0, r: 0 };
const tpsView = (x, z, pad = 0) => (x - tpsC.x) ** 2 + (z - tpsC.z) ** 2 <= (tpsC.r + pad) ** 2;
const always = () => true;
function updateViewBounds(world, hero) {
  const M = PERF.cullMargin;
  if (world.cam === 'tps' && hero) { tpsC.x = hero.pos.x; tpsC.z = hero.pos.z; tpsC.r = CAMERA.tps.viewDist + M; return (world.inView = tpsView); }
  const c = world.viewCorners && world.viewCorners();
  if (!c) return (world.inView = always);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of c) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; }
  viewBox.minX = minX - M; viewBox.maxX = maxX + M; viewBox.minZ = minZ - M; viewBox.maxZ = maxZ + M;
  return (world.inView = boxView);
}

/** Seçim halkası seçili yapıda; inşa hayaleti imleçte, yer uygunsa yeşil, değilse kırmızı. */
function updateMarkers(world, selRings, ghost, ghostMat, ghostRing, rangeRing, heroRing) {
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
  heroRing.visible = Boolean(kind && p && p.alive);
  if (heroRing.visible) { heroRing.position.x = p.pos.x; heroRing.position.z = p.pos.z; }
  ghost.visible = Boolean(kind && p && world.input.hasAim && world.input.pointer.inside);
  if (!ghost.visible) { world.placeError = null; return; }
  const spec = BUILDINGS[kind], a = world.input.aim;
  ghost.position.set(a.x, 0, a.z);
  ghost.children[0].scale.set(spec.radius, 1, spec.radius); ghostRing.scale.set(spec.radius + 0.6, spec.radius + 0.6, 1);
  rangeRing.visible = kind === 'tower';
  // Hayalet kırmızıysa nedeni imlecin yanında yazılır (bkz. ui.updateHint): kaynak, sınır, uzaklık, yol, çakışma, dolu yer.
  world.placeError = buildError(world, kind, world.me, a.x, a.z);
  const c = world.placeError ? '#ff7a6a' : '#8fe08f';
  ghostMat.color.set(c); ghostRing.material.color.set(c); rangeRing.material.color.set(c);
}

function animateScenery(world, dt) {
  const t = world.clock;
  if (world.rallyView) world.rallyView.children[1].rotation.y = Math.sin(t * 3) * 0.2;
  if (world.envView) for (const f of Object.values(world.envView.fires)) { f.scale.y = 0.5 + Math.sin(t * 21) * 0.08 + Math.sin(t * 13) * 0.05; f.position.y = 0.35 + Math.sin(t * 17) * 0.03; }
  void dt;
}
