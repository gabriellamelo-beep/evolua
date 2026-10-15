'use strict';
/* Imagem para Stories (1080×1920): resumo de treino ou corrida, gerada em canvas.
   No celular abre a folha de compartilhar (Instagram etc.); no computador baixa o PNG. */

const STORY = { W: 1080, H: 1920, ink: '#f6f3ee', dim: 'rgba(246,243,238,.62)', faint: 'rgba(246,243,238,.14)', acc: '#ff5a36', run: '#fc4c02', gold: '#f5b301' };
const STORY_FONT = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function storyCanvas() {
  const c = document.createElement('canvas'); c.width = STORY.W; c.height = STORY.H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, STORY.H);
  bg.addColorStop(0, '#1d1411'); bg.addColorStop(.55, '#120e0d'); bg.addColorStop(1, '#0b0909');
  g.fillStyle = bg; g.fillRect(0, 0, STORY.W, STORY.H);
  const glow = g.createRadialGradient(STORY.W * .85, 160, 0, STORY.W * .85, 160, 760);
  glow.addColorStop(0, 'rgba(255,90,54,.28)'); glow.addColorStop(1, 'rgba(255,90,54,0)');
  g.fillStyle = glow; g.fillRect(0, 0, STORY.W, STORY.H);
  g.textBaseline = 'alphabetic';
  return [c, g];
}
function sText(g, t, x, y, { size = 40, weight = 600, color = STORY.ink, align = 'left', max = 0, spacing = 0 } = {}) {
  g.font = `${weight} ${size}px ${STORY_FONT}`; g.fillStyle = color; g.textAlign = align;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  if (max) while (g.measureText(t).width > max && size > 20) { size -= 2; g.font = `${weight} ${size}px ${STORY_FONT}`; }
  g.fillText(t, x, y);
  return size;
}
function sRound(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function sWrap(g, t, max, size, weight) {
  g.font = `${weight} ${size}px ${STORY_FONT}`;
  const out = []; let line = '';
  for (const w of String(t).split(/\s+/)) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > max && line) { out.push(line); line = w; } else line = test;
  }
  if (line) out.push(line);
  return out;
}
/* Cabeçalho e rodapé comuns. A área útil respeita as faixas que o Instagram cobre (topo ~250 px, base ~340 px). */
function storyFrame(g, kicker, date) {
  g.fillStyle = STORY.acc; sRound(g, 90, 262, 18, 18, 9); g.fill();
  sText(g, 'EVOLUA', 124, 280, { size: 34, weight: 800, spacing: 6 });
  sText(g, date.toUpperCase(), 990, 280, { size: 30, weight: 600, color: STORY.dim, align: 'right', spacing: 2 });
  sText(g, kicker.toUpperCase(), 90, 372, { size: 30, weight: 700, color: STORY.acc, spacing: 4 });
}
function storyStat(g, x, y, w, label, value, unit = '') {
  g.fillStyle = 'rgba(255,255,255,.06)'; sRound(g, x, y, w, 170, 28); g.fill();
  g.strokeStyle = STORY.faint; g.lineWidth = 2; g.stroke();
  sText(g, label.toUpperCase(), x + 32, y + 52, { size: 24, weight: 700, color: STORY.dim, spacing: 3 });
  const s = sText(g, value, x + 32, y + 132, { size: 68, weight: 800, max: w - 64 - (unit ? 70 : 0) });
  if (unit) { g.font = `800 ${s}px ${STORY_FONT}`; const vw = g.measureText(value).width; sText(g, unit, x + 32 + vw + 10, y + 132, { size: 30, weight: 600, color: STORY.dim }); }
}

/* ---------- Treino ---------- */
function storyWorkout(s) {
  const [c, g] = storyCanvas();
  const st = sessionStats(s), cmp = compareSession(s), ups = cmp.filter(x => x.kind === 'up');
  const ms = muscleStats([s]);
  const top = MUSCLE_ORDER.filter(m => ms[m].sets).sort((a, b) => ms[b].sets - ms[a].sets).slice(0, 5);
  storyFrame(g, 'Treino concluído', fmtDate(s.start, { day: '2-digit', month: 'short' }));

  let y = 400;
  const lines = sWrap(g, s.workoutName, 900, 96, 800).slice(0, 2);
  lines.forEach((l, i) => sText(g, l, 90, y + 90 + i * 104, { size: 96, weight: 800, max: 900 }));
  y += 90 + lines.length * 104 + 30;

  const cw = (900 - 24) / 2;
  const vol = fmtVol(st.vol).split(' ');
  storyStat(g, 90, y, cw, 'Duração', fmtDur(s.duration));
  storyStat(g, 90 + cw + 24, y, cw, 'Volume', vol[0], vol.slice(1).join(' '));
  y += 194;
  storyStat(g, 90, y, cw, 'Exercícios', String(st.exs));
  storyStat(g, 90 + cw + 24, y, cw, 'Séries', String(st.sets));
  y += 230;

  if (ups.length) {
    sText(g, 'PROGRESSÕES', 90, y, { size: 26, weight: 700, color: STORY.dim, spacing: 4 });
    y += 34;
    ups.slice(0, 4).forEach(u => {
      g.fillStyle = 'rgba(255,255,255,.06)'; sRound(g, 90, y, 900, 104, 24); g.fill();
      if (u.pr) { g.fillStyle = STORY.gold; g.beginPath(); g.arc(142, y + 52, 14, 0, 7); g.fill(); }
      else { g.strokeStyle = '#3ddc97'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(128, y + 62); g.lineTo(142, y + 42); g.lineTo(156, y + 62); g.stroke(); }
      sText(g, u.name, 190, y + 46, { size: 34, weight: 700, max: 770 });
      sText(g, u.text, 190, y + 84, { size: 26, weight: 500, color: STORY.dim, max: 770 });
      y += 124;
    });
    y += 56;
  }

  if (top.length && y < 1480) {
    sText(g, 'MÚSCULOS TRABALHADOS', 90, y, { size: 26, weight: 700, color: STORY.dim, spacing: 4 });
    y += 40;
    const max = ms[top[0]].sets;
    top.slice(0, Math.max(2, Math.min(top.length, Math.floor((1560 - y) / 62)))).forEach(m => {
      sText(g, mName(m), 90, y + 28, { size: 30, weight: 600, max: 270 });
      g.fillStyle = STORY.faint; sRound(g, 380, y + 6, 520, 26, 13); g.fill();
      g.fillStyle = STORY.acc; sRound(g, 380, y + 6, Math.max(26, 520 * ms[m].sets / max), 26, 13); g.fill();
      sText(g, fmtN(ms[m].sets, 1), 990, y + 28, { size: 28, weight: 700, align: 'right' });
      y += 62;
    });
  }
  return c;
}

