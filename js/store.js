'use strict';
/* Persistência, utilitários de data/formatação e cálculos estatísticos. */

const STORE_KEY = 'evolua.v1';
const DAY = 864e5;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function defaultProfile() {
  return {
    name: '',
    sex: '',
    birthDate: '',
    height: '',
    activityFactor: 1.3,
    goals: ['hipertrofia', 'fortalecimento', 'definicao'],
    weeklyTarget: 4,
    plannedDays: [1, 2, 4, 5], // 0 = domingo
    targetDuration: 60,
    unit: 'kg',
    loadStep: 2.5,
    defaultRest: 90,
    autoNext: true,
    autoRest: true,
    sound: true,
    vibrate: true,
    notify: false,
    theme: 'auto',
    priorities: { gluteos: 'alta', posteriores: 'alta', quadriceps: 'alta', costas: 'media', ombros: 'media' },
    createdAt: new Date().toISOString(),
    lastBackup: null,
  };
}

function defaultDB() {
  return {
    schema: 1,
    profile: defaultProfile(),
    exercises: EXERCISE_LIBRARY.map(e => ({ ...e, secondary: [...e.secondary] })),
    workouts: seedWorkouts(),
    sessions: [],
    runs: [],
    runsDeleted: [],
    body: [],
    active: null,
    removedBuiltins: [],
    ui: {},
  };
}

function migrate(db) {
  db.schema = db.schema || 1;
  db.profile = { ...defaultProfile(), ...(db.profile || {}) };
  db.profile.priorities = db.profile.priorities || {};
  db.exercises = db.exercises || [];
  db.removedBuiltins = db.removedBuiltins || [];
  const have = new Set(db.exercises.map(e => e.id));
  const removed = new Set(db.removedBuiltins);
  EXERCISE_LIBRARY.forEach(e => { if (!have.has(e.id) && !removed.has(e.id)) db.exercises.push({ ...e, secondary: [...e.secondary] }); });
  db.workouts = db.workouts || [];
  db.sessions = db.sessions || [];
  db.runs = db.runs || [];
  db.runsDeleted = db.runsDeleted || [];
  db.body = db.body || [];
  db.active = db.active || null;
  db.ui = db.ui || {};
  return db;
}

let DB;
let _exIndex = null;
let _sorted = null;

function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { DB = migrate(JSON.parse(raw)); return; }
  } catch (e) { console.error(e); }
  DB = defaultDB();
  saveDB();
}

function saveDB() {
  _exIndex = null; _sorted = null;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
    localStorage.setItem('evolua.theme', DB.profile.theme);
  } catch (e) {
    console.error(e);
    toast('Não foi possível salvar no navegador. Exporte um backup.');
  }
}

function getEx(id) {
  if (!_exIndex) _exIndex = new Map(DB.exercises.map(e => [e.id, e]));
  return _exIndex.get(id);
}
function getWorkout(id) { return DB.workouts.find(w => w.id === id); }
function unit() { return DB.profile.unit; }

/* ---------- Formatação ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n, d = 0) => (+n || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });
const fmtLoad = v => (v === '' || v == null) ? '—' : `${fmtN(v, 2)} ${unit()}`;
const fmtLoadShort = v => (v === '' || v == null) ? '—' : fmtN(v, 2);
function fmtVol(v) {
  if (unit() === 'kg' && v >= 10000) return `${fmtN(v / 1000, 1)} t`;
  return `${fmtN(v)} ${unit()}`;
}
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const mName = m => MUSCLES[m]?.name || m;

function dayKey(d) {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDayKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
function endOfDay(d) { d = new Date(d); d.setHours(23, 59, 59, 999); return d; }
function startOfWeek(d) { d = startOfDay(d); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; }
function addDays(d, n) { d = new Date(d); d.setDate(d.getDate() + n); return d; }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }
function fmtDate(d, opts) { return new Date(d).toLocaleDateString('pt-BR', opts || { day: '2-digit', month: '2-digit', year: 'numeric' }); }
const fmtShort = d => fmtDate(d, { day: '2-digit', month: '2-digit' });
function fmtTime(d) { return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function relDay(d) {
  const n = daysBetween(d, new Date());
  if (n <= 0) return 'hoje';
  if (n === 1) return 'ontem';
  if (n < 7) return `há ${n} dias`;
  if (n < 14) return 'há 1 semana';
  if (n < 60) return `há ${Math.floor(n / 7)} semanas`;
  return fmtDate(d);
}
function fmtDur(min) {
  min = Math.round(min || 0);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtRest(sec) { sec = +sec || 0; return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}s`; }
const repRange = it => it.repMin && it.repMax && it.repMin !== it.repMax ? `${it.repMin}–${it.repMax}` : `${it.repMax || it.repMin || '?'}`;

/* ---------- Estatísticas ---------- */
function sortedSessions() {
  if (!_sorted) _sorted = DB.sessions.slice().sort((a, b) => a.start < b.start ? -1 : 1);
  return _sorted;
}
const doneSets = e => (e.sets || []).filter(s => s.done && +s.reps > 0);
const setVol = s => (+s.load || 0) * (+s.reps || 0);
function e1rm(s) { const l = +s.load || 0, r = +s.reps || 0; return l > 0 ? l * (1 + r / 30) : r; }

