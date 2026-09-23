import { KIT, TEAMS } from './config.js';
import { kitKey } from './characters.js';
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
    nick: $('#home-nick'), joinRow: $('#home-joinrow'), code: $('#home-code'), homeStatus: $('#home-status'),
    setupTitle: $('#setup-title'), lobbyCode: $('#lobby-code'), blue: $('#lobby-blue'), red: $('#lobby-red'), lobbyTeams: $('#lobby-teams'), lobbyDiff: $('#lobby-diff'), lobbyStart: $('#lobby-start'), lobbyStatus: $('#lobby-status'),
    endCard: $('#end-card'), helpHero: $('#help-hero'), menuResume: $('#menu-resume'), menuSound: $('#menu-sound'), menuQuality: $('#menu-quality'),
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
    if (el === els.home) { els.nick.focus(); }
  }
  const visible = () => overlays.find(o => !o.hidden) || null;
  const readRadio = name => { const el = root.querySelector(`input[name=${name}]:checked`); return el ? el.value : null; };

  // ---- Giriş
  $('#home-solo').onclick = () => { setupMode = 'solo'; els.setupTitle.textContent = 'Tek başına'; show(els.setup); };
  $('#home-create').onclick = () => { setupMode = 'create'; els.setupTitle.textContent = 'Oda kur'; show(els.setup); };
  $('#home-join').onclick = () => { els.joinRow.hidden = !els.joinRow.hidden; if (!els.joinRow.hidden) els.code.focus(); };
  const joinGo = () => { const code = els.code.value.trim().toUpperCase(); if (code.length < 4) { els.homeStatus.textContent = 'Oda kodunu yaz'; return; } els.homeStatus.textContent = 'Bağlanıyor…'; app.joinRoom(nick(), code); };
  $('#home-join-go').onclick = joinGo;
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
    try { navigator.clipboard.writeText(url).then(done, () => { els.lobbyStatus.textContent = url; }); } catch { els.lobbyStatus.textContent = url; }
  };
  els.lobbyTeams.onchange = els.lobbyDiff.onchange = () => app.lobbySettings({ teamSize: Number(els.lobbyTeams.value), difficulty: els.lobbyDiff.value });
  els.lobbyStart.onclick = () => app.startRoom();
  $('#lobby-leave').onclick = () => { app.leaveRoom(); show(els.home); };

  function renderLobby(lobby) {
    const isHost = lobby.hostId === app.netId();
    els.lobbyCode.textContent = lobby.code;
    const n = lobby.settings.teamSize;
    const seat = (i, s) => {
      if (s) return `<li class="${s.online ? '' : 'off'}${s.id === app.netId() ? ' me' : ''}"><i class="dot" style="background:${TEAMS.humanColors[i % TEAMS.humanColors.length]}"></i>${escapeHtml(s.nick)}${s.id === lobby.hostId ? ' <small>kuran</small>' : ''}${s.online ? '' : ' <small>koptu</small>'}</li>`;
      return `<li class="bot"><i class="dot bot"></i>Bot</li>`;
    };
    els.blue.innerHTML = Array.from({ length: n }, (_, i) => seat(i, lobby.seats[i])).join('');
    els.red.innerHTML = Array.from({ length: n }, () => `<li class="bot"><i class="dot red"></i>Bot</li>`).join('');
    els.lobbyTeams.value = String(n); els.lobbyDiff.value = lobby.settings.difficulty;
    els.lobbyTeams.disabled = els.lobbyDiff.disabled = !isHost;
    for (const o of els.lobbyTeams.options) o.disabled = Number(o.value) < lobby.seats.length;
    els.lobbyStart.hidden = !isHost;
    els.lobbyStatus.textContent = isHost ? '' : 'Kuranın başlatması bekleniyor';
    show(els.lobby);
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
  els.menuSound.onclick = () => { const on = app.toggleSound(); els.menuSound.textContent = `Ses: ${on ? 'açık' : 'kapalı'}`; };
  /** Grafik kalitesi: Düşük -> Orta -> Yüksek sırayla döner; düğme o anki kare hızını da gösterir. */
  const qualityText = () => { const q = app.quality(); return `Grafik: ${q.label}${q.fps ? ` · ${q.fps} fps` : ''}`; };
  if (els.menuQuality) {
    els.menuQuality.onclick = () => { app.cycleQuality(); els.menuQuality.textContent = qualityText(); };
    els.menuQuality.textContent = qualityText();
  }
  $('#menu-leave').onclick = () => { app.leaveGame(); show(els.home); };
  $('#mg-menu-btn').onclick = () => screens.escape();

  const screens = {
    els, show, visible, nick,
    home(status = '') { els.homeStatus.textContent = status; els.joinRow.hidden = true; show(els.home); },
    lobby: renderLobby,
    setStatus(text) { if (visible() === els.lobby) els.lobbyStatus.textContent = text; else els.homeStatus.textContent = text; },
    end(report, actions) { renderReport(els.endCard, report, world, actions); show(els.end); },
    toggleHelp() { if (visible() === els.help) closeHelp(); else openHelp(); },
    /** Esc: açık pencereyi kapat; oyun içinde menüyü aç / kapat (tek başına oyunda menü oyunu durdurur). */
    escape() {
      const v = visible();
      if (v === els.help) { closeHelp(); return; }
      if (v === els.menu) { show(null); app.resume(); return; }
      if (v) return; // giriş / lobi / kurulum / bitiş ekranında Esc bir şey yapmaz
      if (!world.running) return;
      // Menü açılırken kare hızı tazelensin: grafik düğmesi o anki fps'i de yazar.
      if (els.menuQuality) els.menuQuality.textContent = qualityText();
      show(els.menu); app.pauseForMenu();
    },
    netStrip(show) { els.net.hidden = !show; },
    /** Linkteki oda kodu (?oda=KOD): giriş ekranında kod alanı dolu gelir. */
    urlCode() { const c = new URLSearchParams(location.search).get('oda'); if (c) { els.code.value = c.toUpperCase(); els.joinRow.hidden = false; } return c ? c.toUpperCase() : null; },
  };
  return screens;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
