import { SOLDIER_TYPES } from './config.js';

/**
 * Bitiş karnesi (bkz. stats.js buildReport): dört sekme — Özet (sonuç, süre, alan şampiyonları), Sıralama (tablo,
 * sütuna tıkla sırala), Zaman çizelgesi (canvas grafik: skor / asker / kaynak / seviye), Ordu (tür başına basılan,
 * kaybedilen, öldürülen). "Sonucu kopyala" sıralamayı metin olarak panoya alır.
 */
const FIELDS = [['military', 'Askerî'], ['economy', 'Ekonomi'], ['build', 'İnşa'], ['hero', 'Kahraman'], ['total', 'Toplam']];
const fmt = n => Math.round(n).toLocaleString('tr-TR');
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const typeLabel = k => { const t = SOLDIER_TYPES.find(x => x.key === k); return t ? t.label : k === 'hero' ? 'Kahraman' : k; };

export function renderReport(card, report, world, actions) {
  const me = world.me ? report.players.find(p => p.id === world.me.id) : null;
  const win = report.outcome.result === 'victory';
  const sorted = [...report.players].sort((a, b) => b.score.total - a.score.total);
  const rank = me ? sorted.indexOf(me) + 1 : 0;
  const CH = { military: 'En çok yok eden', economy: 'En çok toplayan', build: 'En çok kuran', hero: 'En yüksek kahraman', deaths: 'En çok ölen' };
  const nameOf = id => { const p = report.players.find(q => q.id === id); return p ? `<i class="dot" style="background:${p.color}"></i>${esc(p.name)}` : '—'; };
  let tab = 'summary', sortKey = 'total';

  const summary = () => `
    <div class="result ${win ? 'win' : 'lose'}"><b>${win ? 'ZAFER' : 'YENİLGİ'}</b><span>${mmss(report.time)} · ${report.teamSize}v${report.teamSize} · ${({ easy: 'Kolay', normal: 'Normal', hard: 'Zor' })[report.difficulty] || report.difficulty}</span></div>
    ${me ? `<div class="mine">Sen: <b>${fmt(me.score.total)}</b> puan · ${rank}. sıra · seviye ${me.level}</div>` : ''}
    <div class="champs">${Object.entries(CH).map(([k, label]) => `<div class="champ"><span class="crown">👑</span><span class="lbl">${label}</span><span class="who">${nameOf(report.champions[k])}</span></div>`).join('')}</div>`;

  const ranking = () => {
    const list = [...report.players].sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name, 'tr') : b.score[sortKey] - a.score[sortKey]));
    const teamSum = f => report.players.filter(p => p.faction === f).reduce((a, p) => a + p.score.total, 0);
    return `<table class="rank"><thead><tr><th>#</th><th data-sort="name">Oyuncu</th>${FIELDS.map(([k, l]) => `<th data-sort="${k}" class="${sortKey === k ? 'on' : ''}">${l}</th>`).join('')}</tr></thead><tbody>
      ${list.map((p, i) => `<tr class="${me && p.id === me.id ? 'me' : ''} ${p.faction}"><td>${i + 1}</td><td><i class="dot" style="background:${p.color}"></i>${esc(p.name)}${p.human ? '' : ' <small>bot</small>'}${p.alive ? '' : ' <small>sancağı yıkık</small>'}</td>${FIELDS.map(([k]) => `<td>${fmt(p.score[k])}</td>`).join('')}</tr>`).join('')}
      </tbody><tfoot><tr><td></td><td>Mavi takım</td><td colspan="4"></td><td>${fmt(teamSum('blue'))}</td></tr><tr><td></td><td>Kırmızı takım</td><td colspan="4"></td><td>${fmt(teamSum('red'))}</td></tr></tfoot></table>`;
  };

  const army = () => {
    const keys = new Set();
    for (const p of report.players) for (const o of [p.st.unitsMade, p.st.unitsLost, p.st.kills]) for (const k of Object.keys(o)) keys.add(k);
    const cols = [...keys];
    return `<table class="army"><thead><tr><th>Oyuncu</th><th></th>${cols.map(k => `<th>${typeLabel(k)}</th>`).join('')}<th>Hasar</th></tr></thead><tbody>
      ${report.players.map(p => `<tr class="${p.faction} ${me && p.id === me.id ? 'me' : ''}"><td rowspan="3"><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</td><td>bastı</td>${cols.map(k => `<td>${p.st.unitsMade[k] || ''}</td>`).join('')}<td rowspan="3">${fmt(p.st.dmgDealt)} / ${fmt(p.st.dmgTaken)}</td></tr>
        <tr class="${p.faction}"><td>kaybetti</td>${cols.map(k => `<td>${p.st.unitsLost[k] || ''}</td>`).join('')}</tr>
        <tr class="${p.faction}"><td>öldürdü</td>${cols.map(k => `<td>${p.st.kills[k] || ''}</td>`).join('')}</tr>`).join('')}
      </tbody></table><p class="hint">Hasar: verilen / alınan.</p>`;
  };

  let series = 0;
  const timeline = () => `<div class="chartbar"><label><input type="radio" name="tl" value="0" checked> Skor</label><label><input type="radio" name="tl" value="1"> Asker</label><label><input type="radio" name="tl" value="3"> Kaynak</label><label><input type="radio" name="tl" value="4"> Seviye</label><label><input type="radio" name="tl" value="5"> Yapı</label></div><canvas id="tl-canvas" width="860" height="300"></canvas><div class="legend">${report.players.map(p => `<span><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</span>`).join('')}</div>`;

  function drawChart() {
    const c = card.querySelector('#tl-canvas'); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height, pad = { l: 46, r: 10, t: 10, b: 24 };
    ctx.clearRect(0, 0, W, H);
    const rows = report.timeline; if (!rows.length) return;
    let max = 1; for (const r of rows) for (const v of r.p) max = Math.max(max, v[series]);
    const tMax = Math.max(1, rows[rows.length - 1].t);
    const X = t => pad.l + (W - pad.l - pad.r) * t / tMax, Y = v => H - pad.b - (H - pad.t - pad.b) * v / max;
    ctx.strokeStyle = '#4a3a22'; ctx.lineWidth = 1; ctx.fillStyle = '#4a3a22'; ctx.font = '11px system-ui';
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(fmt(v), 4, y + 4); }
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
      <div class="tabs">${[['summary', 'Özet'], ['rank', 'Sıralama'], ['timeline', 'Zaman çizelgesi'], ['army', 'Ordu']].map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="pane">${tab === 'summary' ? summary() : tab === 'rank' ? ranking() : tab === 'timeline' ? timeline() : army()}</div>
      <div class="row">
        ${actions.again ? '<button type="button" class="primary" data-act="again">Tekrar oyna</button>' : ''}
        ${actions.lobby ? '<button type="button" data-act="lobby">Lobiye dön</button>' : ''}
        <button type="button" data-act="home">Ana ekran</button>
        <button type="button" data-act="copy">Sonucu kopyala</button>
        <span class="status" id="end-status"></span>
      </div>`;
    card.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.tab; render(); }; });
    card.querySelectorAll('[data-sort]').forEach(th => { th.onclick = () => { sortKey = th.dataset.sort; render(); }; });
    card.querySelectorAll('input[name=tl]').forEach(r => { r.onchange = () => { series = Number(r.value); drawChart(); }; });
    card.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'copy') { copyText(report, sorted).then(() => { const s = card.querySelector('#end-status'); if (s) s.textContent = 'Kopyalandı'; }); return; }
        if (actions[a]) actions[a]();
      };
    });
    if (tab === 'timeline') drawChart();
  }
  render();
}

function copyText(report, sorted) {
  const lines = [`Çayır Muhafızı · ${report.outcome.result === 'victory' ? 'Zafer' : 'Yenilgi'} · ${mmss(report.time)} · ${report.teamSize}v${report.teamSize}`];
  lines.push('#  Oyuncu           Askerî  Ekonomi  İnşa  Kahraman  Toplam');
  sorted.forEach((p, i) => lines.push(`${String(i + 1).padEnd(3)}${(p.name + (p.human ? '' : ' (bot)')).padEnd(17)}${String(fmt(p.score.military)).padStart(6)}  ${String(fmt(p.score.economy)).padStart(7)}  ${String(fmt(p.score.build)).padStart(4)}  ${String(fmt(p.score.hero)).padStart(8)}  ${String(fmt(p.score.total)).padStart(6)}`));
  const text = lines.join('\n');
  try { return navigator.clipboard.writeText(text); } catch { return Promise.resolve(); }
}