function sessionStats(s) {
  let sets = 0, vol = 0, exs = 0;
  s.exercises.forEach(e => { const d = doneSets(e); if (d.length) exs++; sets += d.length; d.forEach(x => vol += setVol(x)); });
  return { sets, vol, exs };
}
function sessionsBetween(from, to) {
  return sortedSessions().filter(s => { const t = new Date(s.start); return t >= from && t <= to; });
}

/* Séries do músculo principal contam 1; dos secundários, 0,5. */
function muscleStats(sessions) {
  const st = {};
  MUSCLE_ORDER.forEach(m => st[m] = { sets: 0, volume: 0, exercises: new Map(), days: new Set(), sessions: 0, last: null });
  for (const s of sessions) {
    const hit = new Set();
    for (const e of s.exercises) {
      const ex = getEx(e.exerciseId); if (!ex) continue;
      const d = doneSets(e); if (!d.length) continue;
      const vol = d.reduce((a, x) => a + setVol(x), 0);
      const add = (m, w) => {
        const t = st[m]; if (!t) return;
        t.sets += d.length * w; t.volume += vol * w;
        t.exercises.set(ex.id, (t.exercises.get(ex.id) || 0) + d.length * w);
        t.days.add(dayKey(s.start)); hit.add(m);
        if (!t.last || s.start > t.last) t.last = s.start;
      };
      add(ex.primary, 1);
      ex.secondary.forEach(m => add(m, 0.5));
    }
    hit.forEach(m => st[m].sessions++);
  }
  return st;
}
function levelsFrom(st) {
  const max = Math.max(0, ...MUSCLE_ORDER.map(m => st[m].sets));
  const lv = {};
  MUSCLE_ORDER.forEach(m => lv[m] = st[m].sets <= 0 || !max ? 0 : Math.min(4, Math.ceil(st[m].sets / max * 4)));
  return lv;
}
function stimulusLabel(sets, max) {
  if (!sets) return { t: 'NENHUM', c: 'none' };
  const r = sets / max;
  if (r >= 0.66) return { t: 'ALTO', c: 'high' };
  if (r >= 0.33) return { t: 'MÉDIO', c: 'mid' };
  return { t: 'BAIXO', c: 'low' };
}

function exerciseHistory(exId) {
  const out = [];
  for (const s of sortedSessions()) {
    for (const e of s.exercises) {
      if (e.exerciseId !== exId) continue;
      const d = doneSets(e); if (!d.length) continue;
      let best = d[0], top = d[0];
      d.forEach(x => {
        if (e1rm(x) > e1rm(best)) best = x;
        if (+x.load > +top.load || (+x.load === +top.load && +x.reps > +top.reps)) top = x;
      });
      out.push({
        sessionId: s.id, date: s.start, sets: d, notes: e.notes,
        maxLoad: +top.load || 0, maxLoadReps: +top.reps, maxReps: Math.max(...d.map(x => +x.reps)),
        volume: d.reduce((a, x) => a + setVol(x), 0), best, e1rm: e1rm(best),
      });
    }
  }
  return out;
}
function lastEntry(exId, excludeSessionId) {
  const h = exerciseHistory(exId).filter(x => x.sessionId !== excludeSessionId);
  return h[h.length - 1] || null;
}
function exerciseRecords(exId) {
  const h = exerciseHistory(exId);
  if (!h.length) return null;
  const all = h.flatMap(x => x.sets);
  const pick = cmp => all.reduce((a, b) => cmp(b, a) ? b : a);
  const maxLoad = pick((b, a) => +b.load > +a.load || (+b.load === +a.load && +b.reps > +a.reps));
  const maxReps = pick((b, a) => +b.reps > +a.reps || (+b.reps === +a.reps && +b.load > +a.load));
  const best = pick((b, a) => e1rm(b) > e1rm(a));
  const first = h[0], last = h[h.length - 1];
  const pct = first.maxLoad > 0 && h.length > 1 ? (last.maxLoad - first.maxLoad) / first.maxLoad * 100 : null;
  return { h, maxLoad, maxReps, best, first, last, pct };
}

