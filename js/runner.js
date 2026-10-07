'use strict';
/* Execução do treino: registro de séries, descanso, navegação entre exercícios e resumo. */

const RT = { tick: null, wake: null, ac: null, summary: null, dir: 0, touch: null };

function buildExercise(exId, it = {}) {
  const ex = getEx(exId), prev = lastEntry(exId);
  const n = +it.sets || prev?.sets.length || 3;
  const sets = [];
  for (let i = 0; i < n; i++) {
    const ps = prev ? (prev.sets[i] || prev.sets[prev.sets.length - 1]) : null;
    sets.push({
      load: ps ? +ps.load : (it.load === '' || it.load == null ? '' : +it.load),
      reps: ps ? +ps.reps : (it.repMax || it.repMin || ''),
      done: false, note: '',
    });
  }
  return { exerciseId: exId, name: ex?.name || 'Exercício', repMin: it.repMin || null, repMax: it.repMax || null, plannedSets: +it.sets || null, rest: +it.rest || DB.profile.defaultRest, planNotes: it.notes || '', notes: '', sets };
}

async function startWorkout(id) {
  const w = getWorkout(id); if (!w) return;
  if (!w.items.length) { toast('Adicione exercícios a este treino primeiro'); go('#/editar/' + w.id); return; }
  if (DB.active) {
    const ok = await confirmSheet({ title: 'Há um treino em andamento', text: `Descartar “${DB.active.workoutName}” e iniciar ${w.name}?`, ok: 'Descartar e iniciar', danger: true, cancel: 'Voltar ao atual' });
    if (!ok) { openRunner(); return; }
  }
  DB.active = { id: uid(), workoutId: w.id, workoutName: w.name, start: new Date().toISOString(), cur: 0, sel: null, restEnd: null, restTotal: 0, exercises: w.items.map(it => buildExercise(it.exerciseId, it)) };
  saveDB(); unlockAudio(); openRunner();
}
ACT.start = el => startWorkout(el.dataset.id);
ACT.resume = () => openRunner();

function activeProgress() {
  const a = DB.active; let done = 0, total = 0;
  a.exercises.forEach(e => e.sets.forEach(s => { total++; if (s.done) done++; }));
  return { done, total };
}
function activeAsSession() {
  const a = DB.active;
  return { id: a.id, workoutId: a.workoutId, workoutName: a.workoutName, start: a.start, exercises: a.exercises.map(e => ({ exerciseId: e.exerciseId, sets: e.sets.filter(s => s.done) })) };
}

function openRunner() {
  closeAllSheets();
  $('#runner').hidden = false;
  document.documentElement.classList.add('is-running');
  renderRunner(); startTick(); requestWake();
}
function closeRunner() {
  $('#runner').hidden = true;
  document.documentElement.classList.remove('is-running');
  releaseWake();
  if (!DB.active) stopTick();
  route();
}
ACT.runMin = () => closeRunner();

const curEx = () => DB.active.exercises[DB.active.cur];
function curSetIdx(ex) {
  const a = DB.active;
  if (a.sel != null && ex.sets[a.sel]) return a.sel;
  return ex.sets.findIndex(s => !s.done);
}

