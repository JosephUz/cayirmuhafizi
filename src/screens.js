import { KIT, TEAMS } from './config.js';
import { kitKey } from './characters.js';
import { paylasti } from './olcum.js';
import { onlineEnabled } from './platform.js';
import { renderReport } from './report.js';

/**
 * Ekranlar (bkz. tasarım): giriş (ad + üç düğme), kurulum (kaça kaç, zorluk), lobi (oda kodu, koltuklar, ayarlar), bitiş
 * karnesi, kısayollar penceresi ve Esc menüsü. Hepsi aynı panel stilinde; her ekranda en fazla bir cümle. Ad ve oda kodu
 * linkten (?oda=KOD) ya da tarayıcı belleğinden gelir. Ekran akışı buradan yürür, oyun mantığına `app` kancalarıyla dokunur.
 */
export function createScreens(root, world, app) {
  const $ = s => root.querySelector(s);
  const els = {
    home: $('#mg-home'), setup: $('#mg-setup'), lobby: $('#mg-lobby'), end: $('#mg-end'), help: $('#mg-help'), menu: $('#mg-menu'), net: $('#mg-net'),
    nick: $('#home-nick'), joinRow: $('#home-joinrow'), code: $('#home-code'), homeStatus: $('#home-status'), online: $('#home-online'),
    setupTitle: $('#setup-title'), lobbyCode: $('#lobby-code'), blue: $('#lobby-blue'), red: $('#lobby-red'), lobbyTeams: $('#lobby-teams'), lobbyDiff: $('#lobby-diff'), lobbyStart: $('#lobby-start'), lobbyStatus: $('#lobby-status'), lobbyMode: $('#lobby-mode'),
    endCard: $('#end-card'), helpHero: $('#help-hero'), menuResume: $('#menu-resume'), menuSound: $('#menu-sound'), menuQuality: $('#menu-quality'),
    menuMuzik: $('#menu-muzik'), menuMuzikRow: $('#menu-muzik-row'), menuMuzikSes: $('#menu-muzik-ses'), menuMuzikYuzde: $('#menu-muzik-yuzde'),
    homeSound: $('#home-sound'), homeMuzik: $('#home-muzik'), menuLeave: $('#menu-leave'),
  };
  const overlays = [els.home, els.setup, els.lobby, els.end, els.help, els.menu];
  let setupMode = 'solo', helpReturn = null;
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

  // ---- Giriş
  $('#home-solo').onclick = () => { setupMode = 'solo'; els.setupTitle.textContent = 'Tek başına'; show(els.setup); };
  $('#home-create').onclick = () => { setupMode = 'create'; els.setupTitle.textContent = 'Oda kur'; show(els.setup); };
  $('#home-join').onclick = () => { els.joinRow.hidden = !els.joinRow.hidden; if (!els.joinRow.hidden) els.code.focus(); };
  const joinGo = () => { const code = els.code.value.trim().toUpperCase(); if (code.length < 4) { els.homeStatus.textContent = 'Oda kodunu yaz'; return; } els.homeStatus.textContent = 'Bağlanıyor…'; app.joinRoom(nick(), code); };
  $('#home-join-go').onclick = joinGo;
  // Sunucuya bağlanılamadıkça (kapalı ya da config.js → ONLINE ile kapatılmış) oda düğmeleri "Yakında" yazar ve basılmaz;
  // sunucu karşılayınca (main.js → onWelcome) açılır.
  function setServer(up) {
    for (const id of ['#home-create', '#home-join', '#home-join-go']) {
      const b = $(id), tag = b.querySelector('.soon-tag');
      b.disabled = !up; b.classList.toggle('soon', !up); b.title = up ? '' : 'Çok oyunculu yakında';
      if (id === '#home-join-go') continue;
      if (!up && !tag) b.insertAdjacentHTML('beforeend', '<em class="soon-tag">YAKINDA</em>'); else if (up) tag?.remove();
    }
  }
  setServer(false);
  els.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinGo(); });
  els.nick.addEventListener('keydown', e => { if (e.key === 'Enter') $('#home-solo').click(); });

  // ---- Kurulum
  $('#setup-start').onclick = () => {
    const teamSize = Number(readRadio('teams') || 1), difficulty = readRadio('difficulty') || 'normal';
    if (setupMode === 'solo') { show(null); app.startLocal(nick(), difficulty, teamSize); }
    else { els.homeStatus.textContent = ''; app.createRoom(nick(), { teamSize, difficulty }); }
  };
  $('#setup-back').onclick = () => show(els.home);

  // ---- Lobi
  $('#lobby-copy').onclick = () => {
    const code = els.lobbyCode.textContent, url = `${location.origin}${location.pathname}?oda=${encodeURIComponent(code)}`;
    const done = () => { els.lobbyStatus.textContent = 'Link kopyalandı'; setTimeout(() => { els.lobbyStatus.textContent = ''; }, 1500); };
    paylasti();
    try { navigator.clipboard.writeText(url).then(done, () => { els.lobbyStatus.textContent = url; }); } catch { els.lobbyStatus.textContent = url; }
  };
  els.lobbyTeams.onchange = els.lobbyDiff.onchange = () => app.lobbySettings({ teamSize: Number(els.lobbyTeams.value), difficulty: els.lobbyDiff.value });
  els.lobbyStart.onclick = () => app.startRoom();
  $('#lobby-leave').onclick = () => { app.leaveRoom(); show(els.home); };

  /**
   * Lobi: iki takımın koltukları. Oyuncular seçtikleri takımın ilk koltuklarına oturur, kalanı bot doldurur. Öbür
   * takımdaki bir bot koltuğuna tıklayan oraya geçer: iki takımda da insan varsa oyun PvP olur. Kuran oyuncuları
   * sürükleyip bırakır: öbür takımdaki bir oyuncunun üstüne bırakırsa yer değiştirirler, boş koltuğa bırakırsa geçer.
   */
  function renderLobby(lobby) {
    const isHost = lobby.hostId === app.netId();
    els.lobbyCode.textContent = lobby.code;
    const n = lobby.settings.teamSize;
    const me = lobby.seats.find(s => s.id === app.netId());
    // Renk sırası oyunla aynı: insanlar lobi sırasıyla TEAMS.humanColors'tan alır (bkz. players.js createPlayers).
    const colorOf = s => TEAMS.humanColors[lobby.seats.indexOf(s) % TEAMS.humanColors.length];
    const human = s => `<li class="${s.online ? '' : 'off'}${s.id === app.netId() ? ' me' : ''}" data-id="${s.id}"${isHost ? ' draggable="true"' : ''}><i class="dot" style="background:${colorOf(s)}"></i>${escapeHtml(s.nick)}${s.id === lobby.hostId ? ' <small>kuran</small>' : ''}${s.online ? '' : ' <small>koptu</small>'}</li>`;
    const list = team => {
      const people = lobby.seats.filter(s => (s.team || 'blue') === team);
      const canJoin = me && (me.team || 'blue') !== team;
      const bot = () => canJoin
        ? `<li class="bot join" data-team="${team}" data-slot="bot" title="Bu takıma geç"><i class="dot ${team === 'red' ? 'red' : 'bot'}"></i>Bot <small>buraya geç</small></li>`
        : `<li class="bot" data-team="${team}" data-slot="bot"><i class="dot ${team === 'red' ? 'red' : 'bot'}"></i>Bot</li>`;
      return Array.from({ length: n }, (_, i) => (people[i] ? human(people[i]) : bot())).join('');
    };
    els.blue.innerHTML = list('blue');
    els.red.innerHTML = list('red');
    for (const li of els.lobby.querySelectorAll('li.join')) li.onclick = () => app.lobbyTeam(li.dataset.team);
    if (isHost) wireDrag(lobby);
    const blues = lobby.seats.filter(s => (s.team || 'blue') === 'blue').length, reds = lobby.seats.length - blues;
    const pvp = blues > 0 && reds > 0;
    els.lobbyMode.textContent = (pvp ? 'PvP: iki takımda da oyuncu var, zorluk yalnızca insansız takımı etkiler (burada yok).' : 'Co-op: bütün oyuncular aynı takımda. Karşı takıma geçmek için oradaki bir bot koltuğuna tıkla.')
      + (isHost ? ' Kuran olarak oyuncuları sürükleyip bırakabilirsin (oyuncunun üstüne bırakırsan yer değiştirirler).' : '');
    els.lobbyTeams.value = String(n); els.lobbyDiff.value = lobby.settings.difficulty;
    els.lobbyTeams.disabled = !isHost; els.lobbyDiff.disabled = !isHost || pvp;
    for (const o of els.lobbyTeams.options) o.disabled = Number(o.value) < Math.max(blues, reds);
    els.lobbyStart.hidden = !isHost;
    els.lobbyStatus.textContent = isHost ? '' : 'Kuranın başlatması bekleniyor';
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
      li.ondrop = e => { e.preventDefault(); li.classList.remove('drop'); const t = target(); if (t) app.lobbyMove(t); };
    }
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
   * kapatılınca öbürü çalmaya devam eder. Müzik ses düzeyi sürgüsü yalnız Esc menüsündedir.
   */
  const sesYaz = on => { for (const b of [els.menuSound, els.homeSound]) if (b) { b.textContent = `Ses: ${on ? 'açık' : 'kapalı'}`; b.classList.toggle('muted', !on); } };
  sesYaz(app.soundOn());
  for (const b of [els.menuSound, els.homeSound]) if (b) b.onclick = () => sesYaz(app.toggleSound());

  function muzikYaz() {
    const on = app.muzikAcik();
    for (const b of [els.menuMuzik, els.homeMuzik]) if (b) { b.textContent = `Müzik: ${on ? 'açık' : 'kapalı'}`; b.classList.toggle('muted', !on); }
    if (els.menuMuzikRow) els.menuMuzikRow.classList.toggle('off', !on);
    if (els.menuMuzikYuzde) els.menuMuzikYuzde.textContent = `${Math.round(app.muzikSes() * 100)}%`;
  }
  // Gösteri kiplerinde müzik hiç kurulmaz: iki müzik düğmesi de sürgü de gizlenir, çubukta üçlü kalır.
  if (!app.muzikVar()) {
    for (const el of [els.menuMuzik, els.menuMuzikRow, els.homeMuzik]) if (el) el.hidden = true;
  } else {
    if (els.menuMuzikSes) {
      els.menuMuzikSes.value = String(Math.round(app.muzikSes() * 100));
      els.menuMuzikSes.oninput = () => { app.setMuzikSes(Number(els.menuMuzikSes.value) / 100); muzikYaz(); };
    }
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
  $('#menu-leave').onclick = () => { app.leaveGame(); show(els.home); };
  $('#mg-menu-btn').onclick = () => screens.escape();

  const screens = {
    els, show, visible, nick, setServer,
    home(status = '') { els.homeStatus.textContent = status; els.joinRow.hidden = true; show(els.home); },
    lobby: renderLobby,
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
    /** Linkteki oda kodu (?oda=KOD): giriş ekranında kod alanı dolu gelir. */
    urlCode() { const c = onlineEnabled() && new URLSearchParams(location.search).get('oda'); if (c) { els.code.value = c.toUpperCase(); els.joinRow.hidden = false; } return c ? c.toUpperCase() : null; },
  };
  return screens;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
