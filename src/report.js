import { SOLDIER_TYPES } from './config.js';
import { DIL, sayi, t } from './dil.js';

/**
 * Bitiş karnesi (bkz. stats.js buildReport): dört sekme — Özet (sonuç, süre, alan şampiyonları), Sıralama (tablo,
 * sütuna tıkla sırala), Zaman çizelgesi (canvas grafik: skor / asker / kaynak / seviye), Ordu (tür başına basılan,
 * kaybedilen, öldürülen). "Sonucu kopyala" sıralamayı metin olarak panoya alır.
 */
const FIELDS = [['military', t('karne.askeri')], ['economy', t('karne.ekonomi')], ['build', t('karne.insa')], ['hero', t('karne.kahraman')], ['total', t('karne.toplam')]];
const fmt = n => sayi(Math.round(n));
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const typeLabel = k => { const u = SOLDIER_TYPES.find(x => x.key === k); return u ? u.label : k === 'hero' ? t('birim.hero.ad') : k; };
const typeIcon = k => { const u = SOLDIER_TYPES.find(x => x.key === k); return u ? u.icon : k === 'hero' ? '★' : k; };
/**
 * Ordu sütun sırası: önce işçiler, sonra askerler **güçsüzden güçlüye** (bedel sırası: kılıçlı 9 ... kalkanlı atlı 33,
 * mancınık 45), en sonda kahraman. Eşit bedelde SOLDIER_TYPES sırası korunur.
 */
function armyOrder(keys) {
  const idx = k => SOLDIER_TYPES.findIndex(t => t.key === k);
  const rank = k => { const u = SOLDIER_TYPES.find(x => x.key === k); if (k === 'hero') return [2, 0]; if (!u) return [3, 0]; return [u.worker ? 0 : 1, u.worker ? 0 : u.cost]; };
  return [...keys].sort((a, b) => { const ra = rank(a), rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1] || idx(a) - idx(b); });
}