/* Compara cada exercício de uma sessão com a sessão anterior do mesmo exercício. */
function compareSession(session) {
  const out = [];
  session.exercises.forEach(e => {
    if (!doneSets(e).length) return;
    const h = exerciseHistory(e.exerciseId);
    const i = h.findIndex(x => x.sessionId === session.id);
    if (i < 0) return;
    const cur = h[i], prev = h[i - 1];
    const name = getEx(e.exerciseId)?.name || e.name;
    if (!prev) { out.push({ name, kind: 'new', text: 'Primeiro registro' }); return; }
    const priorBest = Math.max(...h.slice(0, i).map(x => x.e1rm));
    const pr = cur.e1rm > priorBest + 1e-9;
    if (cur.maxLoad > prev.maxLoad) out.push({ name, kind: 'up', pr, text: `+${fmtN(cur.maxLoad - prev.maxLoad, 2)} ${unit()} (${fmtLoadShort(prev.maxLoad)} → ${fmtLoad(cur.maxLoad)})` });
    else if (cur.maxLoad === prev.maxLoad && cur.maxLoadReps > prev.maxLoadReps) out.push({ name, kind: 'up', pr, text: `+${cur.maxLoadReps - prev.maxLoadReps} reps com ${fmtLoad(cur.maxLoad)}` });
    else if (pr) out.push({ name, kind: 'up', pr, text: 'Nova melhor série' });
    else if (cur.maxLoad < prev.maxLoad) out.push({ name, kind: 'down', text: `${fmtLoadShort(prev.maxLoad)} → ${fmtLoad(cur.maxLoad)}` });
    else out.push({ name, kind: 'same', text: `Manteve ${fmtLoad(cur.maxLoad)}` });
  });
  return out;
}

function weekBuckets(n) {
  const start = startOfWeek(new Date());
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = addDays(start, -7 * i), to = endOfDay(addDays(from, 6));
    out.push({ from, to, sessions: sessionsBetween(from, to) });
  }
  return out;
}

function musclesOf(w) {
  if (w.primary?.length) return { primary: w.primary, secondary: w.secondary || [] };
  const c = {};
  w.items.forEach(it => { const ex = getEx(it.exerciseId); if (ex) c[ex.primary] = (c[ex.primary] || 0) + (+it.sets || 1); });
  return { primary: Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 3), secondary: [] };
}
function lastSessionOf(workoutId) {
  const s = sortedSessions().filter(x => x.workoutId === workoutId);
  return s[s.length - 1] || null;
}
function estDuration(w) {
  const past = sortedSessions().filter(x => x.workoutId === w.id && x.duration > 5).slice(-3);
  if (past.length) return Math.round(past.reduce((a, x) => a + x.duration, 0) / past.length / 5) * 5 || 5;
  const sec = w.items.reduce((a, it) => a + (+it.sets || 3) * (40 + (+it.rest || DB.profile.defaultRest)) + 60, 0);
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}
/* Próximo treino: escolha manual de hoje ou rotação a partir do último realizado. */
function suggestedWorkout() {
  if (!DB.workouts.length) return null;
  const pick = DB.ui.todayPick;
  if (pick && pick.date === dayKey(new Date())) { const w = getWorkout(pick.id); if (w) return w; }
  const ss = sortedSessions();
  for (let i = ss.length - 1; i >= 0; i--) {
    const idx = DB.workouts.findIndex(w => w.id === ss[i].workoutId);
    if (idx >= 0) return DB.workouts[(idx + 1) % DB.workouts.length];
  }
  return DB.workouts[0];
}

function weeklyStreak() {
  const target = DB.profile.weeklyTarget || 1;
  const buckets = weekBuckets(104);
  let n = 0;
  const cur = buckets.pop();
  if (cur.sessions.length >= target) n++;
  for (let i = buckets.length - 1; i >= 0; i--) { if (buckets[i].sessions.length >= target) n++; else break; }
  return n;
}

/* Ganho de carga máxima entre o primeiro registro (dentro da janela, se houver) e o último. */
function loadGains(sinceDays) {
  const since = sinceDays ? addDays(startOfDay(new Date()), -sinceDays) : null;
  const ids = [...new Set(DB.sessions.flatMap(s => s.exercises.map(e => e.exerciseId)))];
  const out = [];
  ids.forEach(id => {
    let h = exerciseHistory(id);
    if (since) h = h.filter(x => new Date(x.date) >= since);
    if (h.length < 2) return;
    const from = h[0].maxLoad, to = h[h.length - 1].maxLoad;
    if (from > 0 && to > from) out.push({ id, name: getEx(id)?.name || '?', from, to, delta: to - from, pct: (to - from) / from * 100, seq: h.map(x => x.maxLoad) });
  });
  return out.sort((a, b) => b.pct - a.pct);
}

