'use strict';
/* Gráficos SVG simples (linha e barras), sem dependências. */

function niceTicks(min, max) { return [min, (min + max) / 2, max]; }

function lineChart(pts, { h = 170, fmt = v => fmtN(v, 1), unitLabel = '', tickFmt = v => fmtN(v, v < 10 ? 1 : 0) } = {}) {
  if (!pts.length) return `<div class="chart-empty">Sem dados ainda</div>`;
  const W = 340, H = h, pl = 36, pr = 14, pt = 22, pb = 24;
  const ys = pts.map(p => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min = min * 0.85; max = max * 1.15 || 1; }
  const pad = (max - min) * 0.12; min = Math.max(0, min - pad); max += pad;
  const x = i => pts.length === 1 ? (pl + W - pr) / 2 : pl + i * (W - pl - pr) / (pts.length - 1);
  const y = v => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H - pb} L${x(0).toFixed(1)} ${H - pb} Z`;
  const grid = niceTicks(min, max).map(v => `<line class="c-grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="c-tick" x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${tickFmt(v)}</text>`).join('');
  const lblIdx = pts.length <= 1 ? [0] : pts.length <= 4 ? pts.map((_, i) => i) : [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
  const xl = lblIdx.map(i => `<text class="c-tick" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 && pts.length > 1 ? 'start' : i === pts.length - 1 && pts.length > 1 ? 'end' : 'middle'}">${esc(pts[i].label)}</text>`).join('');
  const last = pts.length - 1;
  const dots = pts.map((p, i) => `<circle class="c-dot${i === last ? ' last' : ''}" cx="${x(i)}" cy="${y(p.y)}" r="${i === last ? 4.5 : 3}"><title>${esc(p.label)}: ${fmt(p.y)}${unitLabel}</title></circle>`).join('');
  const lv = `<text class="c-val" x="${Math.min(x(last), W - pr)}" y="${y(pts[last].y) - 10}" text-anchor="${pts.length > 1 ? 'end' : 'middle'}">${fmt(pts[last].y)}${unitLabel}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}<path class="c-area" d="${area}"/><path class="c-line" d="${line}"/>${dots}${lv}${xl}</svg>`;
}

function barChart(pts, { h = 160, fmt = v => fmtN(v), target = null } = {}) {
  if (!pts.length || pts.every(p => !p.y)) return `<div class="chart-empty">Sem dados ainda</div>`;
  const W = 340, H = h, pl = 8, pr = 8, pt = 20, pb = 24;
  const max = Math.max(...pts.map(p => p.y), target || 0) || 1;
  const bw = (W - pl - pr) / pts.length;
  const y = v => pt + (1 - v / max) * (H - pt - pb);
  const step = Math.ceil(pts.length / 6);
  const bars = pts.map((p, i) => {
    const bx = pl + i * bw + bw * 0.18, w = bw * 0.64, top = y(p.y);
    const last = i === pts.length - 1;
    return `<rect class="c-bar${last ? ' last' : ''}" x="${bx}" y="${top}" width="${w}" height="${Math.max(0, H - pb - top)}" rx="3"><title>${esc(p.label)}: ${fmt(p.y)}</title></rect>`
      + ((i % step === 0 || last) ? `<text class="c-tick" x="${bx + w / 2}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>` : '')
      + (last && p.y ? `<text class="c-val" x="${bx + w / 2}" y="${top - 6}" text-anchor="middle">${fmt(p.y)}</text>` : '');
  }).join('');
  const tl = target ? `<line class="c-target" x1="${pl}" x2="${W - pr}" y1="${y(target)}" y2="${y(target)}"/><text class="c-tick" x="${W - pr}" y="${y(target) - 4}" text-anchor="end">meta ${target}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><line class="c-grid" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>${bars}${tl}</svg>`;
}

/* Barras horizontais em HTML (distribuição por grupo). */
function hBars(rows, { fmt = v => fmtN(v, 1), onAct = 'muscle' } = {}) {
  const max = Math.max(...rows.map(r => r.value), 0) || 1;
  return `<div class="hbars">${rows.map(r => `
    <div class="hbar" ${onAct ? `data-act="${onAct}" data-m="${r.key}"` : ''}>
      <div class="hbar-top"><span class="hbar-l">${esc(r.label)}${r.tag || ''}</span><span class="hbar-v">${fmt(r.value)}${r.suffix || ''}</span></div>
      <div class="hbar-track"><i class="lv${r.level ?? 3}" style="width:${(r.value / max * 100).toFixed(1)}%"></i></div>
    </div>`).join('')}</div>`;
}
