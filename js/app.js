'use strict';
/* Telas principais, roteamento e ações. */

const ACT = {};   // cliques: data-act
const BIND = {};  // mudanças confirmadas: data-bind (change)
const LIVE = {};  // digitação: data-live (input)

/* ================= ROTEAMENTO ================= */
const TABS = [
  ['', 'home', 'Início'], ['treinos', 'dumbbell', 'Treinos'], ['mapa', 'body', 'Mapa'],
  ['corridas', 'run', 'Corridas'], ['evolucao', 'chart', 'Evolução'], ['historico', 'history', 'Histórico'],
];
const ROUTES = {
  '': renderHome, treinos: renderWorkouts, exercicios: renderLibrary, editar: renderEditor,
  mapa: renderMap, corridas: a => renderRuns(a), evolucao: renderEvolution, historico: renderHistory, preferencias: renderPrefs,
};
let _lastRoute = null;

function parseHash() {
  const [name = '', arg = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: ROUTES[name] ? name : '', arg: decodeURIComponent(arg) };
}
function route() {
  const { name, arg } = parseHash();
  const key = name + '/' + arg;
  const view = $('#view');
  const y = window.scrollY;
  if (name !== 'editar') EDIT = null;
  view.innerHTML = ROUTES[name](arg) || '';
  view.dataset.route = name;
  const tabKey = name === 'exercicios' || name === 'editar' ? 'treinos' : name === 'preferencias' ? '' : name;
  $('#tabbar').innerHTML = TABS.map(([r, icn, label]) => `<a href="#/${r}" class="${r === tabKey ? 'on' : ''}">${ic(icn)}<span>${label}</span></a>`).join('');
  $('#tabbar').hidden = name === 'editar';
  window.scrollTo(0, key === _lastRoute ? y : 0);
  _lastRoute = key;
}
const rerender = () => route();
const go = h => { if (location.hash === h) route(); else location.hash = h; };

const pageHead = (title, right = '', sub = '') => `<header class="page-head"><div><h1>${title}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div><div class="head-actions">${right}</div></header>`;

