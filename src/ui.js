import { BUILD, BUILDINGS, DIFFICULTY, HERO_UPGRADE, LEVEL, QUEUE, SOLDIER_TYPES, TOWER, antiInfo, heroConvertCost, loadoutKey, respawnDelay } from './config.js';
import { clearSelection, selectStructureGroup, setSelection, unlockPointer } from './input.js';
import { bannerShielded, structureCount } from './structures.js';
import { bestProducer, queuedSoldiers, unitClass, workerTotal } from './production.js';
import { damageMult } from './combat.js';
import { reachOf, xpNeeded } from './characters.js';
import { scoreOf } from './stats.js';
import { t, sayi } from './dil.js';

/**
 * Age of tarzı alt bant: solda komut ızgarası (seçili yapının üretimi / inşa), ortada bilgi kartı (can, üretim sırası,
 * birim sayıları), sağda 2B minimap ve düğmeler. Üstte HUD, sağ üstte canlı skor. Metin mesaj barı yoktur: geri bildirim
 * ses (ping), HUD parıltısı, düğme durumları ve dünya efektleridir. Simülasyona yalnızca `actions` üzerinden dokunur
 * (tek başına oyunda doğrudan komut, çevrim içi oyunda sunucuya mesaj). Ekranlar screens.js'te.
 */