/* ---------- Corrida ---------- */
function storyRoute(g, poly, x, y, w, h) {
  const pts = poly ? decodePolyline(poly) : [];
  if (pts.length < 2) return false;
  const k = Math.cos(pts.reduce((a, p) => a + p[0], 0) / pts.length * Math.PI / 180);
  const xy = pts.map(([la, lo]) => [lo * k, -la]);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), spanX = Math.max(...xs) - minX || 1e-9, spanY = Math.max(...ys) - minY || 1e-9;
  const s = Math.min(w / spanX, h / spanY), ox = x + (w - spanX * s) / 2, oy = y + (h - spanY * s) / 2;
  const P = p => [ox + (p[0] - minX) * s, oy + (p[1] - minY) * s];
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); xy.forEach((p, i) => { const [a, b] = P(p); i ? g.lineTo(a, b) : g.moveTo(a, b); });
  g.strokeStyle = 'rgba(252,76,2,.28)'; g.lineWidth = 26; g.stroke();
  g.strokeStyle = STORY.run; g.lineWidth = 11; g.stroke();
  const [sx, sy] = P(xy[0]), [ex, ey] = P(xy.at(-1));
  g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 17, 0, 7); g.fill();
  g.fillStyle = STORY.run; g.beginPath(); g.arc(ex, ey, 17, 0, 7); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
  return true;
}
function storyRun(r) {
  const [c, g] = storyCanvas();
  storyFrame(g, r.race ? 'Prova' : 'Corrida', fmtDate(r.start, { day: '2-digit', month: 'short' }));
  const lines = sWrap(g, r.name, 900, 76, 800).slice(0, 2);
  lines.forEach((l, i) => sText(g, l, 90, 470 + i * 88, { size: 76, weight: 800, max: 900 }));
  let y = 470 + lines.length * 88 - 20;

  // Tudo termina acima de ~1580 px, antes da barra de resposta do Instagram.
  const routeH = r.polyline ? 440 : 0;
  if (routeH) { storyRoute(g, r.polyline, 150, y, 780, routeH); y += routeH + 30; }
  else y += 20;

  const km = fmtKm(r.distance).split(' ');
  const big = sText(g, km[0], 90, y + 140, { size: 180, weight: 800, max: 700 });
  g.font = `800 ${big}px ${STORY_FONT}`;
  sText(g, 'km', 90 + g.measureText(km[0]).width + 20, y + 140, { size: 64, weight: 700, color: STORY.dim });
  y += 200;

  const cw = (900 - 24) / 2;
  storyStat(g, 90, y, cw, 'Tempo', fmtHMS(r.movingTime));
  storyStat(g, 90 + cw + 24, y, cw, 'Ritmo', fmtPaceS(paceSec(r.movingTime, r.distance)), '/km');
  y += 194;
  const extra = [];
  if (r.elevation) extra.push(['Elevação', fmtN(r.elevation), 'm']);
  if (r.avgHr) extra.push(['FC média', String(r.avgHr), 'bpm']);
  if (extra.length) {
    const w = extra.length === 1 ? 900 : cw;
    extra.forEach((e, i) => storyStat(g, 90 + i * (cw + 24), y, w, ...e));
  }
  return c;
}

/* ---------- Compartilhar / baixar ---------- */
const storyBlob = c => new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('png')), 'image/png'));
async function storyShare(canvas, filename) {
  const blob = await storyBlob(canvas), file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Imagem salva. Abra o Instagram e escolha no Stories');
}
const storyBtn = (kind, id) => `<button class="btn btn-soft btn-block" data-act="storyMake" data-kind="${kind}" data-id="${id}">${ic('upload')}Imagem para Stories</button>`;
ACT.storyMake = async el => {
  try {
    toast('Gerando imagem…');
    const { kind, id } = el.dataset;
    if (kind === 'run') { const r = DB.runs.find(x => x.id === id); if (r) await storyShare(storyRun(r), `evolua-corrida-${dayKey(r.start)}.png`); }
    else { const s = DB.sessions.find(x => x.id === id); if (s) await storyShare(storyWorkout(s), `evolua-treino-${dayKey(s.start)}.png`); }
  } catch (e) { console.error(e); toast('Não foi possível gerar a imagem'); }
};