/* ---------- Render ---------- */
function renderRunner() {
  const el = $('#runner');
  if (RT.summary) { el.innerHTML = renderSummary(); return; }
  const a = DB.active;
  if (!a) { closeRunner(); return; }
  if (!a.exercises.length) a.exercises = [];
  a.cur = Math.min(a.cur, Math.max(0, a.exercises.length - 1));
  const body = $('.run-body', el), keep = body && body.dataset.cur == a.cur ? body.scrollTop : 0;
  const prog = activeProgress();

  el.innerHTML = `
  <header class="run-head">
    <button class="icon-btn" data-act="runMin" aria-label="Minimizar">${ic('down')}</button>
    <div class="run-title"><b>${esc(a.workoutName)}</b><span><span id="elapsed">${fmtClock((Date.now() - new Date(a.start)) / 1000)}</span> · ${prog.done}/${prog.total} séries</span></div>
    <button class="btn btn-ghost btn-sm" data-act="runFinish">Finalizar</button>
  </header>
  <div class="run-progress"><i style="width:${prog.total ? prog.done / prog.total * 100 : 0}%"></i></div>
  <nav class="run-strip" id="runStrip">${a.exercises.map((e, i) => {
    const d = e.sets.filter(s => s.done).length, full = d === e.sets.length && d > 0;
    return `<button class="rs ${i === a.cur ? 'on' : ''} ${full ? 'full' : ''}" data-act="exJump" data-i="${i}"><span class="rs-n">${full ? ic('check') : i + 1}</span><span class="rs-l">${esc(getEx(e.exerciseId)?.name || e.name)}</span><span class="rs-c">${d}/${e.sets.length}</span></button>`;
  }).join('')}<button class="rs add" data-act="runAddEx">${ic('plus')}<span class="rs-l">Exercício</span></button></nav>
  <main class="run-body" data-cur="${a.cur}">${a.exercises.length ? renderExercise() : emptyState('dumbbell', 'Sem exercícios', 'Adicione um exercício para continuar.', `<button class="btn btn-primary" data-act="runAddEx">Adicionar exercício</button>`)}</main>
  <footer class="run-dock" id="runDock">${renderDock()}</footer>`;
  const nb = $('.run-body', el); nb.scrollTop = keep;
  if (RT.dir) { nb.firstElementChild?.classList.add(RT.dir > 0 ? 'in-right' : 'in-left'); RT.dir = 0; }
  const on = $('.rs.on', el); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function suggestionFor(ex, prev, hist) {
  if (!prev) return '';
  const tips = [];
  const top = ex.repMax;
  if (top && prev.sets.length >= (ex.plannedSets || prev.sets.length) && prev.sets.every(s => +s.reps >= top) && +prev.sets[0].load > 0) {
    tips.push(`Na última vez você fez ${top}+ reps em todas as séries. Se fizer sentido para você, pode testar uma carga maior.`);
  }
  const before = hist.at(-2);
  if (before && prev.maxLoad > before.maxLoad) tips.unshift(`<b>↑ Progressão</b> Você aumentou ${fmtN(prev.maxLoad - before.maxLoad, 2)} ${unit()} na última sessão.`);
  return tips.length ? `<div class="suggest">${tips.map(t => `<p>${t}</p>`).join('')}</div>` : '';
}

function renderExercise() {
  const a = DB.active, ex = curEx(), info = getEx(ex.exerciseId);
  const hist = exerciseHistory(ex.exerciseId).filter(x => x.sessionId !== a.id);
  const prev = hist.at(-1), rec = hist.length ? exerciseRecords(ex.exerciseId) : null;
  const si = curSetIdx(ex), u = unit();
  const rows = ex.sets.map((s, i) => {
    const p = prev?.sets[i];
    if (i === si) return `<div class="set cur ${s.done ? 'done' : ''}">
      <div class="set-top"><span class="set-n">Série ${i + 1}${s.done ? ' · concluída' : ''}</span>${p ? `<span class="set-prev">anterior ${fmtLoadShort(p.load)} × ${p.reps}</span>` : ''}</div>
      <div class="steppers">
        <div class="stp"><button class="stp-b" data-act="adj" data-f="load" data-d="-1" aria-label="Menos carga">${ic('minus')}</button>
          <label class="stp-v"><input data-live="setField" data-f="load" data-i="${i}" inputmode="decimal" enterkeyhint="done" value="${s.load === '' ? '' : String(s.load).replace('.', ',')}" placeholder="0"><span>${u}</span></label>
          <button class="stp-b" data-act="adj" data-f="load" data-d="1" aria-label="Mais carga">${ic('plus')}</button></div>
        <div class="stp"><button class="stp-b" data-act="adj" data-f="reps" data-d="-1" aria-label="Menos repetições">${ic('minus')}</button>
          <label class="stp-v"><input data-live="setField" data-f="reps" data-i="${i}" inputmode="numeric" enterkeyhint="done" value="${s.reps}" placeholder="0"><span>reps</span></label>
          <button class="stp-b" data-act="adj" data-f="reps" data-d="1" aria-label="Mais repetições">${ic('plus')}</button></div>
      </div>
      <input class="set-note" data-live="setField" data-f="note" data-i="${i}" value="${esc(s.note)}" placeholder="Observação da série (opcional)">
    </div>`;
    return `<div class="set ${s.done ? 'done' : ''}" data-act="selSet" data-i="${i}" role="button">
      <span class="set-n">${i + 1}</span>
      <span class="set-v">${s.load !== '' ? fmtLoadShort(s.load) : '—'}<small>${u}</small><i>×</i>${s.reps || '—'}<small>reps</small>${s.note ? `<em>${ic('note')}</em>` : ''}</span>
      <button class="set-chk" data-act="toggleSet" data-i="${i}" aria-label="${s.done ? 'Desmarcar' : 'Concluir'} série ${i + 1}">${ic('check')}</button>
    </div>`;
  }).join('');

  return `<section class="run-ex" id="runEx">
    <div class="ex-head">
      ${info?.image ? `<button class="ex-anim" data-act="exOpen" data-id="${info.id}" aria-label="Ver execução"><img src="${esc(info.image)}" alt=""></button>` : ''}
      <div class="ex-head-main"><small class="muted">Exercício ${a.cur + 1} de ${a.exercises.length}</small>
        <h2>${esc(info?.name || ex.name)}</h2>
        <div class="ex-tags">${info ? `<span>${mName(info.primary)}</span>${info.secondary.slice(0, 2).map(m => `<span class="sec">${mName(m)}</span>`).join('')}<span class="sec">${esc(info.equipment)}</span>` : ''}</div>
      </div>
      <button class="icon-btn" data-act="exMenu" aria-label="Opções do exercício">${ic('more')}</button>
    </div>
    <div class="last-box" data-act="exHist" role="button">
      ${prev ? `<div><small>Última vez · ${relDay(prev.date)}</small><b>${prev.sets.map(s => `${fmtLoadShort(s.load)}×${s.reps}`).join('  ·  ')}</b></div>` : `<div><small>Primeira vez neste exercício</small><b>Registre a carga de hoje como referência</b></div>`}
      ${rec ? `<div class="pr"><small>Melhor</small><b>${fmtLoadShort(rec.maxLoad.load)}×${rec.maxLoad.reps}</b></div>` : ''}
    </div>
    ${suggestionFor(ex, prev, hist)}
    <div class="plan-line">${ex.repMin || ex.repMax ? `Meta ${ex.sets.length} × ${repRange(ex)}` : `${ex.sets.length} séries`} · descanso ${fmtRest(ex.rest)}${ex.planNotes ? ` · ${esc(ex.planNotes)}` : ''}</div>
    <div class="sets">${rows}</div>
    <div class="set-tools">
      <button class="btn btn-ghost btn-sm" data-act="addSet">${ic('plus')}Adicionar série</button>
      ${ex.sets.length > 1 ? `<button class="btn btn-ghost btn-sm" data-act="removeSet">${ic('minus')}Remover série</button>` : ''}
    </div>
    <textarea class="ex-note" data-live="exNote" rows="2" placeholder="Observação do exercício (opcional)">${esc(ex.notes)}</textarea>
    <div class="swipe-hint">${a.cur > 0 ? `<button data-act="exPrev">${ic('left')}Anterior</button>` : '<span></span>'}${a.cur < a.exercises.length - 1 ? `<button data-act="exNext">Próximo${ic('right')}</button>` : '<span></span>'}</div>
  </section>`;
}

function renderDock() {
  const a = DB.active;
  if (!a.exercises.length) return '';
  if (a.restEnd) {
    const rem = Math.max(0, (a.restEnd - Date.now()) / 1000);
    const ex = curEx(), ni = curSetIdx(ex), ns = ex.sets[ni];
    return `<div class="rest">
      <div class="rest-top"><span>DESCANSO</span>${ns ? `<span class="muted">Próxima: série ${ni + 1} · ${fmtLoadShort(ns.load)} × ${ns.reps}</span>` : ''}</div>
      <div class="rest-time" id="restTime">${fmtClock(rem)}</div>
      <div class="rest-bar"><i id="restBar" style="width:${a.restTotal ? rem / a.restTotal * 100 : 0}%"></i></div>
      <div class="rest-btns"><button data-act="restAdj" data-d="-15">−15s</button><button data-act="restAdj" data-d="15">+15s</button><button class="primary" data-act="restSkip">Pular</button></div>
    </div>`;
  }
  const ex = curEx(), si = curSetIdx(ex);
  if (si >= 0) {
    const editing = ex.sets[si].done;
    return `<button class="btn btn-primary btn-xl btn-done" data-act="complete">${ic('check')}${editing ? `SALVAR SÉRIE ${si + 1}` : `CONCLUIR SÉRIE ${si + 1}`}</button>`;
  }
  const next = nextPendingIdx();
  if (next >= 0) return `<button class="btn btn-primary btn-xl" data-act="exGo" data-i="${next}">PRÓXIMO EXERCÍCIO${ic('right')}</button>`;
  return `<button class="btn btn-primary btn-xl" data-act="runFinish">${ic('check')}FINALIZAR TREINO</button>`;
}
function nextPendingIdx() {
  const a = DB.active, n = a.exercises.length;
  for (let k = 1; k <= n; k++) { const i = (a.cur + k) % n; if (a.exercises[i].sets.some(s => !s.done)) return i; }
  return -1;
}
function refreshDock() { const d = $('#runDock'); if (d) d.innerHTML = renderDock(); }

/* ---------- Ações durante o treino ---------- */
const persist = () => saveDB();
LIVE.setField = el => {
  const s = curEx().sets[+el.dataset.i], f = el.dataset.f;
  if (f === 'note') s.note = el.value;
  else { const v = el.value.replace(',', '.').trim(); s[f] = v === '' ? '' : (f === 'reps' ? Math.max(0, Math.round(+v || 0)) : Math.max(0, +v || 0)); }
  persist();
};
LIVE.exNote = el => { curEx().notes = el.value; persist(); };

ACT.adj = el => {
  const ex = curEx(), i = curSetIdx(ex); if (i < 0) return;
  const s = ex.sets[i], f = el.dataset.f, d = +el.dataset.d;
  const step = f === 'load' ? DB.profile.loadStep : 1;
  let v = (+s[f] || 0) + d * step;
  if (f === 'load') v = Math.round(v * 100) / 100;
  s[f] = Math.max(0, v);
  const inp = $(`.set.cur input[data-f="${f}"]`);
  if (inp) inp.value = String(s[f]).replace('.', ',');
  persist(); vibrate(8);
};
ACT.selSet = el => { const a = DB.active, i = +el.dataset.i; a.sel = curSetIdx(curEx()) === i ? null : i; persist(); renderRunner(); };
ACT.toggleSet = (el, e) => {
  e.stopPropagation();
  const ex = curEx(), i = +el.dataset.i, s = ex.sets[i];
  if (s.done) { s.done = false; DB.active.sel = null; persist(); renderRunner(); return; }
  DB.active.sel = i; ACT.complete();
};
ACT.complete = () => {
  unlockAudio();
  const a = DB.active, ex = curEx(), i = curSetIdx(ex); if (i < 0) return;
  const s = ex.sets[i];
  if (!(+s.reps > 0)) { toast('Informe as repetições'); return; }
  if (s.load === '') s.load = 0;
  const wasDone = s.done;
  s.done = true; s.doneAt = Date.now(); a.sel = null;
  // Sem referência anterior: leva a carga para as próximas séries ainda vazias.
  ex.sets.slice(i + 1).forEach(n => { if (!n.done && n.load === '') n.load = s.load; });
  vibrate(20);
  if (!wasDone) {
    const allDone = ex.sets.every(x => x.done);
    const workoutDone = a.exercises.every(e => e.sets.every(x => x.done));
    if (DB.profile.autoRest && !workoutDone) startRest(ex.rest);
    if (allDone && DB.profile.autoNext) { const n = nextPendingIdx(); if (n > a.cur) { a.cur = n; RT.dir = 1; } }
  }
  persist(); renderRunner();
};
ACT.addSet = () => {
  const ex = curEx(), last = ex.sets[ex.sets.length - 1];
  ex.sets.push({ load: last ? last.load : '', reps: last ? last.reps : '', done: false, note: '' });
  DB.active.sel = null; persist(); renderRunner();
};
ACT.removeSet = () => {
  const ex = curEx(); if (ex.sets.length <= 1) return;
  const idx = ex.sets.map(s => s.done).lastIndexOf(false);
  ex.sets.splice(idx >= 0 ? idx : ex.sets.length - 1, 1);
  DB.active.sel = null; persist(); renderRunner();
};
function goEx(i, dir) {
  const a = DB.active; if (i < 0 || i >= a.exercises.length || i === a.cur) return;
  RT.dir = dir ?? (i > a.cur ? 1 : -1); a.cur = i; a.sel = null; persist(); renderRunner();
}
ACT.exJump = el => goEx(+el.dataset.i);
ACT.exGo = el => goEx(+el.dataset.i, 1);
ACT.exNext = () => goEx(DB.active.cur + 1, 1);
ACT.exPrev = () => goEx(DB.active.cur - 1, -1);

ACT.exMenu = () => {
  const ex = curEx();
  openSheet(`<h3 class="sheet-title">${esc(getEx(ex.exerciseId)?.name || ex.name)}</h3>
    <div class="field"><span>Descanso deste exercício</span><div class="chips sm">${[30, 45, 60, 75, 90, 120, 150, 180, 240].map(r => `<button class="chip ${ex.rest === r ? 'on' : ''}" data-act="exRest" data-v="${r}">${fmtRest(r)}</button>`).join('')}</div></div>
    <div class="menu">
      <button data-act="exHist">${ic('history')}Histórico e instruções</button>
      <button data-act="exSwap">${ic('swap')}Trocar exercício</button>
      <button data-act="runAddEx">${ic('plus')}Adicionar exercício depois deste</button>
      ${DB.active.cur > 0 ? `<button data-act="exMove" data-d="-1">${ic('up')}Mover para antes</button>` : ''}
      ${DB.active.cur < DB.active.exercises.length - 1 ? `<button data-act="exMove" data-d="1">${ic('down')}Mover para depois</button>` : ''}
      <button class="danger" data-act="exRemove">${ic('trash')}Remover deste treino</button>
    </div>`);
};
ACT.exRest = el => { curEx().rest = +el.dataset.v; persist(); closeAllSheets(); renderRunner(); };
ACT.exHist = () => { closeAllSheets(); ACT.exOpen({ dataset: { id: curEx().exerciseId } }); };
ACT.exSwap = () => {
  closeAllSheets();
  openPicker({ multi: false, title: 'Trocar exercício', onPick: ([id]) => {
    const a = DB.active, old = curEx();
    const nx = buildExercise(id, { sets: old.sets.length, repMin: old.repMin, repMax: old.repMax, rest: old.rest });
    a.exercises[a.cur] = nx; a.sel = null; persist(); renderRunner();
  } });
};
ACT.runAddEx = () => {
  closeAllSheets();
  openPicker({ multi: true, title: 'Adicionar ao treino', onPick: ids => {
    const a = DB.active, at = a.exercises.length ? a.cur + 1 : 0;
    a.exercises.splice(at, 0, ...ids.map(id => buildExercise(id, { rest: DB.profile.defaultRest })));
    a.cur = at; a.sel = null; RT.dir = 1; persist(); renderRunner();
  } });
};
ACT.exMove = el => {
  closeAllSheets();
  const a = DB.active, i = a.cur, j = i + +el.dataset.d;
  const [x] = a.exercises.splice(i, 1); a.exercises.splice(j, 0, x); a.cur = j; persist(); renderRunner();
};
ACT.exRemove = async () => {
  closeAllSheets();
  const ex = curEx();
  if (ex.sets.some(s => s.done) && !await confirmSheet({ title: 'Remover exercício?', text: 'As séries já concluídas dele não serão salvas.', ok: 'Remover', danger: true })) return;
  const a = DB.active; a.exercises.splice(a.cur, 1); a.cur = Math.max(0, a.cur - (a.cur >= a.exercises.length ? 1 : 0)); a.sel = null; persist(); renderRunner();
};

/* ---------- Descanso ---------- */
function startRest(sec) { const a = DB.active; a.restTotal = sec; a.restEnd = Date.now() + sec * 1000; RT.restAlerted = false; }
ACT.restAdj = el => {
  const a = DB.active, d = +el.dataset.d;
  a.restEnd += d * 1000; a.restTotal = Math.max(1, a.restTotal + d);
  if (a.restEnd <= Date.now()) { a.restEnd = null; persist(); refreshDock(); return; }
  persist(); updateRest();
};
ACT.restSkip = () => { DB.active.restEnd = null; persist(); refreshDock(); };
function restFinished() {
  const a = DB.active; a.restEnd = null; persist();
  beep(); vibrate([250, 120, 250]);
  const r = $('#runner'); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
  if (document.hidden && DB.profile.notify && 'Notification' in window && Notification.permission === 'granted') {
    const ex = curEx(), name = getEx(ex.exerciseId)?.name || ex.name;
    const opts = { body: `Próxima série de ${name}`, tag: 'evolua-rest', renotify: true, icon: 'icons/icon-192.png' };
    if (navigator.serviceWorker?.controller) navigator.serviceWorker.ready.then(reg => reg.showNotification('Descanso terminado', opts)).catch(() => { });
    else try { new Notification('Descanso terminado', opts); } catch (e) { }
  }
  if (!$('#runner').hidden) refreshDock();
}
function updateRest() {
  const a = DB.active; if (!a?.restEnd) return;
  const rem = (a.restEnd - Date.now()) / 1000;
  const t = $('#restTime'), b = $('#restBar');
  if (t) { t.textContent = fmtClock(rem); t.classList.toggle('ending', rem <= 5); }
  if (b) b.style.width = `${Math.max(0, rem / a.restTotal * 100)}%`;
}
function startTick() {
  if (RT.tick) return;
  RT.tick = setInterval(() => {
    const a = DB.active;
    if (!a) return;
    if (a.restEnd && Date.now() >= a.restEnd) restFinished();
    if ($('#runner').hidden) return;
    const e = $('#elapsed'); if (e) e.textContent = fmtClock((Date.now() - new Date(a.start)) / 1000);
    updateRest();
  }, 250);
}
function stopTick() { clearInterval(RT.tick); RT.tick = null; }

function unlockAudio() {
  if (!DB.profile.sound) return;
  try {
    if (!RT.ac) RT.ac = new (window.AudioContext || window.webkitAudioContext)();
    if (RT.ac.state === 'suspended') RT.ac.resume();
  } catch (e) { }
}
function beep() {
  if (!DB.profile.sound || !RT.ac) return;
  const ac = RT.ac, t0 = ac.currentTime;
  [0, 0.2, 0.4].forEach((t, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.16);
    o.connect(g).connect(ac.destination); o.start(t0 + t); o.stop(t0 + t + 0.18);
  });
}
async function requestWake() {
  try { if ('wakeLock' in navigator && !RT.wake) { RT.wake = await navigator.wakeLock.request('screen'); RT.wake.addEventListener('release', () => RT.wake = null); } } catch (e) { }
}
function releaseWake() { try { RT.wake?.release(); } catch (e) { } RT.wake = null; }
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !DB?.active) return;
  if (!$('#runner').hidden) { requestWake(); renderRunner(); }
});