export function renderReport(card, report, world, actions) {
  const me = world.me ? report.players.find(p => p.id === world.me.id) : null;
  const win = resultFor(report, me) === 'victory';
  const sorted = [...report.players].sort((a, b) => b.score.total - a.score.total);
  const rank = me ? sorted.indexOf(me) + 1 : 0;
  const CH = { military: t('karne.sampiyon.military'), economy: t('karne.sampiyon.economy'), build: t('karne.sampiyon.build'), hero: t('karne.sampiyon.hero'), deaths: t('karne.sampiyon.deaths') };
  const nameOf = id => { const p = report.players.find(q => q.id === id); return p ? `<i class="dot" style="background:${p.color}"></i>${esc(p.name)}` : '—'; };
  let tab = 'summary', sortKey = 'total';

  const summary = () => `
    <div class="result ${win ? 'win' : 'lose'}"><b>${win ? t('karne.zafer') : t('karne.yenilgi')}</b><span>${mmss(report.time)} · ${report.teamSize}v${report.teamSize} · ${['easy', 'normal', 'hard'].includes(report.difficulty) ? t(`zorluk.${report.difficulty}`) : report.difficulty}</span></div>
    ${me ? `<div class="mine">${t('karne.sen', { puan: fmt(me.score.total), sira: rank, sv: me.level })}</div>` : ''}
    <div class="champs">${Object.entries(CH).map(([k, label]) => `<div class="champ"><span class="crown">👑</span><span class="lbl">${label}</span><span class="who">${nameOf(report.champions[k])}</span></div>`).join('')}</div>`;

  const ranking = () => {
    const list = [...report.players].sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name, DIL) : b.score[sortKey] - a.score[sortKey]));
    return `<table class="rank"><thead><tr><th>#</th><th data-sort="name">${t('karne.oyuncu')}</th>${FIELDS.map(([k, l]) => `<th data-sort="${k}" class="${sortKey === k ? 'on' : ''}">${l}</th>`).join('')}</tr></thead><tbody>
      ${list.map((p, i) => `<tr class="${me && p.id === me.id ? 'me' : ''} ${p.faction}"><td>${i + 1}</td><td><i class="dot" style="background:${p.color}"></i>${esc(p.name)}${p.human ? '' : ' <small>bot</small>'}${p.alive ? '' : ` <small>${t('karne.sancagiYikik')}</small>`}</td>${FIELDS.map(([k]) => `<td>${fmt(p.score[k])}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
  };

  const army = () => {
    const keys = new Set();
    for (const p of report.players) for (const o of [p.st.unitsMade, p.st.unitsLost, p.st.kills]) for (const k of Object.keys(o)) keys.add(k);
    const cols = armyOrder(keys);
    return `<table class="army"><thead><tr><th>${t('karne.oyuncu')}</th><th></th>${cols.map(k => `<th class="ico" title="${esc(typeLabel(k))}">${typeIcon(k)}</th>`).join('')}<th>${t('karne.hasar')}</th></tr></thead><tbody>
      ${report.players.map(p => `<tr class="${p.faction} ${me && p.id === me.id ? 'me' : ''}"><td rowspan="3"><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</td><td>${t('karne.basti')}</td>${cols.map(k => `<td>${p.st.unitsMade[k] || ''}</td>`).join('')}<td rowspan="3">${fmt(p.st.dmgDealt)} / ${fmt(p.st.dmgTaken)}</td></tr>
        <tr class="${p.faction}"><td>${t('karne.kaybetti')}</td>${cols.map(k => `<td>${p.st.unitsLost[k] || ''}</td>`).join('')}</tr>
        <tr class="${p.faction}"><td>${t('karne.oldurdu')}</td>${cols.map(k => `<td>${p.st.kills[k] || ''}</td>`).join('')}</tr>`).join('')}
      </tbody></table><p class="hint">${t('karne.hasarNot')}</p>`;
  };

  let series = 0;
  const timeline = () => `<div class="chartbar"><label><input type="radio" name="tl" value="0" checked> ${t('karne.skor')}</label><label><input type="radio" name="tl" value="1"> ${t('karne.asker')}</label><label><input type="radio" name="tl" value="3"> ${t('karne.kaynak')}</label><label><input type="radio" name="tl" value="4"> ${t('karne.seviye')}</label><label><input type="radio" name="tl" value="5"> ${t('karne.yapi')}</label></div><canvas id="tl-canvas" width="860" height="300"></canvas><div class="legend">${report.players.map(p => `<span><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</span>`).join('')}</div>`;

  function drawChart() {
    const c = card.querySelector('#tl-canvas'); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height, pad = { l: 46, r: 10, t: 10, b: 24 };
    ctx.clearRect(0, 0, W, H);
    const rows = report.timeline; if (!rows.length) return;
    let max = 1; for (const r of rows) for (const v of r.p) max = Math.max(max, v[series]);
    const tMax = Math.max(1, rows[rows.length - 1].t);
    const X = t => pad.l + (W - pad.l - pad.r) * t / tMax, Y = v => H - pad.b - (H - pad.t - pad.b) * v / max;
    // Koyu zemin (modalla aynı): oyuncu renkleri üstünde belirgin durur, kılavuz çizgileri silik kalır.
    ctx.fillStyle = '#1c231b'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#8f9d85'; ctx.lineWidth = 1; ctx.fillStyle = '#9fae94'; ctx.font = '11px system-ui';
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.globalAlpha = 0.18; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(fmt(v), 4, y + 4); }
    for (let t = 0; t <= tMax; t += Math.max(60, Math.ceil(tMax / 8 / 60) * 60)) ctx.fillText(mmss(t), X(t) - 12, H - 6);
    report.players.forEach((p, i) => {
      ctx.strokeStyle = p.color; ctx.lineWidth = me && p.id === me.id ? 3 : 1.6; ctx.setLineDash(p.faction === 'red' ? [5, 3] : []);
      ctx.beginPath();
      rows.forEach((r, k) => { const v = r.p[i] ? r.p[i][series] : 0; if (k === 0) ctx.moveTo(X(r.t), Y(v)); else ctx.lineTo(X(r.t), Y(v)); });
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function render() {
    card.innerHTML = `
      <div class="tabs">${[['summary', t('karne.ozet')], ['rank', t('karne.siralama')], ['timeline', t('karne.zaman')], ['army', t('karne.ordu')]].map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="pane">${tab === 'summary' ? summary() : tab === 'rank' ? ranking() : tab === 'timeline' ? timeline() : army()}</div>
      <div class="row">
        ${actions.again ? `<button type="button" class="primary" data-act="again">${t('karne.tekrar')}</button>` : ''}
        ${actions.lobby ? `<button type="button" class="primary" data-act="lobby">${t('karne.lobiyeDon')}</button>` : ''}
        <button type="button" data-act="home">${actions.lobby ? t('lobi.odadanCik') : t('karne.anaEkran')}</button>
        <button type="button" data-act="copy">${t('karne.kopyala')}</button>
        <span class="status" id="end-status"></span>
      </div>`;
    card.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.tab; render(); }; });
    card.querySelectorAll('[data-sort]').forEach(th => { th.onclick = () => { sortKey = th.dataset.sort; render(); }; });
    card.querySelectorAll('input[name=tl]').forEach(r => { r.onchange = () => { series = Number(r.value); drawChart(); }; });
    card.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'copy') { copyText(report, sorted, me).then(() => { const s = card.querySelector('#end-status'); if (s) s.textContent = t('karne.kopyalandi'); }); return; }
        if (actions[a]) actions[a]();
      };
    });
    if (tab === 'timeline') drawChart();
  }
  render();
}

/** Sonuç izleyenin takımına göre: kazanan takımdaysan zafer (eski karnelerde winner yok, mavinin gözünden result). */
function resultFor(report, me) {
  const o = report.outcome;
  if (!o.winner || !me) return o.result;
  return me.faction === o.winner ? 'victory' : 'defeat';
}

function copyText(report, sorted, me) {
  const lines = [`Çayır Muhafızı · ${resultFor(report, me) === 'victory' ? t('karne.zaferK') : t('karne.yenilgiK')} · ${mmss(report.time)} · ${report.teamSize}v${report.teamSize}`];
  lines.push(t('karne.metinBaslik'));
  sorted.forEach((p, i) => lines.push(`${String(i + 1).padEnd(3)}${(p.name + (p.human ? '' : ' (bot)')).padEnd(17)}${String(fmt(p.score.military)).padStart(6)}  ${String(fmt(p.score.economy)).padStart(7)}  ${String(fmt(p.score.build)).padStart(4)}  ${String(fmt(p.score.hero)).padStart(8)}  ${String(fmt(p.score.total)).padStart(6)}`));
  const text = lines.join('\n');
  try { return navigator.clipboard.writeText(text); } catch { return Promise.resolve(); }
}