/* ---------- Insights descritivos (somente a partir dos dados registrados) ---------- */
function computeInsights() {
  const out = [];
  if (!DB.sessions.length && !(DB.runs || []).length && !(DB.body || []).length) return out;
  const now = new Date(), today = startOfDay(now);
  const a = muscleStats(sessionsBetween(addDays(today, -27), now));
  const b = muscleStats(sessionsBetween(addDays(today, -55), endOfDay(addDays(today, -28))));
  MUSCLE_ORDER.filter(m => a[m].sets >= 3 && b[m].sets >= 3)
    .map(m => ({ m, pct: (a[m].sets - b[m].sets) / b[m].sets * 100 }))
    .filter(x => Math.abs(x.pct) >= 10)
    .sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct)).slice(0, 2)
    .forEach(t => out.push({ icon: t.pct > 0 ? 'up' : 'down', text: `Seu volume de ${lower(mName(t.m))} ${t.pct > 0 ? 'aumentou' : 'diminuiu'} ${fmtN(Math.abs(t.pct))}% nas últimas 4 semanas (séries, em relação às 4 anteriores).` }));

  loadGains().slice(0, 2).forEach(g => out.push({ icon: 'trend', text: `${g.name}: +${fmtN(g.delta, 2)} ${unit()} desde o primeiro registro (${fmtLoadShort(g.from)} → ${fmtLoad(g.to)}).` }));

  const wk = muscleStats(sessionsBetween(startOfWeek(now), now));
  const prio = MUSCLE_ORDER.filter(m => DB.profile.priorities[m] === 'alta');
  prio.filter(m => wk[m].sessions > 0).slice(0, 2).forEach(m => {
    const n = wk[m].sessions, pl = MUSCLES[m].plural;
    out.push({ icon: 'body', text: `${mName(m)} ${pl ? 'receberam' : 'recebeu'} estímulo em ${n} ${n === 1 ? 'sessão' : 'sessões'} nesta semana.` });
  });

  const lastPrimary = {};
  sortedSessions().forEach(s => s.exercises.forEach(e => { const ex = getEx(e.exerciseId); if (ex && doneSets(e).length) lastPrimary[ex.primary] = s.start; }));
  Object.entries(lastPrimary).map(([m, d]) => ({ m, n: daysBetween(d, now) })).filter(x => x.n >= 10)
    .sort((x, y) => (DB.profile.priorities[y.m] === 'alta') - (DB.profile.priorities[x.m] === 'alta') || y.n - x.n).slice(0, 2)
    .forEach(x => out.push({ icon: 'clock', text: `Você não treinou ${lower(mName(x.m))} como grupo principal nos últimos ${x.n} dias.` }));

  const s14 = muscleStats(sessionsBetween(addDays(today, -13), now));
  const reg = { inf: 0, sup: 0, core: 0 };
  MUSCLE_ORDER.forEach(m => reg[MUSCLES[m].region] += s14[m].sets);
  const tot = reg.inf + reg.sup + reg.core;
  if (tot > 0) {
    const top = Object.keys(reg).sort((x, y) => reg[y] - reg[x])[0];
    out.push({ icon: 'pie', text: `${REGIONS[top]} representam ${fmtN(reg[top] / tot * 100)}% das séries das últimas duas semanas (inferiores ${fmtN(reg.inf / tot * 100)}% · superiores ${fmtN(reg.sup / tot * 100)}% · core ${fmtN(reg.core / tot * 100)}%).` });
  }

  const runsIn = (a, b) => (DB.runs || []).filter(r => { const t = new Date(r.start); return t >= a && t <= b; }).reduce((s, r) => s + r.distance, 0) / 1000;
  const r4 = runsIn(addDays(today, -27), now), r8 = runsIn(addDays(today, -55), endOfDay(addDays(today, -28)));
  if (r4 > 0) out.push({ icon: 'run', text: `Você correu ${fmtN(r4, 1)} km nas últimas 4 semanas${r8 > 0 ? ` (${fmtN(r8, 1)} km nas 4 anteriores)` : ''}.` });

  const ws = (DB.body || []).filter(m => m.weight !== '' && m.weight != null).sort((x, y) => x.date < y.date ? -1 : 1);
  if (ws.length >= 2) {
    const last = ws.at(-1), base = ws.filter(m => m.date <= dayKey(addDays(today, -28))).at(-1);
    if (base) out.push({ icon: 'body', text: `Seu peso variou ${+last.weight - +base.weight > 0 ? '+' : ''}${fmtN(+last.weight - +base.weight, 1)} ${unit()} em relação a ${fmtShort(parseDayKey(base.date))} (${fmtN(base.weight, 1)} → ${fmtN(last.weight, 1)} ${unit()}).` });
  }

  const wc = sessionsBetween(startOfWeek(now), now).length;
  out.push({ icon: 'calendar', text: `Nesta semana: ${wc} de ${DB.profile.weeklyTarget} treinos planejados.` });
  return out;
}