/* ---------- Deslizar entre exercícios ---------- */
document.addEventListener('touchstart', e => {
  const b = e.target.closest('.run-body');
  if (!b || e.target.closest('input,textarea,.stp,.run-strip')) { RT.touch = null; return; }
  RT.touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
document.addEventListener('touchend', e => {
  const s = RT.touch; RT.touch = null;
  if (!s || !DB.active) return;
  const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.t < 600) {
    if (dx < 0) ACT.exNext(); else ACT.exPrev();
  }
}, { passive: true });

/* ---------- Finalizar ---------- */
ACT.runFinish = () => {
  const a = DB.active, p = activeProgress();
  if (!p.done) {
    openSheet(`<h3 class="sheet-title">Nenhuma série concluída</h3><p class="muted">Quer descartar este treino?</p>
      <div class="sheet-actions"><button class="btn btn-ghost" data-close>Continuar treinando</button><button class="btn btn-danger" data-act="runDiscard">Descartar</button></div>`);
    return;
  }
  openSheet(`<h3 class="sheet-title">Finalizar treino?</h3>
    <p class="muted">${p.done} de ${p.total} séries concluídas · ${fmtClock((Date.now() - new Date(a.start)) / 1000)}${p.total - p.done ? `. As ${p.total - p.done} séries não concluídas não serão salvas.` : '.'}</p>
    <textarea class="ex-note" data-live="runNotes" rows="2" placeholder="Como foi o treino? (opcional)">${esc(a.notes || '')}</textarea>
    <div class="btn-col"><button class="btn btn-primary btn-lg" data-act="runSave">${ic('check')}Salvar treino</button>
    <button class="btn btn-ghost" data-close>Continuar treinando</button>
    <button class="btn btn-text danger" data-act="runDiscard">Descartar treino</button></div>`);
};
LIVE.runNotes = el => { DB.active.notes = el.value; persist(); };
ACT.runDiscard = async () => {
  closeAllSheets();
  if (activeProgress().done && !await confirmSheet({ title: 'Descartar treino?', text: 'Nada deste treino será salvo.', ok: 'Descartar', danger: true })) return;
  DB.active = null; saveDB(); stopTick(); closeRunner(); toast('Treino descartado');
};
ACT.runSave = () => {
  closeAllSheets();
  const a = DB.active, end = new Date();
  const session = {
    id: a.id, workoutId: a.workoutId, workoutName: a.workoutName, start: a.start, end: end.toISOString(),
    duration: Math.max(1, Math.round((end - new Date(a.start)) / 60000)), notes: a.notes || '',
    exercises: a.exercises.map(e => ({
      exerciseId: e.exerciseId, name: getEx(e.exerciseId)?.name || e.name, notes: e.notes,
      sets: e.sets.filter(s => s.done && +s.reps > 0).map(s => ({ load: +s.load || 0, reps: +s.reps, done: true, note: s.note || '' })),
    })).filter(e => e.sets.length),
  };
  DB.sessions.push(session); DB.active = null;
  if (DB.ui.todayPick) delete DB.ui.todayPick;
  saveDB(); stopTick(); releaseWake();
  RT.summary = session.id; renderRunner();
};

function renderSummary() {
  const s = DB.sessions.find(x => x.id === RT.summary);
  if (!s) { RT.summary = null; return ''; }
  const st = sessionStats(s), cmp = compareSession(s);
  const ups = cmp.filter(c => c.kind === 'up'), prs = ups.filter(c => c.pr);
  const ms = muscleStats([s]), lv = levelsFrom(ms);
  const top = MUSCLE_ORDER.filter(m => ms[m].sets).sort((a, b) => ms[b].sets - ms[a].sets);
  return `<div class="summary">
    <div class="sum-hero"><div class="sum-check">${ic('check')}</div><h2>Treino concluído</h2><p class="muted">${esc(s.workoutName)} · ${fmtDate(s.start)}</p></div>
    <div class="mini-stats four"><div><small>Duração</small><b>${fmtDur(s.duration)}</b></div><div><small>Exercícios</small><b>${st.exs}</b></div><div><small>Séries</small><b>${st.sets}</b></div><div><small>Volume</small><b>${fmtVol(st.vol)}</b></div></div>
    ${sessionKcal(s) ? `<p class="muted small center">Gasto estimado: ~${fmtN(sessionKcal(s))} kcal além do metabolismo basal</p>` : ''}
    ${ups.length ? `<section class="card"><div class="card-head"><h3>Progressões</h3>${prs.length ? `<span class="pill pos">${ic('trophy')}${prs.length} ${prs.length === 1 ? 'melhor marca' : 'melhores marcas'}</span>` : ''}</div>
      <div class="list">${ups.map(c => `<div class="row"><div class="row-main"><b>${esc(c.name)}</b><span class="muted">${esc(c.text)}</span></div>${c.pr ? ic('trophy', 'gold') : ic('up', 'pos')}</div>`).join('')}</div></section>` : ''}
    <section class="card"><div class="card-head"><h3>Músculos trabalhados</h3></div>
      <div class="map-mini-body">${bodyPair(lv, { small: true })}<div class="map-mini-list">${top.slice(0, 6).map(m => `<div><span>${mName(m)}</span><b>${fmtN(ms[m].sets, 1)}</b></div>`).join('')}<small>séries</small></div></div></section>
    ${cmp.filter(c => c.kind !== 'up').length ? `<section class="card"><div class="card-head"><h3>Demais exercícios</h3></div><div class="list">${cmp.filter(c => c.kind !== 'up').map(c => `<div class="row"><div class="row-main"><b>${esc(c.name)}</b><span class="muted">${esc(c.text)}</span></div></div>`).join('')}</div></section>` : ''}
    <p class="muted small center">Sugestões de progressão aparecem no próximo treino. Seu plano não é alterado automaticamente.</p>
    <button class="btn btn-primary btn-xl" data-act="sumClose">CONCLUIR</button>
  </div>`;
}
ACT.sumClose = () => { RT.summary = null; closeRunner(); go('#/'); };
