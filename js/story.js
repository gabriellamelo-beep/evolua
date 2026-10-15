'use strict';
/* Imagem para Stories (1080×1920): resumo de treino ou corrida, gerada em canvas.
   No celular abre a folha de compartilhar (Instagram etc.); no computador baixa o PNG. */

const STORY = { W: 1080, H: 1920, acc: '#ff5a36', run: '#fc4c02', gold: '#f5b301', pos: '#3ddc97' };
const STORY_THEMES = {
  dark:  { name: 'Escuro', ink: '#f6f3ee', dim: 'rgba(246,243,238,.62)', faint: 'rgba(246,243,238,.14)', card: 'rgba(255,255,255,.06)', stroke: 'rgba(246,243,238,.14)', acc: '#ff5a36', pos: '#3ddc97', row: 'rgba(255,255,255,.06)' },
  light: { name: 'Claro', ink: '#151412', dim: 'rgba(21,20,18,.6)', faint: 'rgba(21,20,18,.1)', card: '#ffffff', stroke: 'rgba(21,20,18,.1)', acc: '#e8401b', pos: '#16a36b', row: '#ffffff' },
  clear: { name: 'Transparente', ink: '#ffffff', dim: 'rgba(255,255,255,.82)', faint: 'rgba(255,255,255,.22)', card: 'rgba(14,11,10,.58)', stroke: 'rgba(255,255,255,.2)', acc: '#ff7a59', pos: '#3ddc97', row: 'rgba(14,11,10,.58)', shadow: true },
};
let ST = STORY_THEMES.dark;  // tema do desenho em andamento (o desenho é síncrono)
const STORY_FONT = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function storyCanvas(theme) {
  ST = STORY_THEMES[theme] || STORY_THEMES.dark;
  const c = document.createElement('canvas'); c.width = STORY.W; c.height = STORY.H;
  const g = c.getContext('2d');
  if (theme !== 'clear') {
    const bg = g.createLinearGradient(0, 0, 0, STORY.H);
    if (theme === 'light') { bg.addColorStop(0, '#fbf9f6'); bg.addColorStop(1, '#ebe7e1'); }
    else { bg.addColorStop(0, '#1d1411'); bg.addColorStop(.55, '#120e0d'); bg.addColorStop(1, '#0b0909'); }
    g.fillStyle = bg; g.fillRect(0, 0, STORY.W, STORY.H);
    const glow = g.createRadialGradient(STORY.W * .85, 160, 0, STORY.W * .85, 160, 760);
    glow.addColorStop(0, theme === 'light' ? 'rgba(255,90,54,.16)' : 'rgba(255,90,54,.28)'); glow.addColorStop(1, 'rgba(255,90,54,0)');
    g.fillStyle = glow; g.fillRect(0, 0, STORY.W, STORY.H);
  }
  g.textBaseline = 'alphabetic';
  return [c, g];
}
function sText(g, t, x, y, { size = 40, weight = 600, color = ST.ink, align = 'left', max = 0, spacing = 0 } = {}) {
  g.font = `${weight} ${size}px ${STORY_FONT}`; g.fillStyle = color; g.textAlign = align;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  if (max) while (g.measureText(t).width > max && size > 20) { size -= 2; g.font = `${weight} ${size}px ${STORY_FONT}`; }
  if (ST.shadow) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 14; g.shadowOffsetY = 2; }
  g.fillText(t, x, y);
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
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
  g.fillStyle = ST.acc; sRound(g, 90, 262, 18, 18, 9); g.fill();
  sText(g, 'EVOLUA', 124, 280, { size: 34, weight: 800, spacing: 6 });
  sText(g, date.toUpperCase(), 990, 280, { size: 30, weight: 600, color: ST.dim, align: 'right', spacing: 2 });
  sText(g, kicker.toUpperCase(), 90, 372, { size: 30, weight: 700, color: ST.acc, spacing: 4 });
}
function storyStat(g, x, y, w, label, value, unit = '') {
  g.fillStyle = ST.card; sRound(g, x, y, w, 170, 28); g.fill();
  g.strokeStyle = ST.stroke; g.lineWidth = 2; g.stroke();
  sText(g, label.toUpperCase(), x + 32, y + 52, { size: 24, weight: 700, color: ST.dim, spacing: 3 });
  const s = sText(g, value, x + 32, y + 132, { size: 68, weight: 800, max: w - 64 - (unit ? 70 : 0) });
  if (unit) { g.font = `800 ${s}px ${STORY_FONT}`; const vw = g.measureText(value).width; sText(g, unit, x + 32 + vw + 10, y + 132, { size: 30, weight: 600, color: ST.dim }); }
}