export function createUI(root, world, actions) {
  const $ = sel => root.querySelector(sel);
  const els = {
    health: $('#mg-health'), level: $('#mg-level'), gold: $('#mg-gold'), wood: $('#mg-wood'), workers: $('#mg-workers'), army: $('#mg-army'),
    towers: $('#mg-towers'), bannerOwn: $('#mg-banner-own'), allies: $('#mg-allies'), hint: $('#mg-hint'),
    cmd: $('#mg-cmd'), info: $('#mg-info'), floats: $('#mg-floats'), alert: $('#mg-alert'), full: $('#mg-full'), cam: $('#mg-cam'),
    score: $('#mg-score'), scoreList: $('#mg-score .score-list'), scoreHead: $('#mg-score .score-head'),
  };
  let audio = null, cmdKey = '', infoKey = '', scoreKey = '', hintText = null, hintUntil = 0;
  const campLabels = new Map();
  let lastAlertPing = -99;
  const typeOf = key => SOLDIER_TYPES.find(x => x.key === key);
  const antiText = key => { const a = antiInfo(key); if (!a.beats.length && !a.beatenBy.length) return ''; return t('anti.metin', { ust: a.beats.join(', ') || '—', zayif: a.beatenBy.join(', ') || '—' }); };
  const antiHtml = key => { const a = antiInfo(key); if (!a.beats.length && !a.beatenBy.length) return ''; return `<div class="anti"><span class="good">⚔ ${t('anti.ustun')}: <b>${a.beats.join(', ') || '—'}</b></span> <span class="bad">☠ ${t('anti.zayif')}: <b>${a.beatenBy.join(', ') || '—'}</b></span></div>`; };
  let soundOn = true;
  try { soundOn = localStorage.getItem('cm.sound') !== 'off'; } catch { /* yok */ }
  const ping = kind => {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      const [f1, f2, dur] = kind === 'tower' ? [220, 440, 0.35] : kind === 'worker' ? [520, 780, 0.14] : kind === 'order' ? [660, 495, 0.12] : kind === 'select' ? [440, 520, 0.08] : kind === 'error' ? [300, 180, 0.16] : [392, 587, 0.18];
      o.type = 'triangle'; o.frequency.setValueAtTime(f1, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch { /* ses yoksa sorun değil */ }
  };
  const flashTimers = {};
  const heroDown = () => world.player && !world.player.alive;
  const busy = () => !world.running || world.paused || world.ended || heroDown() || !world.player;
  /** Kahraman yerdeyken komut verilemez: yalnızca hata sesi çalar (geri sayım ekranın ortasındadır). */
  const deadBlock = () => { if (heroDown() || !world.player) { ping('error'); return true; } return false; };
  const sel = () => world.sel;

  // ---- Komut ızgarası tıklamaları
  els.cmd.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    /**
     * Kapalı düğmeye basmak sessiz kalmaz: neyin eksik olduğunu alt bandın üstüne yazar. Sebep, düğmeler her
     * tazelendiğinde `data-why` alanına yazılır (bkz. refreshCmd), böylece ipucunu beklemeye gerek kalmaz.
     */
    if (b.classList.contains('off')) { ui.hint(d.why || t('ui.yapilamaz'), 2.2); ping('error'); b.blur(); return; }
    if (d.soldier) ui.requestSoldier(d.soldier, e.ctrlKey ? QUEUE.batchCtrl : e.shiftKey ? QUEUE.batchShift : 1);
    else if (d.build) ui.startPlacing(d.build);
    else if (d.demolish) ui.demolish();
    else if (d.cancel) ui.cancelModes();
    else if (d.close) ui.cancelModes();
    else if (d.heromenu) ui.toggleHeroMenu();
    else if (d.herotype) ui.heroConvert(d.herotype);
    b.blur();
  });
  els.info.addEventListener('click', e => {
    const b = e.target.closest('button[data-q]'); if (!b || !sel().structure || deadBlock()) return;
    actions.cancelQueued(sel().structure, Number(b.dataset.q));
    ui.update();
  });
  els.full.onclick = () => { actions.toggleFullscreen(); els.full.blur(); };
  if (els.cam) els.cam.onclick = () => { actions.toggleCamera(); els.cam.blur(); };
  if (els.scoreHead) els.scoreHead.onclick = () => { els.score.classList.toggle('folded'); try { localStorage.setItem('cm.scorefold', els.score.classList.contains('folded') ? '1' : '0'); } catch { /* yok */ } };
  try { if (localStorage.getItem('cm.scorefold') === '1') els.score.classList.add('folded'); } catch { /* yok */ }

  // ---- Sayımlar
  const countUnits = () => {
    const c = { army: 0, enemies: 0, workers: 0, enemyWorkers: 0, allies: 0, allyArmy: {}, foot: 0, archer: 0, cavalry: 0, siege: 0, gold: 0, wood: 0, food: 0 };
    for (const e of world.entities) {
      if (!e.alive || e.isPlayer || e.isHero) continue;
      if (e.faction !== world.side) { if (e.isWorker) c.enemyWorkers += e.tier || 1; else if (!e.isBeast) c.enemies++; continue; }
      if (e.owner !== world.me) { if (!e.isWorker) { c.allies++; c.allyArmy[e.owner.id] = (c.allyArmy[e.owner.id] || 0) + 1; } continue; }
      if (e.isWorker) { c.workers += e.tier || 1; c[e.workerKind] += e.tier || 1; continue; }
      c.army++;
      const cls = unitClass(e);
      if (cls && c[cls] != null) c[cls]++;
    }
    return c;
  };

  /**
   * Sancak çemberi kuralı (bkz. structures.js heroInBase): kahraman çemberin dışındayken bina dikilmez, asker basılmaz,
   * çemberin içindeki yapı (sancak, binalar, içerideki kuleler) seçili kalmaz; çember dışındaki kule kahraman
   * yanındayken (heroRadius) seçilebilir. Kahraman yerdeyken (doğmayı beklerken) seçim olduğu gibi kalır.
   */
  const inCircle = (x, z) => { const b = world.me && world.me.banner; return Boolean(b && b.alive && Math.hypot(x - b.pos.x, z - b.pos.z) <= BUILD.bannerRadius); };
  const heroInBase = () => { const p = world.player; return Boolean(p && p.alive && inCircle(p.pos.x, p.pos.z)); };
  const reachable = s => {
    const p = world.player;
    if (!p || !p.alive) return true;
    return inCircle(s.pos.x, s.pos.z) ? heroInBase() : Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z) <= BUILD.heroRadius + (s.radius || 1);
  };
  const outOfReach = s => (inCircle(s.pos.x, s.pos.z) ? t('ui.cemberDisi') : t('ui.kuleyeYaklas'));
  const heroNearBanner = () => { const p = world.player, b = world.me && world.me.banner; return Boolean(p && b && p.alive && b.alive && Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) <= HERO_UPGRADE.range); };
  const heroTypeLabel = p => { const tur = SOLDIER_TYPES.find(x => !x.worker && x.weapon === p.loadout.weapon && x.shield === p.loadout.shield && x.horse === p.loadout.horse); return tur ? tur.label : t('birim.sword.ad'); };

  // ---- Komut ızgarası (5 x 3)
  const SLOT_COUNT = 15, SLOT_CLOSE = 4, SLOT_DEMOLISH = 14;
  const shortGold = n => (n >= 10000 ? `${Math.round(n / 1000)}k` : `${n}`);
  const costOf = o => [o.cost ? `${shortGold(o.cost)}◉` : '', o.food ? `${o.food}🌾` : '', o.wood ? `${o.wood}🪵` : ''].filter(Boolean).join(' ');
  const slot = (o) => `<button type="button" class="slot${o.active ? ' active' : ''}${o.big ? ' big' : ''}" ${Object.entries(o.data || {}).map(([k, v]) => `data-${k}="${v}"`).join(' ')} title="${o.title || o.label}" ${o.disabled ? 'disabled' : ''}><span class="ico">${o.icon}</span><span class="lbl">${o.label}</span>${o.cost != null ? `<span class="cost">${costOf(o)}</span>` : ''}</button>`;
  function cmdSlots() {
    const s = sel(), out = [];
    if (s.structure && s.structure.kind === 'banner' && world.heroMenu) {
      const p = world.player;
      for (const tur of SOLDIER_TYPES.filter(x => !x.worker && !x.siege)) {
        const same = p.loadout.weapon === tur.weapon && p.loadout.shield === tur.shield && p.loadout.horse === tur.horse;
        const cc = heroConvertCost(tur, world.limits);
        out.push({ icon: tur.icon, label: tur.label, cost: cc, data: { herotype: tur.key }, active: same, title: same ? t('ui.suankiTur', { ad: tur.label }) : t('ui.turOl', { ad: tur.label, altin: sayi(cc) }) });
      }
      out.push({ icon: '↩', label: t('genel.geri'), data: { heromenu: 1 }, title: t('ui.sancakMenusu') });
      out.push({ icon: '✖', label: t('genel.kapat'), data: { close: 1 }, title: t('ui.kapat.title'), at: SLOT_CLOSE });
      return out;
    }
    if (s.structure) {
      const st = s.structure, spec = BUILDINGS[st.kind];
      if (!st.ready) out.push({ icon: '🔨', label: t('ui.insa'), title: t('ui.insaEdiliyor'), disabled: true });
      else {
        for (const k of spec.produces) { const u = typeOf(k); out.push({ icon: u.icon, label: u.label, cost: u.cost, food: u.food, wood: u.wood, data: { soldier: u.key }, title: `${u.label}: ${t('ui.altin', { n: u.cost })}${u.food ? t('ui.artiYiyecek', { n: u.food }) : ''}${u.wood ? t('ui.artiOdun', { n: u.wood }) : ''}, ${t('ui.saniye', { n: u.train })}${antiText(u.key) ? ` · ${antiText(u.key)}` : ''} · ${t('ui.toplu', { a: QUEUE.batchShift, b: QUEUE.batchCtrl })}` }); }
        if (st.kind === 'banner') out.push({ icon: '★', label: t('ui.gelistir'), data: { heromenu: 1 }, title: t('ui.gelistir.title') });
      }
    } else {
      for (const k of BUILDINGS.banner.builds) { const b = BUILDINGS[k]; out.push({ icon: b.icon, label: b.label, cost: b.cost, wood: b.wood, data: { build: k }, active: world.placing === k, title: t('ui.binaTitle', { ad: b.label, aciklama: b.desc, odun: b.wood, sure: b.buildTime }) }); }
    }
    if (s.structure && s.structure.owner === world.me && s.structure.kind !== 'banner') {
      const tower = s.structure.kind === 'tower';
      out.push({ icon: '💀', label: t('ui.yik'), at: SLOT_DEMOLISH, data: { demolish: 1 }, title: tower ? t('ui.yikKule') : t('ui.yikBina') });
    }
    if (world.placing) out.push({ icon: '✖', label: t('ui.vazgec'), data: { cancel: 1 }, title: t('ui.vazgec.title') });
    else if (s.structure) out.push({ icon: '✖', label: t('genel.kapat'), data: { close: 1 }, title: t('ui.kapatSecim.title'), at: SLOT_CLOSE });
    return out;
  }
  function renderCmd() {
    const s = sel(), slots = cmdSlots();
    const key = (s.structure ? `S${s.structure.id}:${s.structure.ready}:${world.heroMenu ? 'H' + world.player.level : ''}` : 'U') + '|' + slots.map(o => o.label + (o.active ? '*' : '')).join(',');
    if (key !== cmdKey) {
      cmdKey = key;
      // Sabit yerli düğmeler (Kapat sağ üst, Yık sağ alt) her menüde aynı yuvada; ötekiler kalan yuvalara sırayla dolar.
      const cells = new Array(SLOT_COUNT).fill(null);
      for (const o of slots) if (o.at != null) cells[o.at] = o;
      let i = 0;
      for (const o of slots) { if (o.at != null) continue; while (i < SLOT_COUNT && cells[i]) i++; if (i < SLOT_COUNT) cells[i] = o; }
      els.cmd.innerHTML = cells.map(o => (o ? slot(o) : '<span class="slot empty"></span>')).join('');
    }
    const eco = world.me.eco, b = busy();
    // Kapalılık sebebi düğmede taşınır: tıklayınca yazılır (yukarıdaki click), fareyle beklemeye gerek yok.
    const off = (el, why) => { el.classList.toggle('off', Boolean(why)); el.dataset.why = why || ''; };
    const busyWhy = () => (heroDown() ? t('ui.kahramanYerde') : world.paused ? t('ui.duraklatildi') : world.ended ? t('ui.oyunBitti') : t('ui.komutYok'));
    const gold = (n, what) => t('ui.yetersizAltin', { ad: what, n: sayi(n), var: sayi(Math.floor(eco.gold)) });
    const home = heroInBase();
    for (const el of els.cmd.querySelectorAll('button[data-soldier]')) {
      const u = typeOf(el.dataset.soldier);
      off(el, b ? busyWhy() : !home ? t('ui.askerCember') : eco.gold < u.cost ? gold(u.cost, u.label) : eco.food < u.food ? t('ui.yetersizYiyecek', { ad: u.label, n: u.food, var: Math.floor(eco.food) }) : '');
    }
    for (const el of els.cmd.querySelectorAll('button[data-build]')) {
      const kind = el.dataset.build, spec = BUILDINGS[kind], tower = kind === 'tower';
      const cap = tower ? world.limits.towers : world.limits.buildings;
      const capped = structureCount(world, world.me, tower) >= cap;
      off(el, b ? busyWhy()
        : !tower && !home ? t('ui.binaCember')
        : capped ? (tower ? t('ui.kuleSiniri', { n: cap }) : t('ui.binaSiniri', { n: cap }))
        : eco.gold < spec.cost ? gold(spec.cost, spec.label)
        : eco.wood < spec.wood ? t('ui.yetersizOdun', { ad: spec.label, n: spec.wood, var: Math.floor(eco.wood) }) : '');
    }
    const hn = heroNearBanner();
    for (const el of els.cmd.querySelectorAll('button[data-herotype]')) {
      const u = typeOf(el.dataset.herotype), cc = heroConvertCost(u, world.limits);
      off(el, b ? busyWhy() : !hn ? t('komut.sancagaYaklas') : eco.gold < cc ? gold(cc, u.label) : '');
    }
  }

  // ---- Bilgi kartı (yalnızca sayılar; tuş anlatımı kısayol penceresinde)
  const bar = (hp, max, cls = '') => `<div class="bar ${cls}"><i data-bar style="width:${Math.max(0, Math.min(100, hp / max * 100))}%"></i></div>`;
  const unitStats = e => { const w = e.stats.weapon; if (e.isSiege) return t('ui.kuleye', { h: Math.round(w.damage * TOWER.siegeDamageMult), m: w.range, cd: w.cooldown }); const r = reachOf(e), dm = damageMult(e);
    return `${w.ranged ? t('ui.ok') : t('ui.vurus')} ${Math.round(w.damage * dm)}${dm > 1.001 ? ` (x${dm.toFixed(2)})` : ''} · ${t('ui.menzil', { n: r.range.toFixed(1) })} · ${t('ui.hiz', { n: e.stats.speed.toFixed(1) })}${e.loadout.shield ? ` · ${t('ui.kalkan')}` : ''}${antiHtml(e.typeKey || loadoutKey(e.loadout))}`; };
  function renderInfo() {
    const s = sel(), p = world.player;
    let key, html;
    if (s.structure) {
      const st = s.structure, spec = BUILDINGS[st.kind];
      const grp = (s.structures || []).filter(o => o.alive);
      const many = grp.length > 1 ? grp : null;
      const totalQ = many ? many.reduce((a, o) => a + o.queue.length, 0) : st.queue.length;
      key = `S${st.id}|${st.ready}|${st.queue.join(',')}|${many ? many.length + ':' + totalQ : ''}`;
      html = `<div class="card"><div class="ico">${spec.icon}</div><div class="body"><h3>${many ? `${many.length} × ${spec.label}` : spec.label}</h3>${bar(st.hp, st.maxHp)}<div class="line"><span data-hp>♥ ${Math.ceil(st.hp)}/${st.maxHp}</span>${st.ready ? '' : `<span data-build>${t('ui.insaYuzde', { n: Math.round((1 - st.buildTimer / st.buildTime) * 100) })}</span>`}${st.kind === 'tower' ? `<span>${t('ui.menzil', { n: TOWER.range })}</span>` : ''}${st.kind === 'banner' ? (bannerShielded(world, st) ? `<span>${t('ui.kalkanli')}</span>` : `<span>${t('ui.kuleYok')}</span>`) : ''}</div>`;
      if (st.ready && spec.produces.length) {
        html += `<div class="queue">${st.queue.map((k, i) => `<button type="button" class="q" data-q="${i}" title="${t('ui.iptal', { ad: typeOf(k).label })}"><span>${typeOf(k).icon}</span>${i === 0 ? '<i class="prog" data-prog></i>' : ''}</button>`).join('')}<span class="qn" data-qn>${st.queue.length}/${QUEUE.max}</span>${many ? `<span class="qn">${t('ui.grupSira', { n: many.length, q: totalQ })}</span>` : ''}${st.queue.length ? `<span class="qn"><span data-left></span></span>` : ''}</div>`;
      }
      html += '</div></div>';
    } else if (p) {
      const own = world.me.banner, shielded = own && bannerShielded(world, own);
      const towers = world.structures.filter(t => t.alive && t.kind === 'tower' && t.owner === world.me).length;
      key = `H|${p.level}|${p.stats.maxHp}|${heroTypeLabel(p)}|${own ? Math.ceil(own.hp) : 0}|${towers}`;
      html = `<div class="card"><div class="ico">★</div><div class="body"><h3>${t('ui.kahramanBaslik', { tur: heroTypeLabel(p), sv: p.level })}</h3>${bar(p.hp, p.stats.maxHp)}<div class="line"><span data-hp>♥ ${Math.ceil(p.hp)}/${p.stats.maxHp}</span><span>${unitStats(p)}</span></div><div class="line"><span data-banner>${t('ui.sancakCan', { can: own ? `${Math.ceil(own.hp)}/${own.maxHp}` : '—' })}</span><span>${shielded ? t('ui.kuleSayi', { n: towers }) : t('ui.kuleYok')}</span><span>${t('ui.exp', { a: Math.floor(p.xp || 0), b: xpNeeded(p.level) })}</span></div>${own ? `<div class="bar banner"><i data-bbar style="width:${Math.max(0, Math.min(100, own.hp / own.maxHp * 100))}%"></i></div>` : ''}</div></div>`;
    } else { key = 'N'; html = ''; }
    if (key !== infoKey) { infoKey = key; els.info.innerHTML = html; return; }
    const st = s.structure;
    if (st) {
      const hp = els.info.querySelector('[data-hp]'); if (hp) hp.textContent = `♥ ${Math.ceil(st.hp)}/${st.maxHp}`;
      const b = els.info.querySelector('[data-bar]'); if (b) b.style.width = `${Math.max(0, st.hp / st.maxHp * 100)}%`;
      const bd = els.info.querySelector('[data-build]'); if (bd) bd.textContent = t('ui.insaYuzde', { n: Math.round((1 - st.buildTimer / st.buildTime) * 100) });
      if (st.queue.length) {
        const u = typeOf(st.queue[0]);
        const pr = els.info.querySelector('[data-prog]'); if (pr) pr.style.height = `${(1 - st.progress / u.train) * 100}%`;
        const lf = els.info.querySelector('[data-left]'); if (lf) lf.textContent = t('ui.saniye', { n: Math.max(0, u.train - st.progress).toFixed(1) });
      }
    } else if (p) {
      const hp = els.info.querySelector('[data-hp]'); if (hp) hp.textContent = `♥ ${Math.ceil(p.hp)}/${p.stats.maxHp}`;
      const b = els.info.querySelector('[data-bar]'); if (b) b.style.width = `${Math.max(0, p.hp / p.stats.maxHp * 100)}%`;
      const own = world.me.banner;
      const bh = els.info.querySelector('[data-banner]'); if (bh && own) bh.textContent = t('ui.sancakCan', { can: `${Math.ceil(own.hp)}/${own.maxHp}` });
      const bb = els.info.querySelector('[data-bbar]'); if (bb && own) bb.style.width = `${Math.max(0, own.hp / own.maxHp * 100)}%`;
    }
  }

  /** Canlı skor: oyuncular skora göre, kendi satırın vurgulu (çevrim içi skor sunucudan, tek başına yerelden). */
  function renderScore() {
    if (!els.score) return;
    const rows = world.players.map(p => ({ p, sc: world.replicated ? (p.score || 0) : (p.st ? scoreOf(p).total : 0) })).sort((a, b) => b.sc - a.sc);
    const key = rows.map(r => `${r.p.id}:${r.sc}:${r.p.online === false ? 'x' : ''}`).join('|');
    if (key === scoreKey) return;
    scoreKey = key;
    els.scoreList.innerHTML = rows.map(r => `<li class="${r.p === world.me ? 'me' : ''} ${r.p.faction}${r.p.online === false ? ' off' : ''}"><i class="dot" style="background:${r.p.color}"></i><span class="n">${r.p.name}${r.p.human ? '' : '<small>bot</small>'}</span><b>${sayi(Math.round(r.sc))}</b></li>`).join('');
  }

  const ui = {
    ping,
    get soundOn() { return soundOn; },
    toggleSound() { soundOn = !soundOn; try { localStorage.setItem('cm.sound', soundOn ? 'on' : 'off'); } catch { /* yok */ } return soundOn; },
    flash(key) {
      const el = els[key]; if (!el) return;
      el.classList.add('flash'); clearTimeout(flashTimers[key]);
      flashTimers[key] = setTimeout(() => el.classList.remove('flash'), 220);
    },
    /** Saldırı uyarısı: ekranın kenarları kısa süre kızarır; hata sesi 4 saniyede birden sık çalmaz. */
    alert() {
      if (els.alert) { els.alert.classList.remove('on'); void els.alert.offsetWidth; els.alert.classList.add('on'); }
      if (world.clock - (lastAlertPing || -99) > 4) { lastAlertPing = world.clock; ping('error'); }
    },
    /** Seni öldüren birimin / yapının adı (ölüm kamerası için; bkz. main.js killcam). */
    killerLabel(o) {
      if (!o) return '';
      if (o.kind) return (BUILDINGS[o.kind] && BUILDINGS[o.kind].label) || t('olum.yapi');
      if (o.isPlayer || o.isHero) return t('olum.rakipKahraman');
      const tur = SOLDIER_TYPES.find(x => x.key === (o.typeKey || loadoutKey(o.loadout)));
      return tur ? tur.label : t('olum.asker');
    },
    updateRespawn() {
      const el = root.querySelector('#mg-respawn'); if (!el) return;
      const p = world.player, banner = world.me && world.me.banner;
      if (!p || p.alive || world.ended || !banner || !banner.alive) { el.hidden = true; el.dataset.n = ''; return; }
      const left = Math.max(0, respawnDelay(p.deaths) - p.deathTimer), n = Math.ceil(left);
      el.hidden = false;
      // Ölüm kamerası sürerken (katile bakılırken) yalnız kimin öldürdüğü yazar; geri sayım kamera sancağa geçince akar.
      const kc = world.killcam, key = kc ? 'k' : String(n);
      el.classList.toggle('killcam', Boolean(kc));
      const num = el.querySelector('.num');
      if (el.dataset.n !== key) {
        el.dataset.n = key;
        if (kc) {
          const who = kc.target ? ui.killerLabel(kc.target) : '';
          el.querySelector('.sub').textContent = who ? t('olum.seniOldurdu', { kim: who }) : t('olum.kacinci', { n: p.deaths });
        } else {
          num.textContent = n; num.classList.toggle('final', n <= 1);
          num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
          el.querySelector('.sub').textContent = t('olum.dogarsin', { n: p.deaths });
        }
      }
    },
    updateCharge() {
      const el = root.querySelector('#mg-charge'); if (!el) return;
      const p = world.player;
      if (!p || !p.alive || !p.charging || !world.toScreen) { el.hidden = true; return; }
      const s = world.toScreen({ x: p.pos.x, y: 3.1 + p.jumpY, z: p.pos.z });
      if (!s || !isFinite(s.x)) { el.hidden = true; return; }
      el.hidden = false; el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
      el.firstElementChild.style.width = `${Math.round(p.charge * 100)}%`;
      el.classList.toggle('full', p.charge >= 1);
    },
    updateCampLabels() {
      if (!els.floats || !world.toScreen || !world.camps) return;
      for (const [camp, el] of campLabels) if (!world.camps.includes(camp)) { el.remove(); campLabels.delete(camp); }
      for (const camp of world.camps) {
        let el = campLabels.get(camp);
        if (!el) { el = document.createElement('span'); el.className = 'camp-label'; els.floats.appendChild(el); campLabels.set(camp, el); }
        const show = world.fog && world.fog.isVisible(camp.pos.x, camp.pos.z);
        if (!show) { el.style.display = 'none'; continue; }
        const s = world.toScreen({ x: camp.pos.x, y: camp.alive ? 5.4 : 2.2, z: camp.pos.z });
        if (!s || !isFinite(s.x)) { el.style.display = 'none'; continue; }
        const kalan = camp.alive ? camp.waveTimer : camp.respawnTimer;
        const time = `${Math.floor(Math.max(0, kalan) / 60)}:${String(Math.floor(Math.max(0, kalan) % 60)).padStart(2, '0')}`;
        el.textContent = camp.alive ? t('kamp.akin', { sure: time, yon: camp.raidSide === world.side ? t('kamp.takimina') : t('kamp.rakibe') }) : t('kamp.kuruluyor', { sure: time });
        el.className = `camp-label${camp.alive ? (camp.raidSide === world.side ? ' danger' : '') : ' ruin'}`;
        el.style.display = 'block'; el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
      }
    },
    /** Kahramanın üstünde beliren "+N kaynak / +N exp" yazısı. */
    float(text, pos, color = '#ffd12e') {
      if (!els.floats || !world.toScreen) return;
      // Sunucudan / simülasyondan gelen yazı dil bağımsız kod olabilir: { kod, ad?, ...değişkenler } (dil standardı).
      if (text && typeof text === 'object') text = t(text.kod, { ...text, ad: text.ad ? t(text.ad) : '' });
      const s = world.toScreen(pos);
      if (!s || !isFinite(s.x) || !isFinite(s.y)) return;
      const el = document.createElement('span');
      el.className = 'float'; el.textContent = text; el.style.color = color;
      el.style.left = `${s.x}px`; el.style.top = `${s.y - 48}px`;
      els.floats.appendChild(el);
      while (els.floats.childElementCount > 12) els.floats.firstElementChild.remove();
      setTimeout(() => el.remove(), 1200);
    },
    demolish() {
      if (deadBlock() || busy()) return;
      const st = sel().structure;
      if (!st) { ping('error'); return; }
      const err = actions.demolish(st);
      if (err) { ping('error'); ui.hint(err, 1.8); return; }
      clearSelection(world); world.heroMenu = false;
      ping('tower'); ui.update();
    },
    select(s, group = false) {
      if (s && s.owner !== world.me) return;
      if (deadBlock()) return;
      if (s && !reachable(s)) { ui.hint(outOfReach(s), 2.2); ping('error'); return; }
      // Her seçim (aynı yapıya yeniden dokunuş dahil) sayılır: dokunmatikte kapalı çekmece yeniden açılır (main.js touchFrame).
      world.selTap = (world.selTap || 0) + 1;
      if (group && s) selectStructureGroup(world, s);
      else setSelection(world, [], s);
      world.placing = null; world.heroMenu = false; ping('select'); ui.update();
    },
    toggleHeroMenu() {
      if (deadBlock()) return;
      if (!sel().structure || sel().structure.kind !== 'banner') { ui.select(world.me.banner); }
      if (!sel().structure || sel().structure.kind !== 'banner') return; // çember dışında: seçim reddedildi, sebebi yazıldı
      world.heroMenu = !world.heroMenu; world.placing = null;
      if (world.heroMenu && !heroNearBanner()) ping('error');
      ping('select'); ui.update();
    },
    heroConvert(key) {
      if (deadBlock() || busy()) return;
      const err = actions.heroConvert(key);
      if (err) { ping('error'); ui.hint(err, 1.8); } else ping('tower');
      ui.update();
    },
    startPlacing(kind) {
      if (deadBlock() || busy()) return;
      const spec = BUILDINGS[kind]; if (!spec || kind === 'banner') return;
      if (world.me.eco.gold < spec.cost || world.me.eco.wood < spec.wood) { ping('error'); ui.hint(t('insa.yetersizOdun', { ad: spec.label, n: spec.wood }), 1.8); return; }
      world.placing = kind; ui.hint(null);
      ui.update();
    },
    confirmPlace(x, z) {
      const kind = world.placing; if (!kind || deadBlock()) return;
      const r = actions.build(kind, x, z);
      if (typeof r === 'string') { ping('error'); ui.hint(r, 1.8); return; }
      world.placing = null; ui.hint(null);
      ui.update();
    },
    /**
     * İmlecin yanındaki kısa yazı: yerleştirme modunda hayalet kırmızıysa neden dikilemediği sürekli yazılır (bkz. main.js
     * updateMarkers -> world.placeError); reddedilen komutun sebebi de kısa süre burada çıkar. seconds=0: kalıcı (mod bitince kalkar).
     */
    hint(text, seconds = 0) { hintText = text || null; hintUntil = text && seconds ? world.clock + seconds : Infinity; },
    updateHint() {
      const el = els.hint; if (!el) return;
      const live = world.placing && world.placeError && world.input.pointer.inside ? world.placeError : null;
      const transient = hintText && world.clock <= hintUntil ? hintText : null;
      const text = transient || live;
      if (!text) { el.hidden = true; return; }
      el.hidden = false; el.textContent = text;
      // Geçici (reddedilen komut) yazısı alt bandın hemen üstünde, ortada durur; canlı yerleştirme hatası imleci izler.
      if (transient) { el.classList.add('fixed'); el.style.left = '50%'; el.style.top = 'auto'; el.style.bottom = '14px'; }
      else { el.classList.remove('fixed'); el.style.bottom = 'auto'; el.style.left = `${world.input.pointer.x}px`; el.style.top = `${world.input.pointer.y}px`; }
    },
    /** Orta tık: düşman varsa bütün ordu ona saldırır, boş yerse toplanma alanı oraya dikilir. */
    setRally(x, z) {
      if (deadBlock() || busy()) return;
      actions.setRally(x, z);
      ping('order'); ui.update();
    },
    cancelModes(keepSelection = false) {
      const had = world.placing || world.heroMenu || (!keepSelection && sel().structure);
      world.placing = null; world.heroMenu = false;
      if (!keepSelection && had) clearSelection(world);
      if (had) ui.update();
      return Boolean(had);
    },
    /** Üretim emri (count kadar; Shift 5, Ctrl 10): seçili binalara ya da sırası en kısa binaya. */
    requestSoldier(key, count = 1) {
      if (deadBlock() || busy()) return;
      const u = typeOf(key); if (!u) return;
      const group = (sel().structures || []).filter(s => s.alive && s.ready && s.kind === u.building);
      const pick = () => (group.length ? group.reduce((a, b) => (b.queue.length < a.queue.length ? b : a)) : bestProducer(world, world.me, u.building));
      let n = 0, err = null, building = pick();
      for (let i = 0; i < count; i++) {
        building = pick() || building;
        err = actions.enqueue(key, building); if (err) break;
        n++;
      }
      if (!n) { ping('error'); if (err) ui.hint(err, 1.8); }
      else { const b = els.cmd.querySelector(`[data-soldier="${key}"]`); if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 240); } }
      ui.update();
    },
    /** Esc ve F1 ekran akışına gider (screens.js). */
    escape() { if (actions.escape) actions.escape(); },
    toggleHelp() { if (actions.toggleHelp) actions.toggleHelp(); },

    update() {
      // Gösteri kipinde panel yok (bkz. gosteri.js): HUD, komut ızgarası ve skor hiç çizilmez.
      if (world.gosteri) return;
      const p = world.player, eco = world.me && world.me.eco;
      if (!eco) return;
      for (const u of [...world.sel.units]) if (!u.alive) world.sel.units.delete(u);
      if (world.sel.structure && !world.sel.structure.alive) world.sel.structure = null;
      // Kahraman uzaklaşınca seçim kalkar, sol menü ana (inşa) menüsüne döner; çember dışında bina yerleştirme de biter.
      if (world.sel.structure && !reachable(world.sel.structure)) { clearSelection(world); world.heroMenu = false; }
      if (world.placing && world.placing !== 'tower' && world.player && world.player.alive && !heroInBase()) world.placing = null;
      const c = countUnits();
      const own = world.me.banner;
      const foes = world.players.filter(q => q.faction !== world.side), allies = world.players.filter(q => q.faction === world.side && q !== world.me);
      if (p) {
        els.health.textContent = `♥ ${Math.ceil(p.hp)}/${p.stats.maxHp}`;
        els.level.textContent = t('hud.seviye', { sv: p.level, a: Math.floor(p.xp || 0), b: xpNeeded(p.level) });
        els.level.title = t('hud.seviye.detay', { sv: p.level, a: Math.floor(p.xp || 0), b: xpNeeded(p.level), as: LEVEL.xp.soldier, is: LEVEL.xp.worker, mn: LEVEL.xp.siege, kh: LEVEL.xp.hero, k: p.heroKills, zorluk: DIFFICULTY[world.difficulty].label });
      }
      els.gold.textContent = `◉ ${eco.gold}`;
      els.wood.textContent = `🪵 ${eco.wood} 🌾 ${eco.food}`;
      els.workers.textContent = `👷 ${workerTotal(world, world.me)}/${world.limits.workers} · ⛏ ${c.gold} 🪓 ${c.wood} 🌾 ${c.food}`;
      const queued = queuedSoldiers(world, world.me);
      els.army.textContent = `⚔ ${c.army}/${world.limits.army}${queued ? ` ⏳${queued}` : ''} · 🛡 ${c.foot} 🏹 ${c.archer} 🐎 ${c.cavalry} 🪨 ${c.siege}`;
      const cnt = (f, k) => structureCount(world, f, k);
      els.towers.textContent = `🏰 ${cnt(world.me, 1)}/${world.limits.towers} 🏠 ${cnt(world.me, 0)}/${world.limits.buildings}`;
      // Rakip hakkında HUD'da bilgi yok (Age of gibi): yalnızca sağ alttaki skor sıralaması. Rakip saldırıya kalkınca sancağın yanında ⚡.
      els.bannerOwn.textContent = `⚑ ${own ? Math.ceil(own.hp) : 0}${foes.some(q => q.ai && q.ai.attacking) ? ' ⚡' : ''}`;
      if (els.allies) {
        els.allies.hidden = !allies.length;
        if (allies.length) {
          els.allies.textContent = `🤝 ${allies.length} · ⚔ ${c.allies}`;
          els.allies.title = allies.map(q => `${q.name}${q.human ? '' : ' (bot)'} ⚔ ${c.allyArmy[q.id] || 0}${q.banner && q.banner.alive ? '' : t('hud.muttefikSancakYikik')}`).join(' · ');
        }
      }
      els.score.hidden = !world.running;
      if (!world.placing && hintText === null) els.hint.hidden = true;
      renderScore();
      renderCmd(); renderInfo();
      root.classList.toggle('placing', Boolean(world.placing));
      if (els.cam) { els.cam.classList.toggle('active', world.cam === 'tps'); els.cam.textContent = world.cam === 'tps' ? t('kamera.izo') : t('kamera.omuz'); }
    },
  };
  return ui;
}
