import { KIT, TEAMS } from './config.js';
import { kitKey } from './characters.js';
import { normalCode } from './net/protocol.js';
import { paylasti } from './olcum.js';
import { onlineEnabled } from './platform.js';
import { renderReport } from './report.js';
import { dilDugmesi, t } from './dil.js';

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
  const defaultNick = () => t('ana.varsayilanAd', { n: Math.floor(1000 + Math.random() * 9000) });
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
  const homeStatus = s => { els.homeStatus.textContent = s; };

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
    const ts = root.querySelector(`input[name=teams][value="${s.teamSize}"]`), d = root.querySelector(`input[name=difficulty][value="${s.difficulty}"]`);
    if (ts) ts.checked = true; if (d) d.checked = true;
  }

  // ---- Giriş
  $('#home-solo').onclick = () => show(els.setup);
  $('#home-create').onclick = () => { homeStatus(t('durum.odaKuruluyor')); app.createRoom(nick(), lastSetup()); };
  $('#home-quick').onclick = () => { homeStatus(t('durum.odaAraniyor')); app.quickJoin(nick(), lastSetup()); };
  $('#home-join').onclick = () => { els.joinRow.hidden = !els.joinRow.hidden; if (!els.joinRow.hidden) els.code.focus(); };
  const joinGo = () => {
    const code = normalCode(els.code.value);
    if (code.replace('-', '').length < 4) { homeStatus(t('durum.odaKoduYaz')); return; }
    els.code.value = code; homeStatus(t('durum.odayaBaglaniyor')); app.joinRoom(nick(), code);
  };
  $('#home-join-go').onclick = joinGo;
  // Sunucuya bağlanılamadıkça (kapalı ya da config.js → ONLINE ile kapatılmış) üç çevrim içi düğme "YAKINDA" yazar ve
  // basılmaz, açık oda listesi gizlenir; sunucu karşılayınca (main.js → onWelcome) açılır.
  function setServer(up) {
    els.rooms.hidden = !up;
    for (const id of ['#home-quick', '#home-create', '#home-join', '#home-join-go']) {
      const b = $(id), tag = b.querySelector('.soon-tag');
      b.disabled = !up; b.classList.toggle('soon', !up); b.title = up ? '' : t('ana.yakinda.title');
      if (id === '#home-join-go') continue;
      if (!up && !tag) b.insertAdjacentHTML('beforeend', `<em class="soon-tag">${t('ana.yakinda')}</em>`); else if (up) tag?.remove();
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
  const lobbyNote = s => { els.lobbyStatus.textContent = s; };
  $('#lobby-copy').onclick = () => {
    const code = els.lobbyCode.textContent, url = `${location.origin}${location.pathname}?oda=${encodeURIComponent(code)}`;
    const done = () => { lobbyNote(t('lobi.linkKopyalandi')); setTimeout(() => { if (els.lobbyStatus.textContent === t('lobi.linkKopyalandi')) lobbyNote(''); }, 1500); };
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
  const DIFF_AD = { easy: t('zorluk.easy'), normal: t('zorluk.normal'), hard: t('zorluk.hard') };
  const summary = s => `${s.teamSize}v${s.teamSize} · ${DIFF_AD[s.difficulty] || ''}`;
  let pick = null; // kuranın tıklayıp seçtiği (taşınacak) oyuncu
  let lastLobby = null;
  function renderLobby(lobby) {
    lastLobby = lobby;
    const isHost = lobby.hostId === app.netId();
    if (!isHost || !lobby.seats.some(s => s.id === pick)) pick = null;
    els.lobbyEyebrow.textContent = t('lobi.ust', { ozet: summary(lobby.settings) });
    els.lobbyCode.textContent = lobby.code;
    els.lobbyVis.textContent = lobby.priv ? t('lobi.ozelOda') : t('lobi.acikOda');
    const n = lobby.settings.teamSize;
    const me = lobby.seats.find(s => s.id === app.netId());
    const teamOf = id => (lobby.seats.find(s => s.id === id) || {}).team || 'blue';
    // Renk sırası oyunla aynı: insanlar lobi sırasıyla TEAMS.humanColors'tan alır (bkz. players.js createPlayers).
    const colorOf = s => TEAMS.humanColors[lobby.seats.indexOf(s) % TEAMS.humanColors.length];
    const tag = s => ` <small>${s}</small>`;
    const human = s => `<li class="${s.online ? '' : 'off'}${s.id === app.netId() ? ' me' : ''}${s.id === pick ? ' picked' : ''}${isHost ? ' movable' : ''}" data-id="${s.id}"${isHost ? ' draggable="true"' : ''}><i class="dot" style="background:${colorOf(s)}"></i><span class="nm">${escapeHtml(s.nick)}</span>${s.id === lobby.hostId ? tag(t('lobi.kuran')) : ''}${s.id === app.netId() ? tag(t('lobi.sen')) : ''}${s.online ? '' : tag(t('lobi.koptu'))}</li>`;
    const list = team => {
      const people = lobby.seats.filter(s => (s.team || 'blue') === team);
      // Boş koltuk tıklanabilir: kuranın seçtiği oyuncu öbür takımdaysa onu buraya taşır, yoksa tıklayan kendisi geçer.
      const canSit = pick != null ? teamOf(pick) !== team : me && (me.team || 'blue') !== team;
      const bot = () => `<li class="bot${canSit ? ' join' : ''}" data-team="${team}" data-slot="bot"><i class="dot ${team === 'red' ? 'red' : 'bot'}"></i><span class="seat-bot">${t('lobi.botKoltuk')}</span>${canSit ? `<span class="seat-sit">${t('lobi.buraOtur')}</span>` : ''}</li>`;
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
          if (pick == null || pick === id) { pick = pick === id ? null : id; lobbyNote(pick == null ? '' : t('lobi.koltugaTikla')); renderLobby(lastLobby); return; }
          if (teamOf(id) !== teamOf(pick)) { const who = pick; pick = null; lobbyNote(''); app.lobbyMove({ id: who, with: id }); return; }
          pick = id; renderLobby(lastLobby);
        };
      }
      wireDrag(lobby);
    }
    const blues = lobby.seats.filter(s => (s.team || 'blue') === 'blue').length, reds = lobby.seats.length - blues;
    const pvp = blues > 0 && reds > 0;
    els.lobbyMode.textContent = t('lobi.mod', { insan: lobby.seats.length, bot: n * 2 - lobby.seats.length, tur: pvp ? t('lobi.pvp') : t('lobi.coop') });
    els.lobbyTeams.value = String(n); els.lobbyDiff.value = lobby.settings.difficulty; els.lobbyPriv.value = lobby.priv ? '1' : '0';
    els.lobbyTeams.disabled = !isHost; els.lobbyDiff.disabled = !isHost || pvp; els.lobbyPriv.disabled = !isHost;
    for (const o of els.lobbyTeams.options) o.disabled = Number(o.value) < Math.max(blues, reds);
    els.lobbyStart.disabled = !isHost;
    els.lobbyStart.textContent = isHost ? t('kurulum.baslat') : t('lobi.bekleniyor');
    if (!isHost && els.lobbyStatus.textContent === t('lobi.koltugaTikla')) lobbyNote('');
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
      li.ondrop = e => { e.preventDefault(); li.classList.remove('drop'); const hedef = target(); if (hedef) { pick = null; lobbyNote(''); app.lobbyMove(hedef); } };
    }
  }

  /**
   * Açık odalar (giriş ekranı): kuranın adı, `kaça kaç · zorluk · n/max oyuncu`, LOBİDE etiketi ve KATIL → (doluysa
   * kapalı DOLU). Kod yazmadan katılır (sunucuya yine kodla JOIN gider). Liste değişince sunucu kendisi yollar.
   */
  function renderRooms(list) {
    els.roomsN.textContent = list.length ? String(list.length) : '';
    if (!list.length) { els.roomsList.innerHTML = `<div class="empty">${t('odalar.bos')}</div>`; return; }
    els.roomsList.innerHTML = list.map(o => `<button type="button" class="open-room" data-code="${escapeHtml(o.code)}"${o.full ? ' disabled' : ''}><span><b>${escapeHtml(o.host)}</b><small>${summary(o)} · ${t('odalar.oyuncu', { n: o.n, max: o.max })}</small></span><i class="room-state">${o.state === 'playing' ? t('odalar.macta') : t('odalar.lobide')}</i><em>${o.full ? t('odalar.dolu') : t('odalar.katil')}</em></button>`).join('');
    for (const b of els.roomsList.querySelectorAll('.open-room')) b.onclick = () => { homeStatus(t('durum.odayaBaglaniyor')); app.joinRoom(nick(), b.dataset.code); };
  }

  // ---- Kısayollar
  function renderHelp() {
    const p = world.player, k = p ? KIT[kitKey(p.loadout)] || KIT.sword : KIT.sword;
    const rows = [['WASD', t('yardim.wasd.d')], ['Shift', t('yardim.shift.d')], [t('tus.bosluk'), t('yardim.bosluk.d')], [t('tus.solTik'), `${k.primary}: ${k.primaryDesc}`],
      [t('tus.solTikBasili'), k.charge ? `${k.charge}: ${k.chargeDesc}` : '—'], [t('tus.sagTik'), t('yardim.sagTik.d', { ad: k.secondary, aciklama: k.secondaryDesc })], [t('yardim.kaynak'), t('yardim.kaynak.d')], [t('yardim.sancakAlani'), t('yardim.sancakAlani.d')]];
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
  // Düğmenin eni en uzun yazısı kadar tutar (data-w, bkz. style.css): o yazı da etkin dilde.
  for (const b of [els.menuSound, els.homeSound]) if (b) b.dataset.w = t('ses.kapali');
  for (const b of [els.menuMuzik, els.homeMuzik]) if (b) b.dataset.w = t('muzik.kapali');
  const sesYaz = on => { for (const b of [els.menuSound, els.homeSound]) if (b) { b.textContent = on ? t('ses.acik') : t('ses.kapali'); b.classList.toggle('muted', !on); } };
  sesYaz(app.soundOn());
  // Standart dil düğmesi (josephuz dil standardı): araç çubuğunun sonunda, öbür dili gösterir; basınca sayfa o dilde
  // yeniden yüklenir. Yalnız giriş ekranındaki çubukta durur, Esc menüsünde yoktur (yeniden yükleme maçı bozar).
  if ($('#dil')) dilDugmesi($('#dil'));
  for (const b of [els.menuSound, els.homeSound]) if (b) b.onclick = () => sesYaz(app.toggleSound());

  function muzikYaz() {
    const on = app.muzikAcik();
    for (const b of [els.menuMuzik, els.homeMuzik]) if (b) { b.textContent = on ? t('muzik.acik') : t('muzik.kapali'); b.classList.toggle('muted', !on); }
  }
  // Gösteri kiplerinde müzik hiç kurulmaz: iki müzik düğmesi de gizlenir, çubukta üçlü kalır.
  if (!app.muzikVar()) {
    for (const el of [els.menuMuzik, els.homeMuzik]) if (el) el.hidden = true;
  } else {
    for (const b of [els.menuMuzik, els.homeMuzik]) if (b) b.onclick = () => { app.toggleMuzik(); muzikYaz(); };
    muzikYaz();
  }

  /** Grafik kalitesi: Düşük -> Orta -> Yüksek sırayla döner; düğme o anki kare hızını da gösterir. */
  const qualityText = () => { const q = app.quality(); return `${t('menu.grafik', { ad: q.label })}${q.fps ? ` · ${q.fps} fps` : ''}`; };
  /** Ölçüm satırı: kare hızı, çizim çağrısı, çizilen birim / sahadaki birim. Takılma bildirirken bu satır okunur. */
  const perfText = () => {
    const q = app.quality();
    return t('menu.perf', { fps: q.fps, cizim: q.calls, ucgen: q.tris ? t('menu.ucgen', { n: Math.round(q.tris / 1000) }) : '-', cizilen: q.drawn, toplam: q.units });
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
    setOnline(n) { if (els.online) { els.online.textContent = n > 0 ? t('ana.cevrimIciSayi', { n }) : ''; els.online.title = t('ana.cevrimIci.title'); } },
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
      if (els.menuLeave) els.menuLeave.textContent = world.replicated ? t('lobi.odadanCik') : t('menu.anaMenu');
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