/* ---------- Treino ---------- */
function storyWorkout(s, theme) {
  const [c, g] = storyCanvas(theme);
  const st = sessionStats(s), cmp = compareSession(s), ups = cmp.filter(x => x.kind === 'up');
  const ms = muscleStats([s]);
  const top = MUSCLE_ORDER.filter(m => ms[m].sets).sort((a, b) => ms[b].sets - ms[a].sets);
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
    sText(g, 'PROGRESSÕES', 90, y, { size: 26, weight: 700, color: ST.dim, spacing: 4 });
    y += 34;
    ups.slice(0, 4).forEach(u => {
      g.fillStyle = ST.row; sRound(g, 90, y, 900, 104, 24); g.fill(); g.strokeStyle = ST.stroke; g.lineWidth = 2; g.stroke();
      if (u.pr) { g.fillStyle = STORY.gold; g.beginPath(); g.arc(142, y + 52, 14, 0, 7); g.fill(); }
      else { g.strokeStyle = ST.pos; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(128, y + 62); g.lineTo(142, y + 42); g.lineTo(156, y + 62); g.stroke(); }
      sText(g, u.name, 190, y + 46, { size: 34, weight: 700, max: 770 });
      sText(g, u.text, 190, y + 84, { size: 26, weight: 500, color: ST.dim, max: 770 });
      y += 124;
    });
    y += 56;
  }

  const rows = Math.min(top.length, Math.floor((1590 - y - 40) / 62));
  if (rows >= 2) {
    sText(g, 'MÚSCULOS TRABALHADOS', 90, y, { size: 26, weight: 700, color: ST.dim, spacing: 4 });
    y += 40;
    top.slice(0, rows).forEach(m => {
      sText(g, mName(m), 90, y + 28, { size: 30, weight: 600, max: 270 });
      g.fillStyle = ST.faint; sRound(g, 380, y + 6, 520, 26, 13); g.fill();
      g.fillStyle = ST.acc; sRound(g, 380, y + 6, Math.max(26, 520 * ms[m].sets / ms[top[0]].sets), 26, 13); g.fill();
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
  g.strokeStyle = ST.shadow ? 'rgba(255,255,255,.85)' : 'rgba(252,76,2,.28)'; g.lineWidth = ST.shadow ? 20 : 26; g.stroke();
  g.strokeStyle = STORY.run; g.lineWidth = 11; g.stroke();
  const [sx, sy] = P(xy[0]), [ex, ey] = P(xy.at(-1));
  g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 17, 0, 7); g.fill(); if (ST.card === '#ffffff') { g.strokeStyle = STORY.run; g.lineWidth = 6; g.stroke(); }
  g.fillStyle = STORY.run; g.beginPath(); g.arc(ex, ey, 17, 0, 7); g.fill();
  g.strokeStyle = ST.card === '#ffffff' ? '#fff' : '#fff'; g.lineWidth = 6; g.stroke();
  return true;
}
function storyRun(r, theme) {
  const [c, g] = storyCanvas(theme);
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
  sText(g, 'km', 90 + g.measureText(km[0]).width + 20, y + 140, { size: 64, weight: 700, color: ST.dim });
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

/* ---------- Semana / mês ---------- */
function periodRange(kind, now = new Date()) {
  if (kind === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  const from = startOfWeek(now); return [from, endOfDay(addDays(from, 6))];
}
function storyPeriod(kind, theme) {
  const [c, g] = storyCanvas(theme), [from, to] = periodRange(kind);
  const ss = sessionsBetween(from, to), rr = runsBetween(from, to), week = kind === 'week';
  const tot = ss.reduce((a, s) => { const t = sessionStats(s); return { sets: a.sets + t.sets, vol: a.vol + t.vol, min: a.min + (s.duration || 0) }; }, { sets: 0, vol: 0, min: 0 });
  const ms = muscleStats(ss), top = MUSCLE_ORDER.filter(m => ms[m].sets).sort((a, b) => ms[b].sets - ms[a].sets);
  storyFrame(g, week ? 'Resumo da semana' : 'Resumo do mês', fmtDate(new Date(), { day: '2-digit', month: 'short' }));
  const title = week ? `${fmtDate(from, { day: '2-digit', month: 'short' })} – ${fmtDate(addDays(from, 6), { day: '2-digit', month: 'short' })}` : fmtDate(from, { month: 'long' });
  sText(g, title.charAt(0).toUpperCase() + title.slice(1), 90, 500, { size: 110, weight: 800, max: 900 });

  let y = 700;
  const n = String(ss.length), big = sText(g, n, 90, y, { size: 190, weight: 800 });
  g.font = `800 ${big}px ${STORY_FONT}`;
  sText(g, ss.length === 1 ? 'treino' : 'treinos', 90 + g.measureText(n).width + 24, y, { size: 64, weight: 700, color: ST.dim });
  y += 40;

  if (week) {
    const days = new Set([...ss.map(s => dayKey(s.start)), ...rr.map(r => dayKey(r.start))]);
    const lab = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
    for (let i = 0; i < 7; i++) {
      const cx = 90 + 56 + i * 128, on = days.has(dayKey(addDays(from, i)));
      g.beginPath(); g.arc(cx, y + 56, 48, 0, 7);
      if (on) { g.fillStyle = ST.acc; g.fill(); } else { g.strokeStyle = ST.faint; g.lineWidth = 5; g.stroke(); }
      sText(g, lab[i], cx, y + 72, { size: 42, weight: 800, align: 'center', color: on ? '#fff' : ST.dim });
    }
    y += 150;
  } else y += 30;

  const cw = (900 - 24) / 2, vol = fmtVol(tot.vol).split(' '), km = fmtKm(sumKm(rr)).split(' ');
  storyStat(g, 90, y, cw, 'Tempo treinando', fmtDur(tot.min));
  storyStat(g, 90 + cw + 24, y, cw, 'Séries', String(tot.sets));
  y += 194;
  storyStat(g, 90, y, cw, 'Volume', vol[0], vol.slice(1).join(' '));
  storyStat(g, 90 + cw + 24, y, cw, rr.length === 1 ? 'Corrida' : 'Corridas', km[0], 'km');
  y += 240;

  const rows = Math.min(top.length, Math.floor((1590 - y - 40) / 62));
  if (rows >= 2) {
    sText(g, 'MÚSCULOS TRABALHADOS', 90, y, { size: 26, weight: 700, color: ST.dim, spacing: 4 });
    y += 40;
    top.slice(0, rows).forEach(m => {
      sText(g, mName(m), 90, y + 28, { size: 30, weight: 600, max: 270 });
      g.fillStyle = ST.faint; sRound(g, 380, y + 6, 520, 26, 13); g.fill();
      g.fillStyle = ST.acc; sRound(g, 380, y + 6, Math.max(26, 520 * ms[m].sets / ms[top[0]].sets), 26, 13); g.fill();
      sText(g, fmtN(ms[m].sets, 1), 990, y + 28, { size: 28, weight: 700, align: 'right' });
      y += 62;
    });
  }
  return c;
}

/* ---------- Tela de prévia, compartilhar e baixar ---------- */
const STORYUI = { kind: 'workout', id: '', theme: 'dark', w: null };
function storyBuild() {
  const { kind, id, theme } = STORYUI;
  if (kind === 'run') { const r = DB.runs.find(x => x.id === id); return r && { c: storyRun(r, theme), name: `evolua-corrida-${dayKey(r.start)}` }; }
  if (kind === 'week' || kind === 'month') return { c: storyPeriod(kind, theme), name: `evolua-${kind === 'week' ? 'semana' : 'mes'}-${dayKey(new Date())}` };
  const s = DB.sessions.find(x => x.id === id); return s && { c: storyWorkout(s, theme), name: `evolua-treino-${dayKey(s.start)}` };
}
function storyPaint() {
  const w = STORYUI.w; if (!w) return;
  const out = storyBuild(); if (!out) return;
  const box = w.querySelector('.story-prev');
  box.className = 'story-prev ' + STORYUI.theme;
  box.replaceChildren(out.c);
  w.querySelectorAll('[data-act="storyTheme"]').forEach(b => b.classList.toggle('on', b.dataset.v === STORYUI.theme));
  w.querySelectorAll('[data-act="storyPeriod"]').forEach(b => b.classList.toggle('on', b.dataset.v === STORYUI.kind));
  w.querySelector('.story-hint').hidden = STORYUI.theme !== 'clear';
}
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
ACT.storyMake = el => {
  const { kind, id } = el.dataset;
  STORYUI.kind = kind; STORYUI.id = id || '';
  const period = kind === 'week' || kind === 'month';
  STORYUI.w = openSheet(`<h3 class="sheet-title">Imagem para Stories</h3>
    ${period ? `<div class="chips sm">${[['week', 'Semana'], ['month', 'Mês']].map(([v, l]) => `<button class="chip" data-act="storyPeriod" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
    <div class="chips sm">${Object.entries(STORY_THEMES).map(([v, t]) => `<button class="chip" data-act="storyTheme" data-v="${v}">${t.name}</button>`).join('')}</div>
    <div class="story-prev"></div>
    <p class="muted small story-hint" hidden>Fundo transparente: no Stories, escolha uma foto de fundo e adicione esta imagem como figurinha.</p>
    <button class="btn btn-primary btn-lg btn-block" data-act="storyGo">${ic('upload')}Compartilhar</button>`, { cls: 'tall', onClose: () => { STORYUI.w = null; } });
  storyPaint();
};
ACT.storyTheme = el => { STORYUI.theme = el.dataset.v; storyPaint(); };
ACT.storyPeriod = el => { STORYUI.kind = el.dataset.v; storyPaint(); };
ACT.storyGo = async () => {
  try {
    const out = storyBuild(); if (!out) return;
    await storyShare(out.c, `${out.name}${STORYUI.theme === 'clear' ? '-transparente' : ''}.png`);
  } catch (e) { console.error(e); toast('Não foi possível gerar a imagem'); }
};
