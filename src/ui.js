import { makeStats } from './characters.js';
import { ANTI, BUILDINGS, DIFFICULTY, HERO_UPGRADE, KIT, LEVEL, QUEUE, RALLY, SOLDIER_TYPES, SPIN, TORNADO, TOWER, antiInfo, heroConvertCost, loadoutKey, respawnDelay } from './config.js';
import { kitKey } from './characters.js';
import { clearSelection, selectStructureGroup, setSelection, unlockPointer } from './input.js';
import { bannerShielded, structureCount } from './structures.js';
import { armyCount, bestProducer, unitClass, workerTotal } from './production.js';
import { damageMult, heroArrows } from './combat.js';
import { dashDistance, dashMult, reachOf, xpNeeded } from './characters.js';

/**
 * Age of tarzı alt bant: solda komut ızgarası (seçili yapının üretimi / inşa, seçili birimlerin komutları),
 * ortada bilgi kartı (can, üretim sırası, birim bilgisi), sağda 2B minimap ve mod / oyun düğmeleri.
 * Üstte HUD. Simülasyona yalnızca world ve actions üzerinden dokunur.
 */
export function createUI(root, world, actions) {
  const $ = sel => root.querySelector(sel);
  const els = {
    health: $('#mg-health'), level: $('#mg-level'), gold: $('#mg-gold'), wood: $('#mg-wood'), workers: $('#mg-workers'), army: $('#mg-army'),
    towers: $('#mg-towers'), enemyTowers: $('#mg-enemy-towers'), bannerOwn: $('#mg-banner-own'), bannerEnemy: $('#mg-banner-enemy'), allies: $('#mg-allies'),
    message: $('#mg-message'), select: $('#mg-select'), end: $('#mg-end'), cmd: $('#mg-cmd'), info: $('#mg-info'), floats: $('#mg-floats'), alert: $('#mg-alert'),
    pause: $('#mg-pause'), newGame: $('#mg-new'), full: $('#mg-full'), cam: $('#mg-cam'),
    selStart: $('#sel-start'), selCancel: $('#sel-cancel'),
    endTitle: $('#end-title'), endText: $('#end-text'), endNew: $('#end-new'),
  };
  let msgTimer = 0, pausedBySelect = false, audio = null, cmdKey = '', infoKey = '';
  /** Kamp -> ekrandaki geri sayım etiketi. */
  const campLabels = new Map();
  let lastAlertMsg = -99;
  const typeOf = key => SOLDIER_TYPES.find(t => t.key === key);
  /** Anti özeti: bu türün tek attığı türler ve bu türü tek atanlar. */
  const antiText = key => { const a = antiInfo(key); if (!a.beats.length && !a.beatenBy.length) return ''; return `Tek atar: ${a.beats.join(', ') || '—'} · Tek atılır: ${a.beatenBy.join(', ') || '—'}`; };
  const antiHtml = key => { const a = antiInfo(key); if (!a.beats.length && !a.beatenBy.length) return ''; return `<div class="anti"><span class="good">⚔ Tek atar: <b>${a.beats.join(', ') || '—'}</b></span> <span class="bad">☠ Tek atılır: <b>${a.beatenBy.join(', ') || '—'}</b></span></div>`; };
  const ping = kind => {
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
  const busy = () => !world.running || world.paused || world.ended || heroDown();
  const deadMsg = () => { if (heroDown()) { ui.say(`Kahraman yerde: ${Math.max(0, respawnDelay(world.player.deaths) - world.player.deathTimer).toFixed(0)} sn sonra doğar, o zamana kadar komut veremezsin`, 1400); ping('error'); return true; } return false; };
  const sel = () => world.sel;

  // ---- Komut ızgarası tıklamaları
  els.cmd.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    // Shift: 5, Ctrl: 10 birim birden sıraya al.
    if (d.soldier) ui.requestSoldier(d.soldier, e.ctrlKey ? QUEUE.batchCtrl : e.shiftKey ? QUEUE.batchShift : 1);
    else if (d.build) ui.startPlacing(d.build);
    else if (d.demolish) ui.demolish();
    else if (d.cancel) ui.cancelModes();
    else if (d.close) ui.cancelModes();
    else if (d.heromenu) ui.toggleHeroMenu();
    else if (d.herotype) ui.heroConvert(d.herotype);
  });
  els.info.addEventListener('click', e => {
    const b = e.target.closest('button[data-q]'); if (!b || !sel().structure || deadMsg()) return;
    actions.cancelQueued(sel().structure, Number(b.dataset.q));
    ui.say('Emir iptal edildi, altın geri verildi', 1200); ui.update();
  });
  els.pause.onclick = () => ui.togglePause();
  els.newGame.onclick = () => ui.showSelect(world.running && !world.ended);
  els.full.onclick = () => actions.toggleFullscreen();
  if (els.cam) els.cam.onclick = () => { actions.toggleCamera(); els.cam.blur(); };
  // Alt bant düğmeleri tık sonrası odağı bırakır: Space / Enter oyuna gider, düğmeyi yeniden tetiklemez.
  for (const b of [els.pause, els.newGame, els.full]) if (b) b.addEventListener('click', () => b.blur());
  els.cmd.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });

  // ---- Başlangıç: zorluk ve takım büyüklüğü (1v1 … 5v5) seçilir; kahraman sabit başlar, oyun içinde geliştirilir.
  const readDifficulty = () => root.querySelector('input[name=difficulty]:checked').value;
  const readTeams = () => { const el = root.querySelector('input[name=teams]:checked'); return el ? Number(el.value) : 1; };
  els.selStart.onclick = () => { els.select.hidden = true; els.end.hidden = true; pausedBySelect = false; actions.newGame({ ...HERO_UPGRADE.startLoadout }, readDifficulty(), readTeams()); };
  els.selCancel.onclick = () => { els.select.hidden = true; if (pausedBySelect) { world.paused = false; pausedBySelect = false; } ui.update(); };
  els.endNew.onclick = () => ui.showSelect(false);

  // ---- Sayımlar
  /**
   * HUD sayımı. Kendi askerlerin sınıfına (piyade / okçu / süvari / mancınık), işçilerin türüne
   * (madenci / oduncu / çiftçi, kademeleri toplanarak) ayrılır; müttefik botların askeri sahibine göre, rakipte yalnızca toplam sayılır.
   */
  const countUnits = () => {
    const c = { army: 0, enemies: 0, workers: 0, enemyWorkers: 0, allies: 0, allyArmy: {}, foot: 0, archer: 0, cavalry: 0, siege: 0, gold: 0, wood: 0, food: 0 };
    for (const e of world.entities) {
      if (!e.alive || e.isPlayer || e.isHero) continue;
      if (e.faction !== 'blue') { if (e.isWorker) c.enemyWorkers += e.tier || 1; else if (!e.isBeast) c.enemies++; continue; }
      if (e.owner !== world.me) { if (!e.isWorker) { c.allies++; c.allyArmy[e.owner.id] = (c.allyArmy[e.owner.id] || 0) + 1; } continue; }
      if (e.isWorker) { c.workers += e.tier || 1; c[e.workerKind] += e.tier || 1; continue; }
      c.army++;
      const cls = unitClass(e);
      if (cls && c[cls] != null) c[cls]++;
    }
    return c;
  };

  // ---- Kahraman geliştirme yardımcıları
  const heroNearBanner = () => { const p = world.player, b = world.me.banner; return p.alive && Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) <= HERO_UPGRADE.range; };
  const heroTypeLabel = p => { const t = SOLDIER_TYPES.find(x => !x.worker && x.weapon === p.loadout.weapon && x.shield === p.loadout.shield && x.horse === p.loadout.horse); return t ? t.label : 'Kılıçlı'; };

  // ---- Komut ızgarası
  /** Düğme etiketinde büyük altın sayısı kısaltılır (150000 -> 150k), küçükler olduğu gibi yazılır. */
  const shortGold = n => (n >= 10000 ? `${Math.round(n / 1000)}k` : `${n}`);
  const costOf = o => [o.cost ? `${shortGold(o.cost)}◉` : '', o.food ? `${o.food}🌾` : '', o.wood ? `${o.wood}🪵` : ''].filter(Boolean).join(' ');
  const slot = (o) => `<button type="button" class="slot${o.active ? ' active' : ''}${o.big ? ' big' : ''}" ${Object.entries(o.data || {}).map(([k, v]) => `data-${k}="${v}"`).join(' ')} title="${o.title || o.label}" ${o.disabled ? 'disabled' : ''}><span class="ico">${o.icon}</span><span class="lbl">${o.label}</span>${o.cost != null ? `<span class="cost">${costOf(o)}</span>` : ''}</button>`;
  function cmdSlots() {
    const s = sel(), out = [], aoe = world.mode === 'aoe';
    if (s.structure && s.structure.kind === 'banner' && world.heroMenu) {
      // Kahraman menüsü: can doldurma ve türe dönüş (sancak yakınında). Seviye altınla alınmaz, exp ile gelir.
      const p = world.player;
      for (const t of SOLDIER_TYPES.filter(x => !x.worker && !x.siege)) {
        const same = p.loadout.weapon === t.weapon && p.loadout.shield === t.shield && p.loadout.horse === t.horse;
        const cc = heroConvertCost(t);
        const kit = KIT[kitKey(t)], kitText = kit ? ` · Sol tık: ${kit.primary} · Sağ tık: atılma + ${kit.secondary}${t.shield ? ' · Kalkan: atılmada daha uzun vurulmazlık' : ''}` : '';
        out.push({ icon: t.icon, label: t.label, cost: cc, data: { herotype: t.key }, active: same, title: (same ? `Şu anki türün: ${t.label}` : `${t.label} ol (${cc.toLocaleString('tr-TR')} altın). Seviyen ve exp'in korunur.`) + kitText });
      }
      out.push({ icon: '↩', label: 'Geri', data: { heromenu: 1 }, title: 'Sancak menüsüne dön' });
      out.push({ icon: '✖', label: 'Kapat', data: { close: 1 }, title: 'Menüyü ve seçimi kapat (Esc ile aynı)' });
      return out;
    }
    if (s.structure) {
      const st = s.structure, spec = BUILDINGS[st.kind];
      if (!st.ready) out.push({ icon: '🔨', label: 'İnşa', title: 'İnşa ediliyor', disabled: true });
      else {
        for (const k of spec.produces) { const t = typeOf(k); out.push({ icon: t.icon, label: t.label, cost: t.cost, food: t.food, wood: t.wood, data: { soldier: t.key }, title: `${t.label}: ${t.cost} altın${t.food ? ` + ${t.food} yiyecek` : ''}${t.wood ? ` + ${t.wood} odun` : ''}, ${t.train} sn${t.siege ? ' · kule menzili dışından her hedefe vurur, kuleyi yeğler' : ''}${t.worker ? ' · sahadaki işçiyle birleşip üretimini artırır' : ''}${antiText(t.key) ? ` · ${antiText(t.key)}` : ''} · Shift: ${QUEUE.batchShift}, Ctrl: ${QUEUE.batchCtrl} tane` }); }
        if (st.kind === 'banner') {
          out.push({ icon: '★', label: 'Geliştir', data: { heromenu: 1 }, title: 'Kahramanı geliştir: altınla seviye atla ya da türe dönüş (kahraman sancağa yakın olmalı)' });
          // Mod geçişi yalnızca burada: kahraman sancağa yakınken.
        }
      }
    } else {
      // Hiçbir şey seçili değilken: bina dikimi doğrudan buradan (sancağa tıklamak gerekmez).
      for (const k of BUILDINGS.banner.builds) { const b = BUILDINGS[k]; out.push({ icon: b.icon, label: b.label, cost: b.cost, wood: b.wood, data: { build: k }, active: world.placing === k, title: `${b.label}: ${b.desc}, ${b.wood} odun, ${b.buildTime} sn (kahramanın 14 birim çevresine)` }); }
    }
    // Seçili kendi yapın (sancak hariç): yıkma düğmesi. Yer açmanın ve yanlış yere dikileni kaldırmanın yolu.
    if (s.structure && s.structure.owner === world.me && s.structure.kind !== 'banner') {
      const tower = s.structure.kind === 'tower';
      out.push({ icon: '🧨', label: tower ? 'Kuleyi yık' : 'Binayı yık', data: { demolish: 1 }, title: tower ? 'Seçili kuleyi yık: kule sınırından düşer, enkazından odun çıkar' : 'Seçili binayı yık: bina sınırından düşer, enkazından odun çıkar' });
    }
    if (world.placing) out.push({ icon: '✖', label: 'Vazgeç', data: { cancel: 1 }, title: 'Açık modu bırak' });
    // Seçili yapı varken menüyü kapatma düğmesi (Esc ile aynı iş).
    else if (s.structure) out.push({ icon: '✖', label: 'Kapat', data: { close: 1 }, title: 'Seçimi ve menüyü kapat (Esc ile aynı)' });
    return out;
  }
  function renderCmd() {
    const s = sel(), slots = cmdSlots();
    // Anahtar yalnızca **düğmelerin kendisi** değişince değişmeli: kahramanın canı buraya girerse can yenilenirken
    // (sancak alanında saniyede 9 can) ızgara her karede baştan yazılır, düğmeler pırpır eder ve tıklama kaybolur.
    const key = world.mode + '|' + (s.structure ? `S${s.structure.id}:${s.structure.ready}:${world.heroMenu ? 'H' + world.player.level : ''}` : `U${s.units.size}`) + '|' + slots.map(o => o.label + (o.active ? '*' : '')).join(',');
    if (key !== cmdKey) {
      cmdKey = key;
      let html = slots.map(slot).join('');
      for (let i = slots.length; i < 15; i++) html += '<span class="slot empty"></span>';
      els.cmd.innerHTML = html;
    }
    const eco = world.me.eco, b = busy();
    // Nüfus sınırı dolan tür basılamaz: düğme kapanır.
    for (const el of els.cmd.querySelectorAll('button[data-soldier]')) {
      const t = typeOf(el.dataset.soldier);
      // İşçide sınır düğmeyi kapatmaz: sınır doluyken yeni işçi en kalabalık türün yerine geçer.
      const capped = !t.worker && armyCount(world, world.me) >= world.limits.army;
      el.disabled = b || capped || eco.gold < t.cost || eco.food < t.food;
    }
    // Kule / bina sınırı dolunca inşa düğmesi de kapanır.
    for (const el of els.cmd.querySelectorAll('button[data-build]')) {
      const kind = el.dataset.build, spec = BUILDINGS[kind], tower = kind === 'tower';
      const capped = structureCount(world, world.me, tower) >= (tower ? world.limits.towers : world.limits.buildings);
      el.disabled = b || capped || eco.gold < spec.cost || eco.wood < spec.wood;
    }
    const hn = heroNearBanner();
    for (const el of els.cmd.querySelectorAll('button[data-herotype]')) { const t = typeOf(el.dataset.herotype); el.disabled = b || !hn || eco.gold < heroConvertCost(t); }
  }

  // ---- Bilgi kartı
  const bar = (hp, max, cls = '') => `<div class="bar ${cls}"><i data-bar style="width:${Math.max(0, Math.min(100, hp / max * 100))}%"></i></div>`;
  const unitStats = e => { const w = e.stats.weapon; if (e.isSiege) return `Kuleye ${Math.round(w.damage * TOWER.siegeDamageMult)} · Menzil ${w.range} (kule menzilinin dışı) · ${w.cooldown} sn'de bir`; const r = reachOf(e), dm = damageMult(e);
    return `${w.ranged ? 'Ok' : 'Vuruş'} ${Math.round(w.damage * dm)}${dm > 1.001 ? ` (x${dm.toFixed(2)} sv ${e.level})` : ''} · Menzil ${r.range.toFixed(1)}${r.range > w.range + 0.05 ? ` (sv ${e.level})` : ''} · Hız ${e.stats.speed.toFixed(1)}${e.loadout.shield ? ' · Kalkan' : ''}${antiHtml(e.typeKey || loadoutKey(e.loadout))}`; };
  function renderInfo(c) {
    const s = sel(), p = world.player, aoe = world.mode === 'aoe';
    let key, html;
    if (s.structure) {
      const st = s.structure, spec = BUILDINGS[st.kind];
      // Toplu seçim (çift tık): aynı türden kaç bina seçili ve toplam sırada kaç emir var.
      const grp = (s.structures || []).filter(o => o.alive);
      const many = grp.length > 1 ? grp : null;
      const totalQ = many ? many.reduce((a, o) => a + o.queue.length, 0) : st.queue.length;
      key = `S${st.id}|${st.ready}|${st.queue.join(',')}|${many ? many.length + ':' + totalQ : ''}`;
      html = `<div class="card"><div class="ico">${spec.icon}</div><div class="body"><h3>${many ? `${many.length} × ${spec.label}` : spec.label}</h3>${bar(st.hp, st.maxHp)}<div class="line"><span data-hp>♥ ${Math.ceil(st.hp)}/${st.maxHp}</span>${st.ready ? '' : `<span data-build>İnşa %${Math.round((1 - st.buildTimer / st.buildTime) * 100)}</span>`}${st.kind === 'tower' ? `<span>Menzil ${TOWER.range} · Askeri tek okta öldürür</span>` : ''}${st.kind === 'banner' ? (bannerShielded(world, st) ? '<span>🛡 Kuleler ayakta: vuruş iner ama can azalmaz</span>' : '<span>⚠ Kule yok: sancak can kaybeder!</span>') : ''}</div>`;
      if (st.ready && spec.produces.length) {
        html += `<div class="queue">${st.queue.map((k, i) => `<button type="button" class="q" data-q="${i}" title="${typeOf(k).label} · iptal için tıkla"><span>${typeOf(k).icon}</span>${i === 0 ? '<i class="prog" data-prog></i>' : ''}</button>`).join('')}<span class="qn" data-qn>${st.queue.length}/${QUEUE.max}</span></div>`;
        html += `<div class="hint">${many ? `${many.length} bina seçili · toplam sırada ${totalQ} emir · basılan birim en boş binaya gider. ` : ''}${st.queue.length ? `Sıradaki: ${typeOf(st.queue[0]).label} <span data-left></span>` : 'Sıra boş: soldan birim seç, 30 emre kadar birikir'}</div>`;
      }
      html += '</div></div>';
    } else if (s.units.size) {
      const list = [...s.units].filter(e => e.alive);
      if (list.length === 1) {
        const e = list[0], t = e.isPlayer ? null : typeOf(e.typeKey);
        key = `U${e.id}|${e.isPlayer ? p.level + heroTypeLabel(p) : ''}`;
        html = `<div class="card"><div class="ico">${e.isPlayer ? '★' : t ? t.icon : '?'}</div><div class="body"><h3>${e.isPlayer ? `Kahraman · ${heroTypeLabel(p)}` : t ? t.label : 'Birim'}${e.isPlayer ? ` · Sv ${p.level}` : ''}</h3>${bar(e.hp, e.stats.maxHp)}<div class="line"><span data-hp>♥ ${Math.ceil(e.hp)}/${e.stats.maxHp}</span></div><div class="hint">${e.isWorker ? `İşçi x${e.tier || 1}: kendi kaynağında çalışır, çalışma başına ${e.tier || 1} ürün çıkarır, emir almaz` : unitStats(e)}</div></div></div>`;
      } else {
        const groups = {};
        for (const e of list) { const k = e.isPlayer ? '★' : typeOf(e.typeKey).icon; groups[k] = (groups[k] || 0) + 1; }
        key = `M${list.length}|${Object.entries(groups).map(([k, n]) => k + n).join('')}`;
        html = `<div class="card"><div class="ico">⚔</div><div class="body"><h3>${list.length} birim seçili</h3><div class="groups">${Object.entries(groups).map(([k, n]) => `<span>${k}<b>${n}</b></span>`).join('')}</div><div class="hint">Ordu tek tek yönetilmez: orta tıkla toplanma alanı kur, bütün ordu oraya yürür</div></div></div>`;
      }
    } else if (!aoe) {
      // Hiçbir şey seçili değilken: kahramanın durumu (seviye, can, exp, vuruş) **ve** sancağının durumu bir arada.
      const own = world.me.banner, shielded = bannerShielded(world, own);
      const towers = world.structures.filter(t => t.alive && t.kind === 'tower' && t.owner === world.me).length;
      key = `H|${p.level}|${p.stats.maxHp}|${heroTypeLabel(p)}|${Math.ceil(own.hp)}|${towers}`;
      const name = heroTypeLabel(p);
      html = `<div class="card"><div class="ico">★</div><div class="body"><h3>Kahraman · ${name} · Sv ${p.level}</h3>${bar(p.hp, p.stats.maxHp)}<div class="line"><span data-hp>♥ ${Math.ceil(p.hp)}/${p.stats.maxHp}</span><span>${unitStats(p)}</span></div><div class="line"><span data-banner>⚑ Sancak ${Math.ceil(own.hp)}/${own.maxHp}</span><span>${shielded ? `🛡 ${towers} kule koruyor: can azalmaz` : '⚠ Kule yok: sancak can kaybeder!'}</span><span>★ Sv ${p.level} · ${Math.floor(p.xp || 0)}/${xpNeeded(p.level)} exp</span></div><div class="bar banner"><i data-bbar style="width:${Math.max(0, Math.min(100, own.hp / own.maxHp * 100))}%"></i></div><div class="kitkeys">${(() => { const k = KIT[kitKey(p.loadout)] || KIT.sword; return `<b>Sol tık</b><span>${k.primary} — ${k.primaryDesc}</span>${k.charge ? `<b>Basılı tut</b><span>0.6 sn şarj → ${k.charge} — ${k.chargeDesc}</span>` : ''}<b>Sağ tık</b><span>${dashDistance(p).toFixed(1)} birim atılma + ${k.secondary} — ${k.secondaryDesc}${p.loadout.shield ? '; kalkanla atılmada vurulmazlık uzar' : ''}</span>`; })()}</div></div></div>`;
    } else {
      key = 'A';
      html = `<div class="card"><div class="ico">🏳</div><div class="body"><h3>Komutan modu</h3><div class="hint">Ordu tek tek yönetilmez: orta tıkla <b>toplanma alanını</b> kur; askerler oraya gidip yalnızca orada dövüşür. Sol tık: kendi yapını seç · Soldan bina dik · WASD / ok tuşları / minimap: kamera · Sancak > <b>Kahraman</b>: kahraman moduna dön</div></div></div>`;
    }
    if (key !== infoKey) { infoKey = key; els.info.innerHTML = html; return; }
    // Dinamik alanlar
    const st = s.structure;
    if (st) {
      const hp = els.info.querySelector('[data-hp]'); if (hp) hp.textContent = `♥ ${Math.ceil(st.hp)}/${st.maxHp}`;
      const b = els.info.querySelector('[data-bar]'); if (b) b.style.width = `${Math.max(0, st.hp / st.maxHp * 100)}%`;
      const bd = els.info.querySelector('[data-build]'); if (bd) bd.textContent = `İnşa %${Math.round((1 - st.buildTimer / st.buildTime) * 100)}`;
      if (st.queue.length) {
        const t = typeOf(st.queue[0]);
        const pr = els.info.querySelector('[data-prog]'); if (pr) pr.style.height = `${(1 - st.progress / t.train) * 100}%`;
        const lf = els.info.querySelector('[data-left]'); if (lf) lf.textContent = `${Math.max(0, t.train - st.progress).toFixed(1)} sn`;
      }
    } else {
      const e = s.units.size === 1 ? [...s.units][0] : !aoe ? p : null;
      if (e) {
        const hp = els.info.querySelector('[data-hp]'); if (hp) hp.textContent = `♥ ${Math.ceil(e.hp)}/${e.stats.maxHp}`;
        const b = els.info.querySelector('[data-bar]'); if (b) b.style.width = `${Math.max(0, e.hp / e.stats.maxHp * 100)}%`;
      }
      // Kahraman kartındaki sancak satırı.
      const own = world.me.banner;
      const bh = els.info.querySelector('[data-banner]'); if (bh && own) bh.textContent = `⚑ Sancak ${Math.ceil(own.hp)}/${own.maxHp}`;
      const bb = els.info.querySelector('[data-bbar]'); if (bb && own) bb.style.width = `${Math.max(0, own.hp / own.maxHp * 100)}%`;
    }
    void c;
  }

  const ui = {
    say(text, ms = 2600) {
      els.message.textContent = text; els.message.hidden = false;
      clearTimeout(msgTimer);
      if (ms > 0) msgTimer = setTimeout(() => { els.message.hidden = true; }, ms);
    },
    ping,
    flash(key) {
      const el = els[key]; if (!el) return;
      el.classList.add('flash'); clearTimeout(flashTimers[key]);
      flashTimers[key] = setTimeout(() => el.classList.remove('flash'), 220);
    },
    showSelect(cancelable) {
      ui.cancelModes(true); clearSelection(world); unlockPointer();
      if (cancelable && !world.paused) { world.paused = true; pausedBySelect = true; }
      els.selCancel.hidden = !cancelable;
      els.selStart.textContent = world.running && !world.ended ? 'Yeni oyuna başla' : 'Savaşı başlat';
      els.end.hidden = true; els.select.hidden = false;
      ui.update();
    },
    showEnd(title, text) { ui.cancelModes(true); unlockPointer(); els.endTitle.textContent = title; els.endText.textContent = text; els.end.hidden = false; },
    togglePause() {
      if (!world.running || world.ended || !els.select.hidden) return;
      world.paused = !world.paused;
      if (world.paused) unlockPointer();
      ui.say(world.paused ? 'Duraklatıldı' : 'Devam', world.paused ? 0 : 1200);
      ui.update();
    },
    // Komutan modu kaldırıldı: oyun hep kahraman modunda oynanır, ordu tek toplanma alanıyla (orta tık) yönetilir.

    // ---- Seçim
    /** Saldırı uyarısı: ekranın kenarları kısa süre kızarır ve üstte kırmızı bir uyarı yazısı çıkar. */
    alert(text) {
      if (els.alert) {
        els.alert.classList.remove('on');
        // Sınıfı yeniden eklemeden önce tarayıcının animasyonu sıfırlaması için düzeni zorla.
        void els.alert.offsetWidth;
        els.alert.classList.add('on');
      }
      if (world.clock - (lastAlertMsg || -99) > 4) { lastAlertMsg = world.clock; ui.say(text, 1800); ping('error'); }
    },
    /**
     * Kampların üstündeki geri sayımlar: akıncı kampta bir sonraki dalgaya kalan süre, yıkık kampta yeniden
     * kurulmasına kalan süre. Yazılar her karede kampın ekran konumuna taşınır; sisin altındaki kamp gizlenir.
     */
    /** Şarj çubuğu: sol tık basılıyken kahramanın üstünde dolar, dolunca altın renk alır. */
    /**
     * Yeniden doğuş geri sayımı: kahraman yerdeyken ekranın ortasında büyük sayı; her saniye değişince büyüyüp küçülen
     * animasyon yeniden başlar (sınıf kaldırılıp eklenir). Son saniyede yeşile döner; sancak yıkıksa geri sayım yok.
     */
    updateRespawn() {
      const el = root.querySelector('#mg-respawn'); if (!el) return;
      const p = world.player, banner = world.me && world.me.banner;
      if (!p || p.alive || world.ended || !banner || !banner.alive) { el.hidden = true; el.dataset.n = ''; return; }
      const left = Math.max(0, respawnDelay(p.deaths) - p.deathTimer), n = Math.ceil(left);
      el.hidden = false;
      const num = el.querySelector('.num');
      if (el.dataset.n !== String(n)) {
        el.dataset.n = String(n);
        num.textContent = n;
        num.classList.toggle('final', n <= 1);
        // Animasyonu her sayıda baştan oynat.
        num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
        el.querySelector('.sub').textContent = `${p.deaths}. ölüm · sancakta yeniden doğarsın`;
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
      // Yeni oyunda eski kampların etiketleri kalmasın.
      for (const [camp, el] of campLabels) if (!world.camps.includes(camp)) { el.remove(); campLabels.delete(camp); }
      for (const camp of world.camps) {
        let el = campLabels.get(camp);
        if (!el) { el = document.createElement('span'); el.className = 'camp-label'; els.floats.appendChild(el); campLabels.set(camp, el); }
        const show = camp.seen && world.fog && world.fog.isVisible(camp.pos.x, camp.pos.z);
        if (!show) { el.style.display = 'none'; continue; }
        const s = world.toScreen({ x: camp.pos.x, y: camp.alive ? 5.4 : 2.2, z: camp.pos.z });
        if (!s || !isFinite(s.x)) { el.style.display = 'none'; continue; }
        const t = camp.alive ? camp.waveTimer : camp.respawnTimer;
        const time = `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
        el.textContent = camp.alive
          ? `⛺ akın ${time} ${camp.raidSide === 'blue' ? (world.players.length > 2 ? '→ takımına' : '→ sana') : '→ rakibe'}`
          : `🔥 yeniden kuruluyor ${time}`;
        el.className = `camp-label${camp.alive ? (camp.raidSide === 'blue' ? ' danger' : '') : ' ruin'}`;
        el.style.display = 'block';
        el.style.left = `${s.x}px`;
        el.style.top = `${s.y}px`;
      }
    },
    /**
     * Kahramanın üstünde beliren "+N kaynak / +N exp" yazısı: dünya konumu ekrana çevrilir, yazı yukarı süzülüp söner.
     * Aynı anda çok yazı birikmesin diye en fazla 12 tanesi durur.
     */
    float(text, pos, color = '#ffd12e') {
      if (!els.floats || !world.toScreen) return;
      const s = world.toScreen(pos);
      if (!s || !isFinite(s.x) || !isFinite(s.y)) return;
      const el = document.createElement('span');
      el.className = 'float';
      el.textContent = text;
      el.style.color = color;
      el.style.left = `${s.x}px`;
      el.style.top = `${s.y - 48}px`;
      els.floats.appendChild(el);
      while (els.floats.childElementCount > 12) els.floats.firstElementChild.remove();
      setTimeout(() => el.remove(), 1200);
    },
    /** Seçili yapıyı yıkar (sancak hariç): sınırdan düşer, yerine yenisi dikilebilir. */
    demolish() {
      if (deadMsg() || busy()) return;
      const st = sel().structure;
      if (!st) { ui.say('Önce bir yapı seç', 1400); ping('error'); return; }
      const err = actions.demolish(st);
      if (err) { ui.say(err, 1600); ping('error'); return; }
      clearSelection(world); world.heroMenu = false;
      ping('tower'); ui.update();
    },
    /** Yapı seçimi. group=true (çift tık): aynı türdeki bütün binalar seçilir, üretim aralarında paylaştırılır. */
    select(s, group = false) {
      if (s && s.owner !== world.me) return;
      if (deadMsg()) return;
      if (group && s) { const n = selectStructureGroup(world, s); if (n > 1) ui.say(`${n} ${BUILDINGS[s.kind].label} seçildi: üretim hepsine dağıtılır`, 1800); }
      else setSelection(world, [], s);
      world.placing = null; world.heroMenu = false; ping('select'); ui.update();
    },
    toggleHeroMenu() {
      if (deadMsg()) return;
      if (!sel().structure || sel().structure.kind !== 'banner') { ui.select(world.me.banner); }
      world.heroMenu = !world.heroMenu; world.placing = null;
      if (world.heroMenu && !heroNearBanner()) ui.say('Kahraman sancağa yaklaşmalı (12 birim)', 1600);
      ping('select'); ui.update();
    },
    heroConvert(key) {
      if (deadMsg() || busy()) return;
      const err = actions.heroConvert(key);
      if (err) { ui.say(err, 1500); ping('error'); } else { ping('tower'); }
      ui.update();
    },

    // ---- Modlar
    startPlacing(kind) {
      if (deadMsg() || busy()) return;
      const spec = BUILDINGS[kind]; if (!spec || kind === 'banner') return;
      if (world.me.eco.gold < spec.cost || world.me.eco.wood < spec.wood) { ui.say(`Yetersiz odun: ${spec.label} ${spec.wood} odun`, 1500); ping('error'); return; }
      world.placing = kind;
      ui.say(`${spec.label} (${spec.wood} 🪵): kahramanın çevresindeki halka içine sol tıkla · sağ tık / Esc / Vazgeç düğmesi`, 0); ui.update();
    },
    confirmPlace(x, z) {
      const kind = world.placing; if (!kind || deadMsg()) return;
      const r = actions.build(kind, x, z);
      if (typeof r === 'string') { ui.say(r, 1500); ping('error'); return; }
      world.placing = null;
      ui.say(`${BUILDINGS[kind].label} kuruluyor (-${BUILDINGS[kind].wood} 🪵), ${BUILDINGS[kind].buildTime} sn`, 2200); ui.update();
    },
    /** Orta tık: ordunun toplanma alanını (x, z)'ye diker; bütün askerler oraya yürür (kahraman yerde ya da oyun duruksa yok). */
    setRally(x, z) {
      if (deadMsg() || busy()) return;
      const n = actions.setRally(x, z);
      ui.say(`${RALLY.label} kuruldu${n ? ` · ${n} asker yola çıktı` : ''} · orta tıkla taşınır`, 1800); ping('order'); ui.update();
    },
    /** Açık bir mod (inşa / kahraman menüsü / seçim) varsa kapatır ve true döner. */
    cancelModes(keepSelection = false) {
      const had = world.placing || world.heroMenu || (!keepSelection && sel().structure);
      world.placing = null; world.heroMenu = false;
      if (!keepSelection && had) clearSelection(world);
      if (had) { els.message.hidden = true; ui.update(); }
      return Boolean(had);
    },
    /**
     * Üretim emri (count kadar; Shift 5, Ctrl 10): seçili bina uyuyorsa yalnızca ona, yoksa o türü basan binalardan
     * **sırası en kısa olanına** verilir; toplu basımda emirler binalara dağılır, paralel çıkarlar.
     * Kaynak ya da sıra bitince durur ve kaçının alındığını söyler.
     */
    requestSoldier(key, count = 1) {
      if (deadMsg() || busy()) return;
      const t = typeOf(key); if (!t) return;
      // Seçili binalar (çift tıkla tür seçimi) varsa emirler yalnızca onlara, en boş olandan başlayarak dağıtılır.
      const group = (sel().structures || []).filter(s => s.alive && s.ready && s.kind === t.building);
      const pick = () => (group.length
        ? group.reduce((a, b) => (b.queue.length < a.queue.length ? b : a))
        : bestProducer(world, world.me, t.building));
      let n = 0, err = null, building = pick();
      const used = new Set();
      for (let i = 0; i < count; i++) {
        building = pick() || building;
        err = actions.enqueue(key, building); if (err) break;
        n++; used.add(building);
      }
      if (!n) { ui.say(err, 1600); ping('error'); }
      else {
        const shops = used.size > 1 ? ` · ${used.size} binada paralel` : '';
        ui.say(`${n > 1 ? n + ' ' : ''}${t.label} sıraya alındı (${building.queue.length}/${QUEUE.max})${shops} · ${t.train} sn${err && n < count ? ` · ${err}` : ''}`, 1600);
        const b = els.cmd.querySelector(`[data-soldier="${key}"]`); if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 240); }
      }
      ui.update();
    },

    update() {
      const p = world.player, eco = world.me && world.me.eco;
      if (!p || !eco) return;
      for (const u of [...world.sel.units]) if (!u.alive) world.sel.units.delete(u);
      if (world.sel.structure && !world.sel.structure.alive) world.sel.structure = null;
      const c = countUnits();
      const own = world.me.banner;
      const foes = world.players.filter(q => q.faction === 'red'), allies = world.players.filter(q => q.faction === 'blue' && q !== world.me);
      els.health.textContent = `♥ ${Math.ceil(p.hp)}/${p.stats.maxHp}`;
      els.level.textContent = `★ ${p.level} · ${Math.floor(p.xp || 0)}/${xpNeeded(p.level)} exp`;
      els.level.title = `Seviye ${p.level} · ${Math.floor(p.xp || 0)}/${xpNeeded(p.level)} exp (asker ${LEVEL.xp.soldier}, işçi ${LEVEL.xp.worker}, mancınık ${LEVEL.xp.siege}, kahraman ${LEVEL.xp.hero}) · ${p.heroKills} öldürme · can ${p.stats.maxHp} · ${DIFFICULTY[world.difficulty].label}`;
      els.gold.textContent = `◉ ${eco.gold}`;
      els.wood.textContent = `🪵 ${eco.wood} 🌾 ${eco.food}`;
      // Kendi tarafın: işçiler ve askerler tür tür; rakip tarafta yalnızca kule sayısı ve sancak canı.
      els.workers.textContent = `👷 ${workerTotal(world, world.me)}/${world.limits.workers} · ⛏ ${c.gold} 🪓 ${c.wood} 🌾 ${c.food}`;
      els.workers.title = `İşçilerin (kademeleriyle): ${c.gold} madenci · ${c.wood} oduncu · ${c.food} çiftçi · toplam en fazla ${world.limits.workers}; sınır dolunca yeni işçi en kalabalık türden bir kademe eksiltip onun yerine geçer`;
      els.army.textContent = `⚔ ${c.army}/${world.limits.army} · 🛡 ${c.foot} 🏹 ${c.archer} 🐎 ${c.cavalry} 🪨 ${c.siege}`;
      els.army.title = `Ordun: ${c.foot} piyade · ${c.archer} okçu · ${c.cavalry} süvari · ${c.siege} mancınık · toplam ${c.army} (sınır ${world.limits.army}; dolunca üretim durur)`;
      const cnt = (f, k) => structureCount(world, f, k);
      els.towers.textContent = `🏰 ${cnt(world.me, 1)}/${world.limits.towers} 🏠 ${cnt(world.me, 0)}/${world.limits.buildings}`;
      els.towers.title = `Ayakta kulelerin (en fazla ${world.limits.towers}) ve binaların (en fazla ${world.limits.buildings}); sınır dolunca birini yıkabilirsin`;
      // Rakip tarafı: takım oyununda kule toplamı ve ayakta sancak sayısı; 1v1'de eskisi gibi kule ve sancak canı.
      const foeTowers = foes.reduce((a, q) => a + cnt(q, 1), 0), attacking = foes.some(q => q.ai && q.ai.attacking);
      const aliveFoes = foes.filter(q => q.banner && q.banner.alive);
      els.enemyTowers.textContent = foes.length > 1 ? `🏰 ${foeTowers}` : `🏰 ${foeTowers}/${world.limits.towers}`;
      els.enemyTowers.title = foes.length > 1 ? `Rakip takımın ayakta kule toplamı: ${foes.map(q => `${q.name} ${cnt(q, 1)}`).join(' · ')}` : 'Rakibin ayakta kule sayısı: kuleler durdukça sancağı can kaybetmez';
      els.bannerOwn.textContent = `⚑ ${Math.ceil(own.hp)}`;
      els.bannerEnemy.textContent = foes.length > 1 ? `⚑ ${aliveFoes.length}/${foes.length}${attacking ? ' ⚡' : ''}` : `⚑ ${Math.ceil(foes[0].banner.hp)}${attacking ? ' ⚡' : ''}`;
      els.bannerEnemy.title = foes.length > 1
        ? `Rakip sancakları (ayakta / toplam) · ${foes.map(q => `${q.name}: ${q.banner.alive ? `sancak ${Math.ceil(q.banner.hp)}` : 'sancağı yıkık'}${q.ai && q.ai.attacking ? ' · saldırıda' : ''}`).join(' · ')}`
        : attacking ? 'Rakip ordusu saldırıda!' : 'Düşman sancağının canı';
      if (els.allies) {
        els.allies.hidden = !allies.length;
        if (allies.length) {
          els.allies.textContent = `🤝 ${allies.length} · ⚔ ${c.allies}`;
          els.allies.title = `Müttefik botlar ve askerleri: ${allies.map(q => `${q.name} ⚔ ${c.allyArmy[q.id] || 0}${q.banner.alive ? '' : ' (sancağı yıkık)'}${q.ai && q.ai.attacking ? ' · saldırıda' : ''}`).join(' · ')}`;
        }
      }
      els.pause.textContent = world.paused ? 'Devam' : 'Duraklat';
      renderCmd(); renderInfo(c);
      root.classList.toggle('placing', Boolean(world.placing));
      root.classList.toggle('aoe', world.mode === 'aoe');
      if (els.cam) { els.cam.classList.toggle('active', world.cam === 'tps'); els.cam.textContent = world.cam === 'tps' ? '🎥 İzometrik' : '🎥 Omuz üstü'; }
    },
  };
  return ui;
}
