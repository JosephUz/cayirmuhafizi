import { KIT, TEAMS } from './config.js';
import { kitKey } from './characters.js';
import { normalCode } from './net/protocol.js';
import { paylasti } from './olcum.js';
import { onlineEnabled } from './platform.js';
import { renderReport } from './report.js';

/**
 * Ekranlar (bkz. tasarım): giriş (ad, tek başına, çevrim içi düğmeleri, açık odalar), kurulum (tek başına: kaça kaç,
 * zorluk), lobi (oda kodu, koltuklar, ayarlar), bitiş karnesi, kısayollar penceresi ve Esc menüsü. Oda akışı ve
 * yazıları bütün JosephUz oyunlarında aynıdır (josephuz docs/oda-standardi.md). Ad ve oda kodu linkten (?oda=KOD) ya
 * da tarayıcı belleğinden gelir. Ekran akışı buradan yürür, oyun mantığına `app` kancalarıyla dokunur.
 */
export function createScreens(root, world, app) {
  const $ = s => root.querySelector(s);
  const els = {
    home: $('#mg-home'), setup: $('#mg-setup'), lobby: $('#mg-lobby'), end: $('#mg-end'), help: $('#mg-help'), menu: $('#mg-menu'), net: $('#mg-net'),
    nick: $('#home-nick'), joinRow: $('#home-joinrow'), code: $('#home-code'), homeStatus: $('#home-status'), online: $('#home-online'),
    lobbyCode: $('#lobby-code'), blue: $('#lobby-blue'), red: $('#lobby-red'), lobbyTeams: $('#lobby-teams'), lobbyDiff: $('#lobby-diff'), lobbyStart: $('#lobby-start'), lobbyStatus: $('#lobby-status'), lobbyMode: $('#lobby-mode'),
    lobbyPriv: $('#lobby-priv'), lobbyEyebrow: $('#lobby-eyebrow'),
    endCard: $('#end-card'), helpHero: $('#help-hero'), menuResume: $('#menu-resume'), menuSound: $('#menu-sound'), menuQuality: $('#menu-quality'),
    menuMuzik: $('#menu-muzik'),
    homeSound: $('#home-sound'), homeMuzik: $('#home-muzik'), menuLeave: $('#menu-leave'),
    rooms: $('#home-rooms'), roomsList: $('#home-rooms-list'), roomsN: $('#home-rooms-n'), lobbyVis: $('#lobby-vis'),
  };
  const overlays = [els.home, els.setup, els.lobby, els.end, els.help, els.menu];
  let helpReturn = null;
  const store = (k, v) => { try { if (v == null) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };
  const defaultNick = () => `Muhafız-${Math.floor(1000 + Math.random() * 9000)}`;
  els.nick.value = store('cm.nick') || defaultNick();
  const nick = () => { const v = els.nick.value.trim().slice(0, 16) || defaultNick(); store('cm.nick', v); return v; };

  function show(el) {
    for (const o of overlays) o.hidden = o !== el;
    root.classList.toggle('screen', Boolean(el));
    root.classList.toggle('at-home', el === els.home);
    // Dokunmatikte odak klavyeyi kendiliğinden açar: ad kutusuna yalnız masaüstünde odaklanılır.
    if (el === els.home && !root.classList.contains('touch')) { els.nick.focus(); }
  }
  const visible = () => overlays.find(o => !o.hidden) || null;
  const readRadio = name => { const el = root.querySelector(`input[name=${name}]:checked`); return el ? el.value : null; };
  const homeStatus = t => { els.homeStatus.textContent = t; };

  /**
   * Son tek başına seçimi (kaça kaç, zorluk) `cm.kurulum`da saklanır ve kurulum ekranına geri yüklenir. ODA KUR ve
   * HIZLI KATIL'ın kurduğu oda da bu ayarlarla başlar (oda standardı: "ana ekrandaki tek kişilik seçimler").
   */
  function lastSetup() {
    let s = null; try { s = JSON.parse(store('cm.kurulum') || 'null'); } catch { s = null; }
    const teamSize = Math.max(1, Math.min(TEAMS.sizes[TEAMS.sizes.length - 1], Math.round(Number(s && s.teamSize)) || 1));
    const difficulty = ['easy', 'normal', 'hard'].includes(s && s.difficulty) ? s.difficulty : 'normal';
    return { teamSize, difficulty };
  }
  {
    const s = lastSetup();
    const t = root.querySelector(`input[name=teams][value="${s.teamSize}"]`), d = root.querySelector(`input[name=difficulty][value="${s.difficulty}"]`);
    if (t) t.checked = true; if (d) d.checked = true;
  }

  // ---- Giriş
  $('#home-solo').onclick = () => show(els.setup);
  $('#home-create').onclick = () => { homeStatus('Oda kuruluyor…'); app.createRoom(nick(), lastSetup()); };
  $('#home-quick').onclick = () => { homeStatus('Oda aranıyor…'); app.quickJoin(nick(), lastSetup()); };
  $('#home-join').onclick = () => { els.joinRow.hidden = !els.joinRow.hidden; if (!els.joinRow.hidden) els.code.focus(); };
  const joinGo = () => {
    const code = normalCode(els.code.value);
    if (code.replace('-', '').length < 4) { homeStatus('Oda kodunu yaz'); return; }
    els.code.value = code; homeStatus('Odaya bağlanıyor…'); app.joinRoom(nick(), code);
  };
  $('#home-join-go').onclick = joinGo;
  // Sunucuya bağlanılamadıkça (kapalı ya da config.js → ONLINE ile kapatılmış) üç çevrim içi düğme "YAKINDA" yazar ve
  // basılmaz, açık oda listesi gizlenir; sunucu karşılayınca (main.js → onWelcome) açılır.
  function setServer(up) {
    els.rooms.hidden = !up;
    for (const id of ['#home-quick', '#home-create', '#home-join', '#home-join-go']) {
      const b = $(id), tag = b.querySelector('.soon-tag');
      b.disabled = !up; b.classList.toggle('soon', !up); b.title = up ? '' : 'Çok oyunculu yakında';
      if (id === '#home-join-go') continue;
      if (!up && !tag) b.insertAdjacentHTML('beforeend', '<em class="soon-tag">YAKINDA</em>'); else if (up) tag?.remove();
    }
  }
  setServer(false);
  els.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinGo(); });
  els.nick.addEventListener('keydown', e => { if (e.key === 'Enter') $('#home-solo').click(); });

  // ---- Kurulum (yalnız tek başına)
  $('#setup-start').onclick = () => {
    const teamSize = Number(readRadio('teams') || 1), difficulty = readRadio('difficulty') || 'normal';
    store('cm.kurulum', JSON.stringify({ teamSize, difficulty }));
    show(null); app.startLocal(nick(), difficulty, teamSize);
  };
  $('#setup-back').onclick = () => show(els.home);

  // ---- Lobi
  const lobbyNote = t => { els.lobbyStatus.textContent = t; };
  $('#lobby-copy').onclick = () => {
    const code = els.lobbyCode.textContent, url = `${location.origin}${location.pathname}?oda=${encodeURIComponent(code)}`;
    const done = () => { lobbyNote('Link kopyalandı'); setTimeout(() => { if (els.lobbyStatus.textContent === 'Link kopyalandı') lobbyNote(''); }, 1500); };
    paylasti();
    try { navigator.clipboard.writeText(url).then(done, () => lobbyNote(url)); } catch { lobbyNote(url); }
  };
  els.lobbyTeams.onchange = els.lobbyDiff.onchange = els.lobbyPriv.onchange = () => app.lobbySettings({ teamSize: Number(els.lobbyTeams.value), difficulty: els.lobbyDiff.value, priv: els.lobbyPriv.value === '1' });
  els.lobbyStart.onclick = () => app.startRoom();
  $('#lobby-leave').onclick = () => { app.leaveRoom(); screens.home(''); };

  /**
   * Lobi: iki takımın koltukları. Oyuncular seçtikleri takımın ilk koltuklarına oturur, kalanı bot doldurur. Öbür
   * takımdaki boş koltuğa tıklayan oraya geçer: iki takımda da insan varsa oyun PvP olur. Kuran bir oyuncuyu
   * sürükleyip başka koltuğa bırakır ya da önce oyuncuya, sonra koltuğa tıklar; öbür takımdaki bir oyuncunun
   * üstüne bırakırsa yer değiştirirler.
   */
  const DIFF_AD = { easy: 'Kolay', normal: 'Normal', hard: 'Zor' };
  const summary = s => `${s.teamSize}v${s.teamSize} · ${DIFF_AD[s.difficulty] || ''}`;
  let pick = null; // kuranın tıklayıp seçtiği (taşınacak) oyuncu
  let lastLobby = null;
  function renderLobby(lobby) {
    lastLobby = lobby;
    const isHost = lobby.hostId === app.netId();
    if (!isHost || !lobby.seats.some(s => s.id === pick)) pick = null;
    els.lobbyEyebrow.textContent = `ODA · ${summary(lobby.settings)}`;
    els.lobbyCode.textContent = lobby.code;
    els.lobbyVis.textContent = lobby.priv ? 'ÖZEL ODA · yalnız kodla' : 'AÇIK ODA · listede görünür';
    const n = lobby.settings.teamSize;
    const me = lobby.seats.find(s => s.id === app.netId());
    const teamOf = id => (lobby.seats.find(s => s.id === id) || {}).team || 'blue';
    // Renk sırası oyunla aynı: insanlar lobi sırasıyla TEAMS.humanColors'tan alır (bkz. players.js createPlayers).
    const colorOf = s => TEAMS.humanColors[lobby.seats.indexOf(s) % TEAMS.humanColors.length];
    const tag = t => ` <small>${t}</small>`;
    const human = s => `<li class="${s.online ? '' : 'off'}${s.id === app.netId() ? ' me' : ''}${s.id === pick ? ' picked' : ''}${isHost ? ' movable' : ''}" data-id="${s.id}"${isHost ? ' draggable="true"' : ''}><i class="dot" style="background:${colorOf(s)}"></i><span class="nm">${escapeHtml(s.nick)}</span>${s.id === lobby.hostId ? tag('kuran') : ''}${s.id === app.netId() ? tag('sen') : ''}${s.online ? '' : tag('koptu')}</li>`;
    const list = team => {
      const people = lobby.seats.filter(s => (s.team || 'blue') === team);
      // Boş koltuk tıklanabilir: kuranın seçtiği oyuncu öbür takımdaysa onu buraya taşır, yoksa tıklayan kendisi geçer.
      const canSit = pick != null ? teamOf(pick) !== team : me && (me.team || 'blue') !== team;
      const bot = () => `<li class="bot${canSit ? ' join' : ''}" data-team="${team}" data-slot="bot"><i class="dot ${team === 'red' ? 'red' : 'bot'}"></i><span class="seat-bot">Bot · boş koltuk</span>${canSit ? '<span class="seat-sit">Buraya otur</span>' : ''}</li>`;
      return Array.from({ length: n }, (_, i) => (people[i] ? human(people[i]) : bot())).join('');
    };
    els.blue.innerHTML = list('blue');
    els.red.innerHTML = list('red');
    for (const li of els.lobby.querySelectorAll('li.join')) {
      li.onclick = () => {
        if (pick != null) { const id = pick; pick = null; app.lobbyMove({ id, team: li.dataset.team }); lobbyNote(''); }
        else app.lobbyTeam(li.dataset.team);
      };
    }
    if (isHost) {
      for (const li of els.lobby.querySelectorAll('li[data-id]')) {
        li.onclick = () => {
          const id = Number(li.dataset.id);
          if (pick == null || pick === id) { pick = pick === id ? null : id; lobbyNote(pick == null ? '' : 'Taşınacak koltuğa tıkla'); renderLobby(lastLobby); return; }
          if (teamOf(id) !== teamOf(pick)) { const who = pick; pick = null; lobbyNote(''); app.lobbyMove({ id: who, with: id }); return; }
          pick = id; renderLobby(lastLobby);
        };
      }
      wireDrag(lobby);
    }
    const blues = lobby.seats.filter(s => (s.team || 'blue') === 'blue').length, reds = lobby.seats.length - blues;
    const pvp = blues > 0 && reds > 0;
    els.lobbyMode.textContent = `${lobby.seats.length} insan · ${n * 2 - lobby.seats.length} bot · ${pvp ? 'PvP: zorluk yalnız insansız takımı etkiler' : 'Co-op'}`;
    els.lobbyTeams.value = String(n); els.lobbyDiff.value = lobby.settings.difficulty; els.lobbyPriv.value = lobby.priv ? '1' : '0';
    els.lobbyTeams.disabled = !isHost; els.lobbyDiff.disabled = !isHost || pvp; els.lobbyPriv.disabled = !isHost;
    for (const o of els.lobbyTeams.options) o.disabled = Number(o.value) < Math.max(blues, reds);
    els.lobbyStart.disabled = !isHost;
    els.lobbyStart.textContent = isHost ? 'MAÇI BAŞLAT ↗' : 'Kuranın başlatması bekleniyor';
    if (!isHost && els.lobbyStatus.textContent === 'Taşınacak koltuğa tıkla') lobbyNote('');
    if (visible() !== els.lobby) lobbyNote('');
    show(els.lobby);
  }

  /** Kuranın sürükle-bırakı: oyuncu satırı -> öbür takımdaki oyuncu (değiş) ya da bot koltuğu (geç). */
  function wireDrag(lobby) {
    const teamOf = id => (lobby.seats.find(s => s.id === id) || {}).team || 'blue';
    let dragId = null;
    for (const li of els.lobby.querySelectorAll('.seats li')) {
      if (li.dataset.id) {
        li.ondragstart = e => { dragId = Number(li.dataset.id); li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.id); };
        li.ondragend = () => { dragId = null; li.classList.remove('dragging'); for (const x of els.lobby.querySelectorAll('.drop')) x.classList.remove('drop'); };
      }
      const target = () => {
        if (dragId == null) return null;
        if (li.dataset.id) { const id = Number(li.dataset.id); return id !== dragId && teamOf(id) !== teamOf(dragId) ? { id: dragId, with: id } : null; }
        return li.dataset.team && li.dataset.team !== teamOf(dragId) ? { id: dragId, team: li.dataset.team } : null;
      };
      li.ondragover = e => { if (target()) { e.preventDefault(); li.classList.add('drop'); } };
      li.ondragleave = () => li.classList.remove('drop');
      li.ondrop = e => { e.preventDefault(); li.classList.remove('drop'); const t = target(); if (t) { pick = null; lobbyNote(''); app.lobbyMove(t); } };
    }
  }

  /**
   * Açık odalar (giriş ekranı): kuranın adı, `kaça kaç · zorluk · n/max oyuncu`, LOBİDE etiketi ve KATIL → (doluysa
   * kapalı DOLU). Kod yazmadan katılır (sunucuya yine kodla JOIN gider). Liste değişince sunucu kendisi yollar.
   */
  function renderRooms(list) {
    els.roomsN.textContent = list.length ? String(list.length) : '';
    if (!list.length) { els.roomsList.innerHTML = '<div class="empty">Şu an açık oda yok. Hızlı katıl yeni bir oda kurar.</div>'; return; }
    els.roomsList.innerHTML = list.map(o => `<button type="button" class="open-room" data-code="${escapeHtml(o.code)}"${o.full ? ' disabled' : ''}><span><b>${escapeHtml(o.host)}</b><small>${summary(o)} · ${o.n}/${o.max} oyuncu</small></span><i class="room-state">${o.state === 'playing' ? 'MAÇTA' : 'LOBİDE'}</i><em>${o.full ? 'DOLU' : 'KATIL →'}</em></button>`).join('');
    for (const b of els.roomsList.querySelectorAll('.open-room')) b.onclick = () => { homeStatus('Odaya bağlanıyor…'); app.joinRoom(nick(), b.dataset.code); };
  }

  // ---- Kısayollar
  function renderHelp() {
    const p = world.player, k = p ? KIT[kitKey(p.loadout)] || KIT.sword : KIT.sword;
    const rows = [['WASD', 'hareket'], ['Shift', 'koş'], ['Boşluk', 'zıpla (vuruş ve kule oku ıskalar)'], ['Sol tık', `${k.primary}: ${k.primaryDesc}`],
      ['Sol tık basılı', k.charge ? `${k.charge}: ${k.chargeDesc}` : '—'], ['Sağ tık', `atılma + ${k.secondary}: ${k.secondaryDesc}`], ['Maden, ağaç, tarlaya vur', 'kaynak düşer'], ['Sancak alanında dur', 'can yenilenir']];
    els.helpHero.innerHTML = rows.map(([a, b]) => `<tr><th>${a}</th><td>${escapeHtml(b)}</td></tr>`).join('');
  }
  const openHelp = () => { helpReturn = visible(); renderHelp(); show(els.help); };
  const closeHelp = () => { show(helpReturn && helpReturn !== els.help ? helpReturn : null); helpReturn = null; };
  root.querySelectorAll('[data-help]').forEach(b => { b.onclick = openHelp; });
  root.querySelectorAll('[data-close-help]').forEach(b => { b.onclick = closeHelp; });
  $('#mg-help-btn').onclick = () => (visible() === els.help ? closeHelp() : openHelp());

  // ---- Esc menüsü
  els.menuResume.onclick = () => { show(null); app.resume(); };
  /**
   * **Ses ve müzik düğmeleri iki yerdedir**: giriş ekranının sağ üstündeki standart araç çubuğunda ve Esc menüsünde.
   * İkisi de aynı durumu gösterir, bu yüzden yazıyı tek bir yer (`sesYaz` / `muzikYaz`) her iki düğmeye birden
   * yazar. Ses efektleri (`cm.sound`, bkz. ui.js) ile müzik (`cm.muzik`, bkz. muzik.js) **bağımsızdır**: biri
   * kapatılınca öbürü çalmaya devam eder. Müzik ses düzeyi sabittir (menüde sürgü yok, cihazın sesinden ayarlanır).
   */
  const sesYaz = on => { for (const b of [els.menuSound, els.homeSound]) if (b) { b.textContent = `Ses: ${on ? 'açık' : 'kapalı'}`; b.classList.toggle('muted', !on); } };
  sesYaz(app.soundOn());
  for (const b of [els.menuSound, els.homeSound]) if (b) b.onclick = () => sesYaz(app.toggleSound());

  function muzikYaz() {
    const on = app.muzikAcik();
    for (const b of [els.menuMuzik, els.homeMuzik]) if (b) { b.textContent = `Müzik: ${on ? 'açık' : 'kapalı'}`; b.classList.toggle('muted', !on); }
  }
  // Gösteri kiplerinde müzik hiç kurulmaz: iki müzik düğmesi de gizlenir, çubukta üçlü kalır.
  if (!app.muzikVar()) {
    for (const el of [els.menuMuzik, els.homeMuzik]) if (el) el.hidden = true;
  } else {
    for (const b of [els.menuMuzik, els.homeMuzik]) if (b) b.onclick = () => { app.toggleMuzik(); muzikYaz(); };
    muzikYaz();
  }

  /** Grafik kalitesi: Düşük -> Orta -> Yüksek sırayla döner; düğme o anki kare hızını da gösterir. */
  const qualityText = () => { const q = app.quality(); return `Grafik: ${q.label}${q.fps ? ` · ${q.fps} fps` : ''}`; };
  /** Ölçüm satırı: kare hızı, çizim çağrısı, çizilen birim / sahadaki birim. Takılma bildirirken bu satır okunur. */
  const perfText = () => {
    const q = app.quality();
    return `${q.fps} fps · ${q.calls} çizim · ${q.tris ? Math.round(q.tris / 1000) + 'k üçgen' : '-'} · birim ${q.drawn}/${q.units}`;
  };
  if (els.menuQuality) {
    els.menuQuality.onclick = () => {
      app.cycleQuality();
      els.menuQuality.textContent = qualityText();
      const perf = root.querySelector('#menu-perf'); if (perf) perf.textContent = perfText();
    };
    els.menuQuality.textContent = qualityText();
  }
  $('#menu-leave').onclick = () => { app.leaveGame(); screens.home(''); };
  $('#mg-menu-btn').onclick = () => screens.escape();

  const screens = {
    els, show, visible, nick, setServer, lastSetup,
    /** Giriş ekranı; kod kutusu doluysa (linkten gelen kod, hatalı kod) katılma satırı açık kalır. */
    home(status = '') { els.homeStatus.textContent = status; els.joinRow.hidden = !els.code.value; show(els.home); },
    endVisible: () => visible() === els.end,
    lobby: renderLobby,
    rooms: renderRooms,
    setOnline(n) { if (els.online) { els.online.textContent = n > 0 ? `● ${n} çevrim içi` : ''; els.online.title = 'Siteyi şu an açık tutan sekme sayısı'; } },
    setStatus(text) { if (visible() === els.lobby) els.lobbyStatus.textContent = text; else els.homeStatus.textContent = text; },
    end(report, actions) { renderReport(els.endCard, report, world, actions); show(els.end); },
    toggleHelp() { if (visible() === els.help) closeHelp(); else openHelp(); },
    /** Esc: açık pencereyi kapat; oyun içinde menüyü aç / kapat (tek başına oyunda menü oyunu durdurur). */
    escape() {
      if (world.gosteri) return; // gösteri kipinde menü yok: kip girdisiz döner (bkz. gosteri.js)
      const v = visible();
      if (v === els.help) { closeHelp(); return; }
      if (v === els.menu) { show(null); app.resume(); return; }
      if (v) return; // giriş / lobi / kurulum / bitiş ekranında Esc bir şey yapmaz
      if (!world.running) return;
      // Menü açılırken kare hızı tazelensin: grafik düğmesi o anki fps'i de yazar.
      if (els.menuQuality) els.menuQuality.textContent = qualityText();
      // Standart menüde çıkış düğmesi tek başına oyunda "Ana menü", odadayken "Odadan çık" yazar.
      if (els.menuLeave) els.menuLeave.textContent = world.replicated ? 'Odadan çık' : 'Ana menü';
      const perf = root.querySelector('#menu-perf'); if (perf) perf.textContent = perfText();
      show(els.menu); app.pauseForMenu();
    },
    netStrip(show) { els.net.hidden = !show; },
    /** Linkteki oda kodu (?oda=KOD, KPRT4 de olur): kod kutusu dolu gelir; main.js sunucu karşılayınca kendiliğinden katılır. */
    urlCode() {
      const raw = onlineEnabled() && new URLSearchParams(location.search).get('oda');
      const c = raw ? normalCode(raw) : '';
      if (c.replace('-', '').length < 4) return null;
      els.code.value = c; els.joinRow.hidden = false;
      return c;
    },
  };
  return screens;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