/* ================= INÍCIO ================= */
function renderHome() {
  const p = DB.profile, now = new Date();
  const today = sortedSessions().filter(s => dayKey(s.start) === dayKey(now));
  const w = suggestedWorkout();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  let html = pageHead(`${greet}${p.name ? ', ' + esc(p.name) : ''}`,
    `<a class="icon-btn" href="#/preferencias" aria-label="Preferências">${ic('settings')}</a>`,
    lower(fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' })));

  if (today.length && !DB.active) {
    const s = today[today.length - 1], st = sessionStats(s);
    html += `<button class="done-banner" data-act="sessOpen" data-id="${s.id}">${ic('check')}<span><b>Treino de hoje concluído</b> · ${esc(s.workoutName)} · ${fmtDur(s.duration)} · ${st.sets} séries</span>${ic('right')}</button>`;
  }

  if (DB.active) {
    const a = DB.active, st = activeProgress();
    html += `<section class="hero card live">
      <div class="eyebrow"><span class="pulse"></span>Em andamento</div>
      <h2 class="hero-title">${esc(a.workoutName)}</h2>
      <p class="hero-muscles">${st.done} de ${st.total} séries · iniciado às ${fmtTime(a.start)}</p>
      <button class="btn btn-primary btn-xl" data-act="resume">${ic('play')} CONTINUAR TREINO</button>
    </section>`;
  } else if (w) {
    const last = lastSessionOf(w.id), mus = musclesOf(w);
    html += `<section class="hero card">
      <div class="eyebrow">${today.length ? 'Próximo treino' : 'Treino de hoje'}</div>
      <h2 class="hero-title">${esc(w.name)}${w.division ? ` <span class="hero-div">— ${esc(w.division)}</span>` : ''}</h2>
      <div class="hero-muscles">${mus.primary.map(mName).join(' • ') || '&nbsp;'}</div>
      <div class="hero-meta">
        <span>${ic('dumbbell')}${w.items.length} exercícios</span>
        <span>${ic('timer')}~${estDuration(w)} min</span>
        <span>${ic('history')}${last ? relDay(last.start) : 'nunca feito'}</span>
      </div>
      <button class="btn btn-primary btn-xl" data-act="start" data-id="${w.id}">INICIAR TREINO</button>
      ${DB.workouts.length > 1 ? `<div class="hero-swap" aria-label="Trocar treino de hoje">${DB.workouts.map(x => `<button class="chip ${x.id === w.id ? 'on' : ''}" data-act="pickToday" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    </section>`;
  } else {
    html += `<section class="card">${emptyState('dumbbell', 'Nenhum treino criado', 'Monte seu primeiro treino para começar.', `<a class="btn btn-primary" href="#/editar/novo">Criar treino</a>`)}</section>`;
  }

  // Semana
  const ws = startOfWeek(now);
  const wkSessions = sessionsBetween(ws, endOfDay(addDays(ws, 6)));
  const letters = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const weekDots = letters.map((l, i) => {
    const d = addDays(ws, i), k = dayKey(d);
    const done = wkSessions.some(s => dayKey(s.start) === k);
    const planned = p.plannedDays.includes(d.getDay());
    return `<div class="wd ${done ? 'done' : ''} ${planned ? 'plan' : ''} ${k === dayKey(now) ? 'today' : ''}"><i>${done ? ic('check') : ''}</i><span>${l}</span></div>`;
  }).join('');

  const v7 = sessionsBetween(addDays(startOfDay(now), -6), now).reduce((a, s) => a + sessionStats(s).vol, 0);
  const vp = sessionsBetween(addDays(startOfDay(now), -13), endOfDay(addDays(now, -7))).reduce((a, s) => a + sessionStats(s).vol, 0);
  const vDelta = vp > 0 ? (v7 - vp) / vp * 100 : null;
  const lastS = sortedSessions().at(-1);

  html += `<section class="card week">
    <div class="card-head"><h3>Esta semana</h3><span class="muted">${wkSessions.length}/${p.weeklyTarget} treinos</span></div>
    <div class="week-dots">${weekDots}</div>
  </section>
  <section class="stats">
    <div class="stat">${ic('flame')}<div class="stat-v">${weeklyStreak()}</div><div class="stat-l">semanas seguidas na meta</div></div>
    <div class="stat">${ic('dumbbell')}<div class="stat-v">${fmtVol(v7)}</div><div class="stat-l">volume 7 dias${vDelta != null ? ` <b class="${vDelta >= 0 ? 'pos' : 'neg'}">${vDelta >= 0 ? '+' : ''}${fmtN(vDelta)}%</b>` : ''}</div></div>
    <div class="stat wide" ${lastS ? `data-act="sessOpen" data-id="${lastS.id}"` : ''}>${ic('history')}<div class="stat-v">${lastS ? relDay(lastS.start) : '—'}</div><div class="stat-l">${lastS ? `último treino · ${esc(lastS.workoutName)} · ${fmtDur(lastS.duration)}` : 'nenhum treino registrado'}</div></div>
  </section>`;

  // Mapa (7 dias)
  const st7 = muscleStats(sessionsBetween(addDays(startOfDay(now), -6), now));
  const top = MUSCLE_ORDER.filter(m => st7[m].sets > 0).sort((a, b) => st7[b].sets - st7[a].sets).slice(0, 4);
  html += `<a class="card map-mini" href="#/mapa">
    <div class="card-head"><h3>Mapa muscular · 7 dias</h3>${ic('right')}</div>
    <div class="map-mini-body">${bodyPair(levelsFrom(st7), { small: true })}
      <div class="map-mini-list">${top.length ? top.map(m => `<div><span>${mName(m)}</span><b>${fmtN(st7[m].sets, 1)}</b></div>`).join('') + '<small>séries</small>' : '<p class="muted">Os músculos trabalhados aparecem aqui depois do primeiro treino.</p>'}</div>
    </div>
  </a>`;

  // Evoluções de carga
  const gains = loadGains(60).slice(0, 4);
  if (gains.length) {
    html += `<section class="card"><div class="card-head"><h3>Evoluções de carga</h3><span class="muted">60 dias</span></div>
      <div class="list">${gains.map(g => `<div class="row" data-act="evoGo" data-id="${g.id}"><div class="row-main"><b>${esc(g.name)}</b><span class="muted">${g.seq.slice(-4).map(fmtLoadShort).join(' → ')} ${unit()}</span></div><span class="pill pos">${ic('up')}+${fmtN(g.pct)}%</span></div>`).join('')}</div></section>`;
  }

  const wkRuns = (DB.runs || []).filter(r => new Date(r.start) >= ws);
  if ((DB.runs || []).length) {
    const lastRun = runsSorted().at(-1);
    html += `<a class="card run-mini" href="#/corridas"><div class="card-head"><h3>Corridas · esta semana</h3>${ic('right')}</div>
      <div class="run-mini-body"><div><b>${fmtKm(sumKm(wkRuns))}</b><span class="muted">${wkRuns.length} ${wkRuns.length === 1 ? 'corrida' : 'corridas'}</span></div>
      <div><b>${fmtKm(lastRun.distance)}</b><span class="muted">última · ${relDay(lastRun.start)} · ${fmtPace(lastRun.movingTime, lastRun.distance)}</span></div></div></a>`;
  }

  const ins = computeInsights().slice(0, 3);
  if (ins.length && (DB.sessions.length || DB.runs.length)) {
    html += `<section class="card"><div class="card-head"><h3>Insights</h3><a class="link" href="#/evolucao" data-act="evoTab" data-v="ins">Ver todos</a></div>${insightList(ins)}</section>`;
  }

  if (DB.sessions.length >= 3) {
    const lb = p.lastBackup ? daysBetween(p.lastBackup, now) : null;
    if (lb === null || lb > 14) html += `<button class="backup-nudge" data-act="exportJson">${ic('download')}<span>${lb === null ? 'Você ainda não fez backup dos seus dados.' : `Último backup há ${lb} dias.`} <b>Exportar agora</b></span></button>`;
  }
  return html;
}

const insightList = ins => `<ul class="insights">${ins.map(i => `<li>${ic(i.icon === 'down' ? 'down' : i.icon === 'up' ? 'up' : i.icon)}<span>${esc(i.text)}</span></li>`).join('')}</ul>`;

ACT.pickToday = el => { DB.ui.todayPick = { date: dayKey(new Date()), id: el.dataset.id }; saveDB(); rerender(); };
ACT.evoGo = el => { DB.ui.evoEx = el.dataset.id; DB.ui.evoTab = 'ex'; saveDB(); go('#/evolucao'); };
ACT.evoTab = el => { DB.ui.evoTab = el.dataset.v; saveDB(); go('#/evolucao'); };

/* ================= MEUS TREINOS ================= */
function libTabs(on) {
  return `<div class="seg seg-wide"><a class="${on === 'w' ? 'on' : ''}" href="#/treinos">Meus treinos</a><a class="${on === 'e' ? 'on' : ''}" href="#/exercicios">Exercícios</a></div>`;
}
function renderWorkouts() {
  let html = pageHead('Treinos', `<a class="btn btn-primary btn-sm" href="#/editar/novo">${ic('plus')}Novo</a>`) + libTabs('w');
  if (!DB.workouts.length) return html + emptyState('dumbbell', 'Nenhum treino', 'Crie seu primeiro treino.', `<a class="btn btn-primary" href="#/editar/novo">Criar treino</a>`);
  html += `<div class="wk-list">` + DB.workouts.map(w => {
    const mus = musclesOf(w), last = lastSessionOf(w.id);
    return `<article class="card wk-card">
      <div class="wk-top" data-act="wkEdit" data-id="${w.id}">
        <div><h3>${esc(w.name)}</h3><p class="wk-div">${esc(w.division || '')}${w.division && mus.primary.length ? ' — ' : ''}${mus.primary.map(mName).join('/')}</p></div>
        <button class="icon-btn" data-act="wkMenu" data-id="${w.id}" aria-label="Mais opções">${ic('more')}</button>
      </div>
      <div class="wk-meta"><span>${w.items.length} exercícios</span><span>~${estDuration(w)} min</span><span>${last ? 'Última: ' + relDay(last.start) : 'Nunca realizado'}</span></div>
      <button class="btn btn-primary btn-block" data-act="start" data-id="${w.id}">${ic('play')}Iniciar</button>
    </article>`;
  }).join('') + `</div>`;
  return html;
}
ACT.wkEdit = el => go('#/editar/' + el.dataset.id);
ACT.wkMenu = (el, e) => {
  e.stopPropagation();
  const w = getWorkout(el.dataset.id), i = DB.workouts.indexOf(w);
  openSheet(`<h3 class="sheet-title">${esc(w.name)}</h3><div class="menu">
    <button data-act="wkEdit" data-id="${w.id}">${ic('edit')}Editar</button>
    <button data-act="wkDup" data-id="${w.id}">${ic('copy')}Duplicar</button>
    ${i > 0 ? `<button data-act="wkMove" data-id="${w.id}" data-d="-1">${ic('up')}Mover para cima</button>` : ''}
    ${i < DB.workouts.length - 1 ? `<button data-act="wkMove" data-id="${w.id}" data-d="1">${ic('down')}Mover para baixo</button>` : ''}
    <button class="danger" data-act="wkDelete" data-id="${w.id}">${ic('trash')}Excluir</button></div>`);
};
ACT.wkDup = el => {
  closeAllSheets();
  const w = getWorkout(el.dataset.id);
  const copy = JSON.parse(JSON.stringify(w));
  copy.id = uid(); copy.name = w.name + ' (cópia)'; copy.items.forEach(it => it.id = uid());
  DB.workouts.splice(DB.workouts.indexOf(w) + 1, 0, copy); saveDB(); toast('Treino duplicado'); rerender();
};
ACT.wkMove = el => {
  closeAllSheets();
  const w = getWorkout(el.dataset.id), i = DB.workouts.indexOf(w), j = i + +el.dataset.d;
  DB.workouts.splice(i, 1); DB.workouts.splice(j, 0, w); saveDB(); rerender();
};
ACT.wkDelete = async el => {
  closeAllSheets();
  const w = getWorkout(el.dataset.id);
  if (!await confirmSheet({ title: `Excluir ${w.name}?`, text: 'O histórico de treinos realizados é mantido.', ok: 'Excluir', danger: true })) return;
  DB.workouts = DB.workouts.filter(x => x.id !== w.id); saveDB(); EDIT = null; toast('Treino excluído'); go('#/treinos');
};

/* ================= EDITOR DE TREINO ================= */
let EDIT = null;
function newWorkout() {
  return { id: uid(), name: `Treino ${String.fromCharCode(65 + DB.workouts.length % 26)}`, division: '', description: '', primary: [], secondary: [], notes: '', items: [] };
}
function renderEditor(id) {
  if (!EDIT || EDIT.forId !== id) {
    const src = id === 'novo' ? newWorkout() : getWorkout(id);
    if (!src) { setTimeout(() => go('#/treinos')); return ''; }
    EDIT = { forId: id, isNew: id === 'novo', draft: JSON.parse(JSON.stringify(src)), dirty: false, open: -1 };
  }
  const d = EDIT.draft;
  const musChips = (field, other) => MUSCLE_ORDER.map(m => `<button class="chip ${d[field].includes(m) ? 'on' : ''} ${d[other].includes(m) ? 'dim' : ''}" data-act="edMus" data-f="${field}" data-m="${m}">${mName(m)}</button>`).join('');
  return `<header class="page-head sticky-head">
      <button class="icon-btn" data-act="edCancel" aria-label="Cancelar">${ic('x')}</button>
      <h1 class="h-sm">${EDIT.isNew ? 'Novo treino' : 'Editar treino'}</h1>
      <button class="btn btn-primary btn-sm" data-act="edSave">Salvar</button>
    </header>
    <div class="form card">
      <label class="field"><span>Nome</span><input data-live="ed" data-f="name" value="${esc(d.name)}" placeholder="Ex.: Treino A" maxlength="40"></label>
      <div class="field"><span>Divisão</span><input data-live="ed" data-f="division" value="${esc(d.division)}" placeholder="Ex.: Inferiores">
        <div class="chips sm">${DIVISIONS.map(x => `<button class="chip ${d.division === x ? 'on' : ''}" data-act="edDiv" data-v="${x}">${x}</button>`).join('')}</div></div>
      <label class="field"><span>Descrição</span><textarea data-live="ed" data-f="description" rows="2" placeholder="Opcional">${esc(d.description)}</textarea></label>
      <div class="field"><span>Grupos musculares principais</span><div class="chips sm">${musChips('primary', 'secondary')}</div></div>
      <div class="field"><span>Grupos secundários</span><div class="chips sm">${musChips('secondary', 'primary')}</div></div>
      <label class="field"><span>Observações</span><textarea data-live="ed" data-f="notes" rows="2" placeholder="Opcional">${esc(d.notes)}</textarea></label>
    </div>
    <div class="section-head"><h2>Exercícios <small>${d.items.length}</small></h2>${d.items.length > 1 ? `<span class="muted small">Segure ${ic('grip')} e arraste</span>` : ''}</div>
    <ul class="ed-list" id="edList">${d.items.map((it, i) => edItem(it, i)).join('')}</ul>
    <button class="btn btn-soft btn-block" data-act="edAddEx">${ic('plus')}Adicionar exercícios</button>
    ${!EDIT.isNew ? `<button class="btn btn-text danger btn-block" data-act="wkDelete" data-id="${d.id}">${ic('trash')}Excluir treino</button>` : ''}
    <div class="spacer"></div>`;
}
function edItem(it, i) {
  const ex = getEx(it.exerciseId), open = EDIT.open === i;
  const rests = [45, 60, 75, 90, 120, 150, 180];
  return `<li class="ed-item ${open ? 'open' : ''}" data-i="${i}">
    <div class="ed-row">
      <span class="drag" aria-label="Arrastar para reordenar">${ic('grip')}</span>
      <div class="ed-main" data-act="edToggle" data-i="${i}">
        <div class="ed-name">${esc(ex?.name || 'Exercício removido')}</div>
        <div class="ed-sub">${it.sets} × ${repRange(it)} · ${it.load !== '' && it.load != null ? fmtLoad(it.load) : 'sem carga inicial'} · ${fmtRest(it.rest)}</div>
      </div>
      <button class="icon-btn" data-act="edToggle" data-i="${i}" aria-label="Detalhes">${ic(open ? 'up' : 'down')}</button>
    </div>
    ${open ? `<div class="ed-body">
      <div class="ed-grid">
        <div class="field"><span>Séries</span><div class="mini-stp"><button data-act="edAdj" data-i="${i}" data-f="sets" data-d="-1">${ic('minus')}</button><b>${it.sets}</b><button data-act="edAdj" data-i="${i}" data-f="sets" data-d="1">${ic('plus')}</button></div></div>
        <label class="field"><span>Reps mín.</span><input type="number" inputmode="numeric" min="1" data-live="edItem" data-i="${i}" data-f="repMin" value="${it.repMin ?? ''}"></label>
        <label class="field"><span>Reps máx.</span><input type="number" inputmode="numeric" min="1" data-live="edItem" data-i="${i}" data-f="repMax" value="${it.repMax ?? ''}"></label>
        <label class="field"><span>Carga inicial (${unit()})</span><input type="number" inputmode="decimal" step="any" min="0" data-live="edItem" data-i="${i}" data-f="load" value="${it.load ?? ''}" placeholder="—"></label>
      </div>
      <div class="field"><span>Descanso</span><div class="chips sm">${rests.map(r => `<button class="chip ${+it.rest === r ? 'on' : ''}" data-act="edRest" data-i="${i}" data-v="${r}">${fmtRest(r)}</button>`).join('')}</div></div>
      <label class="field"><span>Observações</span><input data-live="edItem" data-i="${i}" data-f="notes" value="${esc(it.notes || '')}" placeholder="Ex.: pausa de 1s no topo"></label>
      <div class="ed-actions">
        <button class="btn btn-ghost btn-sm" data-act="edDupItem" data-i="${i}">${ic('copy')}Duplicar</button>
        <button class="btn btn-ghost btn-sm" data-act="edSwap" data-i="${i}">${ic('swap')}Trocar</button>
        <button class="btn btn-ghost btn-sm danger" data-act="edRemove" data-i="${i}">${ic('trash')}Remover</button>
      </div>
    </div>` : ''}
  </li>`;
}
const edDirty = () => { EDIT.dirty = true; };
LIVE.ed = el => { EDIT.draft[el.dataset.f] = el.value; edDirty(); };
LIVE.edItem = el => {
  const it = EDIT.draft.items[+el.dataset.i], f = el.dataset.f;
  it[f] = f === 'notes' ? el.value : el.value === '' ? '' : +el.value;
  edDirty();
  const sub = el.closest('.ed-item')?.querySelector('.ed-sub');
  if (sub) sub.textContent = `${it.sets} × ${repRange(it)} · ${it.load !== '' && it.load != null ? fmtLoad(it.load) : 'sem carga inicial'} · ${fmtRest(it.rest)}`;
};
ACT.edDiv = el => { EDIT.draft.division = el.dataset.v; edDirty(); rerender(); };
ACT.edMus = el => {
  const d = EDIT.draft, f = el.dataset.f, m = el.dataset.m, other = f === 'primary' ? 'secondary' : 'primary';
  d[f] = d[f].includes(m) ? d[f].filter(x => x !== m) : [...d[f], m];
  d[other] = d[other].filter(x => x !== m);
  edDirty(); rerender();
};
ACT.edToggle = el => { const i = +el.dataset.i; EDIT.open = EDIT.open === i ? -1 : i; rerender(); };
ACT.edAdj = el => { const it = EDIT.draft.items[+el.dataset.i]; it.sets = Math.max(1, Math.min(12, (+it.sets || 0) + +el.dataset.d)); edDirty(); rerender(); };
ACT.edRest = el => { EDIT.draft.items[+el.dataset.i].rest = +el.dataset.v; edDirty(); rerender(); };
ACT.edDupItem = el => { const i = +el.dataset.i, it = EDIT.draft.items[i]; EDIT.draft.items.splice(i + 1, 0, { ...it, id: uid() }); EDIT.open = i + 1; edDirty(); rerender(); };
ACT.edRemove = el => { EDIT.draft.items.splice(+el.dataset.i, 1); EDIT.open = -1; edDirty(); rerender(); };
ACT.edSwap = el => {
  const i = +el.dataset.i;
  openPicker({ multi: false, title: 'Trocar exercício', onPick: ids => { EDIT.draft.items[i].exerciseId = ids[0]; edDirty(); rerender(); } });
};
ACT.edAddEx = () => openPicker({
  multi: true, title: 'Adicionar exercícios', onPick: ids => {
    ids.forEach(id => EDIT.draft.items.push({ id: uid(), exerciseId: id, sets: 3, repMin: 8, repMax: 12, load: '', rest: DB.profile.defaultRest, notes: '' }));
    EDIT.open = -1; edDirty(); rerender();
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  },
});
ACT.edSave = () => {
  const d = EDIT.draft;
  d.name = (d.name || '').trim();
  if (!d.name) { toast('Dê um nome ao treino'); return; }
  d.items.forEach(it => { if (it.repMin && it.repMax && +it.repMin > +it.repMax) [it.repMin, it.repMax] = [it.repMax, it.repMin]; });
  const i = DB.workouts.findIndex(w => w.id === d.id);
  if (i >= 0) DB.workouts[i] = d; else DB.workouts.push(d);
  saveDB(); EDIT = null; toast('Treino salvo'); go('#/treinos');
};
ACT.edCancel = async () => {
  if (EDIT?.dirty && !await confirmSheet({ title: 'Descartar alterações?', ok: 'Descartar', danger: true })) return;
  EDIT = null; go('#/treinos');
};

/* Arrastar para reordenar (pointer events; funciona com toque e mouse). */
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('.ed-item .drag'); if (!h || !EDIT) return;
  e.preventDefault();
  const li = h.closest('.ed-item'), list = li.parentElement;
  li.classList.add('dragging'); list.classList.add('is-dragging');
  h.setPointerCapture(e.pointerId);
  let scrollT = null, lastY = e.clientY;
  const place = y => {
    const items = [...list.children].filter(x => x !== li);
    let before = null;
    for (const it of items) { const r = it.getBoundingClientRect(); if (y < r.top + r.height / 2) { before = it; break; } }
    if (li.nextElementSibling !== before) list.insertBefore(li, before);
  };
  const move = ev => {
    lastY = ev.clientY; place(lastY);
    clearInterval(scrollT);
    const edge = 80;
    if (lastY < edge || lastY > innerHeight - edge) scrollT = setInterval(() => { window.scrollBy(0, lastY < edge ? -10 : 10); place(lastY); }, 16);
  };
  const up = () => {
    clearInterval(scrollT);
    h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
    li.classList.remove('dragging'); list.classList.remove('is-dragging');
    const order = [...list.children].map(x => +x.dataset.i);
    if (order.some((v, i) => v !== i)) { EDIT.draft.items = order.map(i => EDIT.draft.items[i]); EDIT.open = -1; edDirty(); }
    rerender();
  };
  h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
});

/* ================= BANCO DE EXERCÍCIOS ================= */
const groupFilterChips = (act, cur) => `<div class="chips scroll">${[['all', 'Todos'], ...MUSCLE_ORDER.map(m => [m, mName(m)])].map(([v, l]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
const visibleExercises = () => DB.exercises.filter(e => !e.archived);
function filterExercises(q, g) {
  const nq = norm(q);
  return visibleExercises().filter(e => (g === 'all' || e.primary === g || (q && e.secondary.includes(g))) && (!nq || norm(e.name).includes(nq) || norm(e.equipment).includes(nq)))
    .sort((a, b) => MUSCLE_ORDER.indexOf(a.primary) - MUSCLE_ORDER.indexOf(b.primary) || a.name.localeCompare(b.name, 'pt'));
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function renderLibrary() {
  const g = DB.ui.libG || 'all', q = DB.ui.libQ || '';
  return pageHead('Exercícios', `<button class="btn btn-primary btn-sm" data-act="exNew">${ic('plus')}Novo</button>`) + libTabs('e') + `
    <div class="search">${ic('search')}<input type="search" data-live="libQ" value="${esc(q)}" placeholder="Buscar exercício ou equipamento"></div>
    ${groupFilterChips('libG', g)}
    <div id="libList">${libListHTML(q, g)}</div>`;
}
function libListHTML(q, g) {
  const list = filterExercises(q, g);
  if (!list.length) return emptyState('search', 'Nada encontrado', 'Tente outro termo ou crie um exercício personalizado.');
  let cur = null, html = '';
  list.forEach(e => {
    if (e.primary !== cur) { if (cur) html += '</div>'; cur = e.primary; html += `<h4 class="group-h">${REGIONS[MUSCLES[cur].region]} · ${mName(cur)}</h4><div class="list card">`; }
    html += `<div class="row" data-act="exOpen" data-id="${e.id}"><div class="row-main"><b>${esc(e.name)}${e.builtin ? '' : ' <span class="pill sm">pessoal</span>'}</b><span class="muted">${esc(e.equipment)}${e.secondary.length ? ' · ' + e.secondary.map(mName).join(', ') : ''}</span></div>${ic('right', 'chev')}</div>`;
  });
  return html + '</div>';
}
LIVE.libQ = el => { DB.ui.libQ = el.value; $('#libList').innerHTML = libListHTML(el.value, DB.ui.libG || 'all'); };
ACT.libG = el => { DB.ui.libG = el.dataset.v; saveDB(); rerender(); };

ACT.exOpen = el => {
  const e = getEx(el.dataset.id); if (!e) return;
  const rec = exerciseRecords(e.id);
  openSheet(`<div class="ex-detail">
    <h3 class="sheet-title">${esc(e.name)}</h3>
    <div class="tags"><span class="pill acc">${mName(e.primary)}</span>${e.secondary.map(m => `<span class="pill">${mName(m)}</span>`).join('')}<span class="pill ghost">${esc(e.equipment)}</span></div>
    ${e.image ? `<img class="ex-img" src="${esc(e.image)}" alt="" loading="lazy">` : ''}
    ${e.instructions ? `<p class="ex-instr">${esc(e.instructions)}</p>` : ''}
    ${rec ? `<div class="mini-stats">
      <div><small>Maior carga</small><b>${fmtLoad(rec.maxLoad.load)} × ${rec.maxLoad.reps}</b></div>
      <div><small>Melhor série</small><b>${fmtLoadShort(rec.best.load)} × ${rec.best.reps}</b></div>
      <div><small>Última</small><b>${fmtLoad(rec.last.maxLoad)}</b></div>
      <div><small>Sessões</small><b>${rec.h.length}</b></div></div>
      ${rec.h.length > 1 ? lineChart(rec.h.slice(-12).map(x => ({ label: fmtShort(x.date), y: x.maxLoad })), { h: 140, unitLabel: ' ' + unit() }) : ''}
      <button class="btn btn-soft btn-block" data-act="evoGo" data-id="${e.id}" data-close>${ic('chart')}Ver evolução completa</button>`
      : `<p class="muted small">Ainda sem registros deste exercício.</p>`}
    <div class="sheet-actions"><button class="btn btn-ghost" data-act="exEdit" data-id="${e.id}">${ic('edit')}Editar</button>${!e.builtin ? `<button class="btn btn-ghost danger" data-act="exDelete" data-id="${e.id}">${ic('trash')}Excluir</button>` : ''}</div>
  </div>`);
};

let EXF = null;
ACT.exNew = () => exForm(null);
ACT.exEdit = el => { closeAllSheets(); exForm(getEx(el.dataset.id)); };
function exForm(ex, onSaved) {
  EXF = ex ? { ...ex, secondary: [...ex.secondary] } : { id: null, name: '', primary: '', secondary: [], equipment: 'Máquina', instructions: '', image: '' };
  EXF._onSaved = onSaved;
  const w = openSheet('', { cls: 'tall' });
  EXF._w = w; exFormRender();
}
function exFormRender() {
  const f = EXF;
  setSheet(f._w, `<h3 class="sheet-title">${f.id ? 'Editar exercício' : 'Novo exercício'}</h3>
    <label class="field"><span>Nome</span><input data-live="exf" data-f="name" value="${esc(f.name)}" placeholder="Ex.: Hip thrust na máquina"></label>
    <div class="field"><span>Grupo muscular principal</span><div class="chips sm">${MUSCLE_ORDER.map(m => `<button class="chip ${f.primary === m ? 'on' : ''}" data-act="exfPrim" data-m="${m}">${mName(m)}</button>`).join('')}</div></div>
    <div class="field"><span>Músculos secundários</span><div class="chips sm">${MUSCLE_ORDER.filter(m => m !== f.primary).map(m => `<button class="chip ${f.secondary.includes(m) ? 'on' : ''}" data-act="exfSec" data-m="${m}">${mName(m)}</button>`).join('')}</div></div>
    <div class="field"><span>Equipamento</span><div class="chips sm">${EQUIPMENT.map(q => `<button class="chip ${f.equipment === q ? 'on' : ''}" data-act="exfEq" data-v="${q}">${q}</button>`).join('')}</div></div>
    <label class="field"><span>Instruções curtas</span><textarea data-live="exf" data-f="instructions" rows="3">${esc(f.instructions)}</textarea></label>
    <label class="field"><span>Imagem/animação (URL, opcional)</span><input data-live="exf" data-f="image" value="${esc(f.image)}" placeholder="https://…" inputmode="url"></label>
    <div class="sheet-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-act="exfSave">Salvar</button></div>`);
}
LIVE.exf = el => { EXF[el.dataset.f] = el.value; };
ACT.exfPrim = el => { EXF.primary = el.dataset.m; EXF.secondary = EXF.secondary.filter(m => m !== EXF.primary); exFormRender(); };
ACT.exfSec = el => { const m = el.dataset.m; EXF.secondary = EXF.secondary.includes(m) ? EXF.secondary.filter(x => x !== m) : [...EXF.secondary, m]; exFormRender(); };
ACT.exfEq = el => { EXF.equipment = el.dataset.v; exFormRender(); };
ACT.exfSave = () => {
  const f = EXF;
  if (!f.name.trim()) return toast('Informe o nome');
  if (!f.primary) return toast('Escolha o grupo principal');
  const { _w, _onSaved, ...data } = f;
  data.name = data.name.trim();
  if (data.id) { const i = DB.exercises.findIndex(e => e.id === data.id); DB.exercises[i] = { ...DB.exercises[i], ...data }; }
  else { data.id = 'x-' + uid(); data.builtin = false; DB.exercises.push(data); }
  saveDB(); closeSheet(_w); toast('Exercício salvo');
  if (_onSaved) _onSaved(data.id); else if (parseHash().name === 'exercicios') rerender();
};
ACT.exDelete = async el => {
  const e = getEx(el.dataset.id);
  closeAllSheets();
  const used = DB.sessions.some(s => s.exercises.some(x => x.exerciseId === e.id));
  if (!await confirmSheet({ title: `Excluir ${e.name}?`, text: used ? 'O exercício tem histórico: ele será ocultado da lista, mas os registros continuam nas estatísticas.' : 'Também será removido dos treinos em que aparece.', ok: 'Excluir', danger: true })) return;
  if (used) e.archived = true; else DB.exercises = DB.exercises.filter(x => x.id !== e.id);
  DB.workouts.forEach(w => w.items = w.items.filter(it => it.exerciseId !== e.id));
  saveDB(); rerender();
};

/* Seletor de exercícios (folha) */
let PICK = null;
function openPicker({ multi = true, title, onPick }) {
  PICK = { sel: [], q: '', g: 'all', multi, onPick };
  PICK.w = openSheet(`<h3 class="sheet-title">${esc(title)}</h3>
    <div class="search">${ic('search')}<input type="search" data-live="pickQ" placeholder="Buscar exercício"></div>
    <div id="pickChips">${groupFilterChips('pickG', 'all')}</div>
    <div id="pickList" class="pick-list"></div>
    <div class="sheet-foot">
      <button class="btn btn-ghost" data-act="pickNew">${ic('plus')}Criar</button>
      ${multi ? `<button class="btn btn-primary" data-act="pickDone" id="pickBtn" disabled>Adicionar</button>` : ''}
    </div>`, { cls: 'tall' });
  pickRender();
}
function pickRender() {
  const list = filterExercises(PICK.q, PICK.g);
  $('#pickList').innerHTML = list.length ? list.map(e => `<div class="row pick ${PICK.sel.includes(e.id) ? 'on' : ''}" data-act="pickToggle" data-id="${e.id}">
      <div class="row-main"><b>${esc(e.name)}</b><span class="muted">${mName(e.primary)} · ${esc(e.equipment)}</span></div>
      <span class="pick-chk">${PICK.sel.includes(e.id) ? ic('check') : ''}</span></div>`).join('') : `<p class="muted center">Nenhum exercício encontrado.</p>`;
  const b = $('#pickBtn'); if (b) { b.disabled = !PICK.sel.length; b.textContent = PICK.sel.length ? `Adicionar (${PICK.sel.length})` : 'Adicionar'; }
}
LIVE.pickQ = el => { PICK.q = el.value; pickRender(); };
ACT.pickG = el => { PICK.g = el.dataset.v; $('#pickChips').innerHTML = groupFilterChips('pickG', PICK.g); pickRender(); };
ACT.pickToggle = el => {
  const id = el.dataset.id;
  if (!PICK.multi) { const cb = PICK.onPick; closeSheet(PICK.w); cb([id]); return; }
  PICK.sel = PICK.sel.includes(id) ? PICK.sel.filter(x => x !== id) : [...PICK.sel, id];
  pickRender();
};
ACT.pickDone = () => { const { sel, onPick, w } = PICK; closeSheet(w); onPick(sel); };
ACT.pickNew = () => exForm(null, id => {
  if (PICK.multi) { PICK.sel.push(id); PICK.q = ''; pickRender(); }
  else { const cb = PICK.onPick; closeSheet(PICK.w); cb([id]); }
});

/* ================= MAPA MUSCULAR ================= */
function mapPeriod() {
  const p = DB.ui.mapPeriod || '7d', now = new Date();
  if (p === 'last') {
    if (DB.active) return { p, sessions: [activeAsSession()], label: `Treino atual · ${DB.active.workoutName}`, weeks: null };
    const last = sortedSessions().at(-1);
    return { p, sessions: last ? [last] : [], label: last ? `${last.workoutName} · ${fmtDate(last.start)}` : 'Nenhum treino registrado', weeks: null };
  }
  let from, to = now;
  if (p === 'custom') {
    from = DB.ui.mapFrom ? parseDayKey(DB.ui.mapFrom) : addDays(startOfDay(now), -13);
    to = DB.ui.mapTo ? endOfDay(parseDayKey(DB.ui.mapTo)) : now;
  } else from = addDays(startOfDay(now), p === '30d' ? -29 : -6);
  const days = Math.max(1, daysBetween(from, to) + 1);
  return { p, from, to, sessions: sessionsBetween(from, to), label: `${fmtShort(from)} – ${fmtShort(to)}`, weeks: days / 7 };
}
function renderMap() {
  const per = mapPeriod(), view = DB.ui.mapView || 'both';
  const st = muscleStats(per.sessions), lv = levelsFrom(st);
  const max = Math.max(0, ...MUSCLE_ORDER.map(m => st[m].sets));
  const totalSets = per.sessions.reduce((a, s) => a + sessionStats(s).sets, 0);
  const prio = DB.profile.priorities;
  const ranked = MUSCLE_ORDER.slice().sort((a, b) => st[b].sets - st[a].sets);
  const reg = { inf: 0, sup: 0, core: 0 };
  MUSCLE_ORDER.forEach(m => reg[MUSCLES[m].region] += st[m].sets);
  const regTot = reg.inf + reg.sup + reg.core;

  let html = pageHead('Mapa muscular', '', esc(per.label));
  html += `<div class="seg seg-wide">${[['last', DB.active ? 'Treino atual' : 'Último treino'], ['7d', '7 dias'], ['30d', '30 dias'], ['custom', 'Período']].map(([v, l]) => `<button class="${per.p === v ? 'on' : ''}" data-act="mapP" data-v="${v}">${l}</button>`).join('')}</div>`;
  if (per.p === 'custom') html += `<div class="date-range"><label>De<input type="date" data-bind="mapFrom" value="${dayKey(per.from)}"></label><label>Até<input type="date" data-bind="mapTo" value="${dayKey(per.to)}"></label></div>`;

  html += `<section class="card map-card">
    <div class="map-tools">${seg('mapV', [['both', 'Ambos'], ['front', 'Frente'], ['back', 'Costas']], view)}${intensityLegend()}</div>
    ${bodyPair(lv, { interactive: true, view })}
    <p class="muted small center">${per.sessions.length} ${per.sessions.length === 1 ? 'treino' : 'treinos'} · ${totalSets} séries · toque em um músculo para detalhes</p>
  </section>`;

  if (!max) return html + `<section class="card">${emptyState('body', 'Sem dados no período', 'Conclua séries em um treino para ver a distribuição muscular.')}</section>`;

  html += `<section class="card"><div class="card-head"><h3>Distribuição</h3><span class="muted small">séries</span></div>
    ${regTot ? `<div class="region-bar">${Object.keys(reg).filter(r => reg[r]).map(r => `<i class="rg-${r}" style="flex:${reg[r]}"><span>${REGIONS[r]} ${fmtN(reg[r] / regTot * 100)}%</span></i>`).join('')}</div>` : ''}
    ${hBars(ranked.map(m => ({
      key: m, label: mName(m), value: st[m].sets, level: lv[m] || 0,
      tag: prio[m] === 'alta' ? ' <span class="prio hi">alta</span>' : prio[m] === 'media' ? ' <span class="prio md">média</span>' : '',
    })))}
    <p class="muted small note">Séries em que o músculo é secundário contam como 0,5. Os números descrevem o que foi registrado e não indicam um volume ideal.</p>
  </section>`;
  return html;
}
ACT.mapP = el => { DB.ui.mapPeriod = el.dataset.v; saveDB(); rerender(); };
ACT.mapV = el => { DB.ui.mapView = el.dataset.v; saveDB(); rerender(); };
BIND.mapFrom = el => { DB.ui.mapFrom = el.value; saveDB(); rerender(); };
BIND.mapTo = el => { DB.ui.mapTo = el.value; saveDB(); rerender(); };

ACT.muscle = el => {
  const m = el.dataset.m;
  const onMap = parseHash().name === 'mapa';
  const per = onMap ? mapPeriod() : (() => { const now = new Date(), from = addDays(startOfDay(now), -6); return { sessions: sessionsBetween(from, now), label: 'Últimos 7 dias', weeks: 1 }; })();
  const st = muscleStats(per.sessions), s = st[m];
  const max = Math.max(...MUSCLE_ORDER.map(x => st[x].sets));
  const recent = muscleStats(sessionsBetween(addDays(startOfDay(new Date()), -6), new Date()));
  const rmax = Math.max(...MUSCLE_ORDER.map(x => recent[x].sets));
  const cls = stimulusLabel(recent[m].sets, rmax);
  const exs = [...s.exercises.entries()].sort((a, b) => b[1] - a[1]);
  const weeks = weekBuckets(8).map(b => ({ label: fmtShort(b.from), y: muscleStats(b.sessions)[m].sets }));
  const prio = { alta: 'Alta', media: 'Média' }[DB.profile.priorities[m]] || 'Normal';
  const lastAll = sortedSessions().slice().reverse().find(x => muscleStats([x])[m].sets > 0);
  openSheet(`<div class="mus-detail">
    <div class="mus-head"><div><small class="muted">${esc(per.label)}</small><h3 class="sheet-title">${esc(MUSCLES[m].long || mName(m)).toUpperCase()}</h3></div>
      <div class="stim ${cls.c}"><small>Estímulo recente</small><b>${cls.t}</b></div></div>
    <div class="mini-stats">
      <div><small>Séries realizadas</small><b>${fmtN(s.sets, 1)}</b></div>
      <div><small>Exercícios</small><b>${exs.length}</b></div>
      <div><small>Volume estimado</small><b>${fmtVol(s.volume)}</b></div>
      <div><small>Frequência</small><b>${per.weeks ? fmtN(s.days.size / Math.max(1, per.weeks), 1) + '×/sem' : s.sessions ? 'neste treino' : '—'}</b></div>
      <div><small>Último estímulo</small><b>${lastAll ? relDay(lastAll.start) : '—'}</b></div>
      <div><small>Prioridade</small><b>${prio}</b></div>
    </div>
    ${exs.length ? `<h4 class="sub-h">Exercícios responsáveis pelo estímulo</h4><div class="list">${exs.map(([id, n]) => `<div class="row" data-act="exOpen" data-id="${id}"><div class="row-main"><b>${esc(getEx(id)?.name || '?')}</b><span class="muted">${getEx(id)?.primary === m ? 'principal' : 'secundário'}</span></div><span class="muted">${fmtN(n, 1)} séries</span></div>`).join('')}</div>` : `<p class="muted">Nenhuma série para este grupo no período.</p>`}
    <h4 class="sub-h">Séries por semana · 8 semanas</h4>
    ${barChart(weeks, { h: 120, fmt: v => fmtN(v, 1) })}
    <p class="muted small note">“Estímulo recente” compara as séries dos últimos 7 dias deste grupo com o grupo mais trabalhado no mesmo período.</p>
  </div>`, { cls: 'tall' });
};

/* ================= EVOLUÇÃO ================= */
function renderEvolution() {
  const tab = DB.ui.evoTab || 'ex';
  let html = pageHead('Evolução') + seg('evoT', [['ex', 'Exercício'], ['vol', 'Volume'], ['pr', 'Recordes'], ['ins', 'Insights']], tab).replace('class="seg"', 'class="seg seg-wide"');
  if (!DB.sessions.length) return html + emptyState('chart', 'Sem registros ainda', 'Seus gráficos aparecem depois do primeiro treino concluído.');
  if (tab === 'ex') html += evoExercise();
  if (tab === 'vol') html += evoVolume();
  if (tab === 'pr') html += evoRecords();
  if (tab === 'ins') html += `<section class="card">${insightList(computeInsights())}<p class="muted small note">Baseado apenas nos treinos registrados.</p></section>`;
  return html;
}
ACT.evoT = el => { DB.ui.evoTab = el.dataset.v; saveDB(); rerender(); };
BIND.evoEx = el => { DB.ui.evoEx = el.value; saveDB(); rerender(); };
ACT.evoM = el => { DB.ui.evoMetric = el.dataset.v; saveDB(); rerender(); };

function trainedExerciseIds() {
  const c = {};
  DB.sessions.forEach(s => s.exercises.forEach(e => { if (doneSets(e).length) c[e.exerciseId] = (c[e.exerciseId] || 0) + 1; }));
  return Object.keys(c).sort((a, b) => c[b] - c[a]);
}
function evoExercise() {
  const ids = trainedExerciseIds();
  if (!ids.length) return emptyState('chart', 'Sem séries concluídas', '');
  const sel = ids.includes(DB.ui.evoEx) ? DB.ui.evoEx : ids[0];
  const rec = exerciseRecords(sel), metric = DB.ui.evoMetric || 'load';
  const val = x => metric === 'load' ? x.maxLoad : metric === 'e1rm' ? Math.round(x.e1rm * 10) / 10 : metric === 'reps' ? x.maxReps : x.volume;
  const pts = rec.h.slice(-20).map(x => ({ label: fmtShort(x.date), y: val(x) }));
  const seqLoads = rec.h.map(x => x.maxLoad).filter((v, i, a) => i === 0 || v !== a[i - 1]).slice(-6);
  const prev = rec.h.at(-2), last = rec.last;
  let prog = '';
  if (prev) {
    if (last.maxLoad > prev.maxLoad) prog = `<div class="prog up">${ic('up')}<div><b>Progressão</b><span>Você aumentou ${fmtN(last.maxLoad - prev.maxLoad, 2)} ${unit()} neste exercício em relação ao treino anterior.</span></div></div>`;
    else if (last.maxLoad === prev.maxLoad && last.maxLoadReps > prev.maxLoadReps) prog = `<div class="prog up">${ic('up')}<div><b>Progressão</b><span>+${last.maxLoadReps - prev.maxLoadReps} repetições com ${fmtLoad(last.maxLoad)}.</span></div></div>`;
  }
  const opts = ids.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(getEx(id)?.name || id)}</option>`).join('');
  const unitL = metric === 'reps' ? ' reps' : ' ' + unit();
  return `<section class="card">
    <label class="select"><select data-bind="evoEx" aria-label="Exercício">${opts}</select>${ic('down')}</label>
    <div class="seq">${seqLoads.map(fmtLoadShort).join(' <i>→</i> ')} <small>${unit()}</small></div>
    ${prog}
    <div class="mini-stats">
      <div><small>Maior carga</small><b>${fmtLoad(rec.maxLoad.load)} × ${rec.maxLoad.reps}</b></div>
      <div><small>Mais repetições</small><b>${rec.maxReps.reps} reps · ${fmtLoadShort(rec.maxReps.load)}</b></div>
      <div><small>Melhor série</small><b>${fmtLoadShort(rec.best.load)} × ${rec.best.reps}</b><small>1RM est. ${fmtN(e1rm(rec.best), 1)}</small></div>
      <div><small>Última carga</small><b>${fmtLoad(last.maxLoad)}</b></div>
      <div><small>Evolução</small><b class="${rec.pct > 0 ? 'pos' : rec.pct < 0 ? 'neg' : ''}">${rec.pct == null ? '—' : (rec.pct > 0 ? '+' : '') + fmtN(rec.pct, 1) + '%'}</b><small>desde o 1º registro</small></div>
      <div><small>Sessões</small><b>${rec.h.length}</b></div>
    </div>
    ${seg('evoM', [['load', 'Carga'], ['e1rm', '1RM est.'], ['reps', 'Reps'], ['vol', 'Volume']], metric)}
    ${lineChart(pts, { unitLabel: metric === 'vol' ? '' : unitL, fmt: v => fmtN(v, metric === 'reps' || metric === 'vol' ? 0 : 1) })}
  </section>
  <section class="card"><div class="card-head"><h3>Histórico</h3></div>
    <div class="list">${rec.h.slice().reverse().slice(0, 15).map(x => `<div class="row" data-act="sessOpen" data-id="${x.sessionId}"><div class="row-main"><b>${fmtDate(x.date)}</b><span class="muted">${x.sets.map(s => `${fmtLoadShort(s.load)}×${s.reps}`).join(' · ')}</span></div>${ic('right', 'chev')}</div>`).join('')}</div>
  </section>`;
}
function evoVolume() {
  const recent = sortedSessions().slice(-12);
  const weeks = weekBuckets(12);
  const st4 = muscleStats(sessionsBetween(addDays(startOfDay(new Date()), -27), new Date()));
  const lv = levelsFrom(st4);
  return `<section class="card"><div class="card-head"><h3>Volume por treino</h3><span class="muted small">${unit()} × reps</span></div>
      ${barChart(recent.map(s => ({ label: fmtShort(s.start), y: sessionStats(s).vol })), { fmt: v => fmtVol(v) })}</section>
    <section class="card"><div class="card-head"><h3>Volume semanal</h3><span class="muted small">12 semanas</span></div>
      ${barChart(weeks.map(b => ({ label: fmtShort(b.from), y: b.sessions.reduce((a, s) => a + sessionStats(s).vol, 0) })), { fmt: v => fmtVol(v) })}</section>
    <section class="card"><div class="card-head"><h3>Frequência de treino</h3><span class="muted small">treinos/semana</span></div>
      ${barChart(weeks.map(b => ({ label: fmtShort(b.from), y: b.sessions.length })), { target: DB.profile.weeklyTarget })}</section>
    <section class="card"><div class="card-head"><h3>Séries por grupo muscular</h3><span class="muted small">últimas 4 semanas</span></div>
      ${hBars(MUSCLE_ORDER.slice().sort((a, b) => st4[b].sets - st4[a].sets).map(m => ({ key: m, label: mName(m), value: st4[m].sets, level: lv[m] })))}
      <a class="btn btn-soft btn-block" href="#/mapa">${ic('body')}Abrir mapa muscular</a></section>`;
}
function evoRecords() {
  const ids = trainedExerciseIds();
  const recs = ids.map(id => ({ id, r: exerciseRecords(id) })).filter(x => x.r).sort((a, b) => (getEx(a.id)?.name || '').localeCompare(getEx(b.id)?.name || '', 'pt'));
  return `<section class="card"><div class="list">${recs.map(({ id, r }) => `<div class="row" data-act="evoGo" data-id="${id}">
    <div class="row-main"><b>${esc(getEx(id)?.name || id)}</b><span class="muted">Melhor série ${fmtLoadShort(r.best.load)} × ${r.best.reps} · ${r.h.length} sessões</span></div>
    <div class="rec-v">${ic('trophy')}<b>${fmtLoad(r.maxLoad.load)}</b></div></div>`).join('')}</div></section>`;
}

/* ================= HISTÓRICO & CALENDÁRIO ================= */
function renderHistory() {
  const mode = DB.ui.histMode || 'list';
  let html = pageHead('Histórico') + seg('histM', [['list', 'Lista'], ['cal', 'Calendário']], mode).replace('class="seg"', 'class="seg seg-wide"');
  if (mode === 'cal') return html + renderCalendar();
  const ss = sortedSessions().slice().reverse();
  if (!ss.length) return html + emptyState('history', 'Nenhum treino registrado', 'Os treinos concluídos aparecem aqui em ordem cronológica.');
  let curM = null;
  html += '<div class="timeline">';
  ss.forEach(s => {
    const m = fmtDate(s.start, { month: 'long', year: 'numeric' });
    if (m !== curM) { curM = m; html += `<h4 class="group-h">${m}</h4>`; }
    const st = sessionStats(s);
    html += `<button class="tl-item" data-act="sessOpen" data-id="${s.id}">
      <div class="tl-date"><b>${fmtDate(s.start, { day: '2-digit' })}</b><small>${fmtDate(s.start, { weekday: 'short' }).replace('.', '')}</small></div>
      <div class="tl-main"><b>${esc(s.workoutName)}</b><span class="muted">${fmtDur(s.duration)} · ${st.exs} exercícios · ${st.sets} séries · ${fmtVol(st.vol)}</span></div>${ic('right', 'chev')}
    </button>`;
  });
  return html + '</div>';
}
ACT.histM = el => { DB.ui.histMode = el.dataset.v; saveDB(); rerender(); };

function renderCalendar() {
  const now = new Date();
  const base = DB.ui.calMonth ? parseDayKey(DB.ui.calMonth) : new Date(now.getFullYear(), now.getMonth(), 1);
  const y = base.getFullYear(), mo = base.getMonth();
  const first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate(), off = (first.getDay() + 6) % 7;
  const byDay = {};
  DB.sessions.forEach(s => (byDay[dayKey(s.start)] = byDay[dayKey(s.start)] || []).push(s));
  const runDay = {};
  (DB.runs || []).forEach(r => (runDay[dayKey(r.start)] = runDay[dayKey(r.start)] || []).push(r));
  const firstSess = sortedSessions()[0];
  const planStart = startOfDay(firstSess && firstSess.start < DB.profile.createdAt ? firstSess.start : DB.profile.createdAt);
  const today = startOfDay(now);
  let done = 0, missed = 0, cells = '';
  for (let i = 0; i < off; i++) cells += '<div class="cal-c empty"></div>';
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, mo, d), k = dayKey(date), ss = byDay[k], rr = runDay[k];
    const planned = DB.profile.plannedDays.includes(date.getDay());
    let st = 'rest';
    if (ss) { st = 'done'; done++; }
    else if (planned && date < today && date >= planStart) { st = 'missed'; missed++; }
    else if (planned && date >= today) st = 'planned';
    cells += `<button class="cal-c ${st} ${k === dayKey(now) ? 'today' : ''} ${rr ? 'ran' : ''}" ${ss || rr ? `data-act="calDay" data-k="${k}"` : 'disabled'}><span>${d}</span>${ss && ss.length > 1 ? `<small>${ss.length}</small>` : ''}</button>`;
  }
  const prev = new Date(y, mo - 1, 1), next = new Date(y, mo + 1, 1);
  return `<section class="card cal">
    <div class="cal-head"><button class="icon-btn" data-act="calNav" data-k="${dayKey(prev)}" aria-label="Mês anterior">${ic('left')}</button>
      <h3>${fmtDate(first, { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase())}</h3>
      <button class="icon-btn" data-act="calNav" data-k="${dayKey(next)}" aria-label="Próximo mês">${ic('right')}</button></div>
    <div class="cal-grid wk">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(l => `<span>${l}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-legend"><span><i class="done"></i>Realizado</span><span><i class="planned"></i>Planejado</span><span><i class="missed"></i>Perdido</span><span><i class="rest"></i>Descanso</span><span><i class="ran"></i>Corrida</span></div>
  </section>
  <div class="stats"><div class="stat"><div class="stat-v">${done}</div><div class="stat-l">treinos no mês</div></div><div class="stat"><div class="stat-v">${missed}</div><div class="stat-l">dias planejados sem treino</div></div></div>
  <p class="muted small center">Dias planejados vêm das Preferências (${DB.profile.plannedDays.length ? DB.profile.plannedDays.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d]).join(', ') : 'nenhum'}).</p>`;
}
ACT.calNav = el => { DB.ui.calMonth = el.dataset.k; saveDB(); rerender(); };
ACT.calDay = el => {
  const ss = DB.sessions.filter(s => dayKey(s.start) === el.dataset.k);
  const rr = (DB.runs || []).filter(r => dayKey(r.start) === el.dataset.k);
  if (ss.length === 1 && !rr.length) return ACT.sessOpen({ dataset: { id: ss[0].id } });
  if (rr.length === 1 && !ss.length) return ACT.runOpen({ dataset: { id: rr[0].id } });
  openSheet(`<h3 class="sheet-title">${fmtDate(parseDayKey(el.dataset.k))}</h3><div class="list">${ss.map(s => `<div class="row" data-act="sessOpen" data-id="${s.id}"><div class="row-main"><b>${esc(s.workoutName)}</b><span class="muted">${fmtTime(s.start)} · ${fmtDur(s.duration)}</span></div>${ic('right', 'chev')}</div>`).join('')}${rr.map(r => `<div class="row" data-act="runOpen" data-id="${r.id}"><div class="row-main"><b>${esc(r.name)}</b><span class="muted">${fmtTime(r.start)} · ${fmtKm(r.distance)} · ${fmtPace(r.movingTime, r.distance)}</span></div>${ic('right', 'chev')}</div>`).join('')}</div>`);
};

let SESS_EDIT = false;
ACT.sessOpen = el => {
  closeAllSheets();
  SESS_EDIT = false;
  const w = openSheet('', { cls: 'tall', onClose: () => { if (SESS_EDIT) { SESS_EDIT = false; saveDB(); rerender(); } } });
  w._sid = el.dataset.id; sessRender(w);
};
function sessRender(w) {
  const s = DB.sessions.find(x => x.id === w._sid); if (!s) return closeSheet(w);
  const st = sessionStats(s), cmp = compareSession(s);
  const cmpBy = Object.fromEntries(cmp.map(c => [c.name, c]));
  setSheet(w, `<div class="sess">
    <small class="muted">${lower(fmtDate(s.start, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }))} · ${fmtTime(s.start)}</small>
    <h3 class="sheet-title">${esc(s.workoutName)}</h3>
    <div class="mini-stats four"><div><small>Duração</small><b>${fmtDur(s.duration)}</b></div><div><small>Exercícios</small><b>${st.exs}</b></div><div><small>Séries</small><b>${st.sets}</b></div><div><small>Volume</small><b>${fmtVol(st.vol)}</b></div></div>
    ${s.exercises.map((e, ei) => {
      const name = getEx(e.exerciseId)?.name || e.name, c = cmpBy[name];
      return `<div class="sess-ex"><div class="sess-ex-h"><b>${esc(name)}</b>${c && c.kind === 'up' ? `<span class="pill pos">${ic('up')}${esc(c.text)}</span>` : ''}</div>
        ${e.sets.map((x, i) => SESS_EDIT ? `<div class="sess-set edit"><span>${i + 1}</span><input type="number" inputmode="decimal" step="any" data-live="sessSet" data-e="${ei}" data-i="${i}" data-f="load" value="${x.load}"><i>${unit()} ×</i><input type="number" inputmode="numeric" data-live="sessSet" data-e="${ei}" data-i="${i}" data-f="reps" value="${x.reps}"><button class="icon-btn" data-act="sessDelSet" data-e="${ei}" data-i="${i}" aria-label="Remover série">${ic('x')}</button></div>`
        : `<div class="sess-set"><span>${i + 1}</span><b>${fmtLoad(x.load)} × ${x.reps}</b>${x.note ? `<em>${esc(x.note)}</em>` : ''}</div>`).join('')}
        ${e.notes ? `<p class="sess-note">${ic('note')}${esc(e.notes)}</p>` : ''}</div>`;
    }).join('')}
    <div class="sheet-actions">
      <button class="btn btn-ghost danger" data-act="sessDelete">${ic('trash')}Excluir</button>
      <button class="btn ${SESS_EDIT ? 'btn-primary' : 'btn-ghost'}" data-act="sessEdit">${SESS_EDIT ? ic('check') + 'Concluir edição' : ic('edit') + 'Editar'}</button>
    </div></div>`);
}
const curSessSheet = () => $$('#sheets .sheet-wrap').pop();
ACT.sessEdit = () => { const w = curSessSheet(); if (SESS_EDIT) { saveDB(); rerender(); } SESS_EDIT = !SESS_EDIT; sessRender(w); };
LIVE.sessSet = el => {
  const s = DB.sessions.find(x => x.id === curSessSheet()._sid);
  s.exercises[+el.dataset.e].sets[+el.dataset.i][el.dataset.f] = el.value === '' ? 0 : +el.value;
};
ACT.sessDelSet = el => {
  const w = curSessSheet(), s = DB.sessions.find(x => x.id === w._sid), e = s.exercises[+el.dataset.e];
  e.sets.splice(+el.dataset.i, 1);
  if (!e.sets.length) s.exercises.splice(+el.dataset.e, 1);
  saveDB(); sessRender(w);
};
ACT.sessDelete = async () => {
  const w = curSessSheet(), id = w._sid;
  if (!await confirmSheet({ title: 'Excluir este treino do histórico?', text: 'Esta ação não pode ser desfeita.', ok: 'Excluir', danger: true })) return;
  DB.sessions = DB.sessions.filter(s => s.id !== id); SESS_EDIT = false; saveDB(); closeSheet(w); toast('Treino excluído'); rerender();
};

/* ================= PREFERÊNCIAS ================= */
function renderPrefs() {
  const p = DB.profile;
  const tog = (k, label, sub = '') => `<label class="toggle"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-bind="pref" data-k="${k}" ${p[k] ? 'checked' : ''}><i></i></label>`;
  const days = [1, 2, 3, 4, 5, 6, 0];
  const dl = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return `<header class="page-head"><a class="icon-btn" href="#/" aria-label="Voltar">${ic('left')}</a><h1 class="h-sm">Preferências</h1><span></span></header>
  <section class="card form">
    <label class="field"><span>Seu nome</span><input data-bind="pref" data-k="name" value="${esc(p.name)}" placeholder="Como quer ser chamada"></label>
    <div class="field"><span>Objetivos</span><div class="chips sm">${Object.entries(GOALS).map(([k, l]) => `<button class="chip ${p.goals.includes(k) ? 'on' : ''}" data-act="prefArr" data-k="goals" data-v="${k}">${l}</button>`).join('')}</div></div>
  </section>
  <h4 class="group-h">Treino</h4>
  <section class="card form">
    <div class="field row-field"><span>Treinos por semana</span><div class="mini-stp"><button data-act="prefNum" data-k="weeklyTarget" data-d="-1" data-min="1" data-max="7">${ic('minus')}</button><b>${p.weeklyTarget}</b><button data-act="prefNum" data-k="weeklyTarget" data-d="1" data-min="1" data-max="7">${ic('plus')}</button></div></div>
    <div class="field"><span>Dias planejados <small>(calendário)</small></span><div class="chips sm">${days.map(d => `<button class="chip ${p.plannedDays.includes(d) ? 'on' : ''}" data-act="prefArr" data-k="plannedDays" data-v="${d}" data-num="1">${dl[d]}</button>`).join('')}</div></div>
    <div class="field row-field"><span>Duração desejada</span><div class="mini-stp"><button data-act="prefNum" data-k="targetDuration" data-d="-5" data-min="15" data-max="180">${ic('minus')}</button><b>${p.targetDuration} min</b><button data-act="prefNum" data-k="targetDuration" data-d="5" data-min="15" data-max="180">${ic('plus')}</button></div></div>
    <div class="field row-field"><span>Unidade</span>${seg('prefSet', [['kg', 'kg'], ['lb', 'lb']], p.unit, 'data-k="unit"')}</div>
    <div class="field row-field"><span>Incremento de carga</span>${seg('prefSet', [[1, '1'], [2, '2'], [2.5, '2,5'], [5, '5']], p.loadStep, 'data-k="loadStep" data-num="1"')}</div>
    <div class="field"><span>Descanso padrão</span><div class="chips sm">${[45, 60, 75, 90, 120, 150, 180].map(r => `<button class="chip ${p.defaultRest === r ? 'on' : ''}" data-act="prefSet" data-k="defaultRest" data-v="${r}" data-num="1">${fmtRest(r)}</button>`).join('')}</div></div>
    ${tog('autoNext', 'Avançar automaticamente', 'Ao concluir a última série, vai para o próximo exercício na ordem do treino')}
    ${tog('autoRest', 'Iniciar descanso automaticamente', 'Cronômetro começa ao concluir cada série')}
  </section>
  <h4 class="group-h">Cronômetro e avisos</h4>
  <section class="card form">
    ${tog('sound', 'Som ao fim do descanso')}
    ${tog('vibrate', 'Vibração')}
    ${tog('notify', 'Notificação', 'Avisa quando o descanso termina com o app em segundo plano')}
  </section>
  <h4 class="group-h">Aparência</h4>
  <section class="card form"><div class="field row-field"><span>Tema</span>${seg('prefSet', [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Escuro']], p.theme, 'data-k="theme"')}</div></section>
  <h4 class="group-h">Prioridades musculares</h4>
  <section class="card form">
    <p class="muted small">Usadas para destacar grupos no mapa e nos insights. Não alteram seus treinos.</p>
    ${MUSCLE_ORDER.map(m => `<div class="field row-field prio-row"><span>${mName(m)}</span>${seg('prio', [['alta', 'Alta'], ['media', 'Média'], ['normal', 'Normal']], p.priorities[m] || 'normal', `data-m="${m}"`)}</div>`).join('')}
  </section>
  <h4 class="group-h">Dados</h4>
  <section class="card form">
    <p class="muted small">Tudo fica salvo neste aparelho, no navegador. Exporte backups com frequência — e para levar seus dados para outro aparelho, exporte aqui e importe lá.${p.lastBackup ? ` Último backup: ${fmtDate(p.lastBackup)}.` : ''}</p>
    <div class="btn-col">
      <button class="btn btn-soft" data-act="exportJson">${ic('download')}Exportar backup (JSON)</button>
      <button class="btn btn-soft" data-act="exportCsv">${ic('download')}Exportar séries (CSV)</button>
      <label class="btn btn-soft">${ic('upload')}Importar backup<input type="file" accept=".json,application/json" data-bind="importJson" hidden></label>
      ${RT_INSTALL.evt ? `<button class="btn btn-primary" data-act="install">Instalar como app</button>` : ''}
      <button class="btn btn-text danger" data-act="resetAll">${ic('trash')}Apagar todos os dados</button>
    </div>
    <p class="muted small">Para instalar no iPhone: Safari → Compartilhar → Adicionar à Tela de Início. No Android: menu do Chrome → Instalar app.</p>
  </section>
  <div class="spacer"></div>`;
}
function applyTheme() {
  const t = DB.profile.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]').setAttribute('content', dark ? '#0d0d0f' : '#f5f4f1');
}
BIND.pref = async el => {
  const k = el.dataset.k;
  DB.profile[k] = el.type === 'checkbox' ? el.checked : el.value;
  if (k === 'notify' && el.checked && 'Notification' in window && Notification.permission !== 'granted') {
    const r = await Notification.requestPermission();
    if (r !== 'granted') { DB.profile.notify = false; el.checked = false; toast('Permissão de notificação negada'); }
  }
  saveDB();
};
ACT.prefSet = el => { const k = el.dataset.k; DB.profile[k] = el.dataset.num ? +el.dataset.v : el.dataset.v; if (k === 'unit') DB.profile.loadStep = el.dataset.v === 'lb' ? 5 : 2.5; saveDB(); if (k === 'theme') applyTheme(); rerender(); };
ACT.prefNum = el => { const k = el.dataset.k; DB.profile[k] = Math.max(+el.dataset.min, Math.min(+el.dataset.max, DB.profile[k] + +el.dataset.d)); saveDB(); rerender(); };
ACT.prefArr = el => { const k = el.dataset.k, v = el.dataset.num ? +el.dataset.v : el.dataset.v, a = DB.profile[k]; DB.profile[k] = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; saveDB(); rerender(); };
ACT.prio = el => { const v = el.dataset.v; if (v === 'normal') delete DB.profile.priorities[el.dataset.m]; else DB.profile.priorities[el.dataset.m] = v; saveDB(); rerender(); };

ACT.exportJson = () => {
  DB.profile.lastBackup = new Date().toISOString(); saveDB();
  download(`evolua-backup-${dayKey(new Date())}.json`, JSON.stringify({ app: 'evolua', version: 1, exportedAt: new Date().toISOString(), data: DB }), 'application/json');
  toast('Backup exportado');
  if (parseHash().name === '') rerender();
};
ACT.exportCsv = () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['data', 'hora', 'treino', 'exercicio', 'grupo_principal', 'serie', 'carga', 'unidade', 'repeticoes', 'observacao'].join(';')];
  sortedSessions().forEach(s => s.exercises.forEach(e => { const ex = getEx(e.exerciseId); e.sets.forEach((x, i) => rows.push([dayKey(s.start), fmtTime(s.start), q(s.workoutName), q(ex?.name || e.name), ex ? mName(ex.primary) : '', i + 1, String(x.load).replace('.', ','), unit(), x.reps, q(x.note)].join(';'))); }));
  download(`evolua-series-${dayKey(new Date())}.csv`, '﻿' + rows.join('\n'), 'text/csv');
};
BIND.importJson = async el => {
  const file = el.files[0]; el.value = '';
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    const data = obj.data || obj;
    if (!Array.isArray(data.sessions) || !Array.isArray(data.workouts)) throw new Error('formato');
    if (!await confirmSheet({ title: 'Importar backup?', text: `${data.sessions.length} treinos registrados e ${data.workouts.length} treinos montados. Os dados atuais deste aparelho serão substituídos.`, ok: 'Importar', danger: true })) return;
    DB = migrate(data); saveDB(); applyTheme(); toast('Backup importado'); rerender();
  } catch (e) { console.error(e); toast('Arquivo inválido'); }
};
ACT.resetAll = async () => {
  if (!await confirmSheet({ title: 'Apagar todos os dados?', text: 'Treinos, histórico e preferências serão apagados deste aparelho. Exporte um backup antes se quiser guardar.', ok: 'Apagar tudo', danger: true })) return;
  DB = defaultDB(); saveDB(); applyTheme(); toast('Dados apagados'); go('#/');
};

const RT_INSTALL = { evt: null };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); RT_INSTALL.evt = e; });
ACT.install = async () => { const e = RT_INSTALL.evt; if (!e) return; e.prompt(); await e.userChoice; RT_INSTALL.evt = null; rerender(); };
