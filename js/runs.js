'use strict';
/* Corridas: registro manual e importação pela API do Strava.
   As credenciais do Strava ficam só neste aparelho (fora do backup e do repositório). */

const STRAVA_KEY = 'evolua.strava';
const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];
const RUNSYNC = { busy: false };

function stravaCfg() { try { return JSON.parse(localStorage.getItem(STRAVA_KEY)) || {}; } catch (e) { return {}; } }
function saveStrava(c) { localStorage.setItem(STRAVA_KEY, JSON.stringify(c)); }
const stravaConnected = () => !!stravaCfg().refreshToken;
const redirectUri = () => location.origin + location.pathname;

/* ---------- Formatação ---------- */
const runsSorted = () => (DB.runs || []).slice().sort((a, b) => a.start < b.start ? -1 : 1);
const fmtKm = m => `${fmtN(m / 1000, m < 10000 ? 2 : 1)} km`;
function paceSec(sec, m) { return m > 0 ? sec / (m / 1000) : 0; }
function fmtPaceS(p) { if (!p) return '—'; p = Math.round(p); return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')}`; }
const fmtPace = (sec, m) => m > 0 ? `${fmtPaceS(paceSec(sec, m))} /km` : '—';
function fmtHMS(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const runsBetween = (from, to) => runsSorted().filter(r => { const t = new Date(r.start); return t >= from && t <= to; });
const sumKm = rs => rs.reduce((a, r) => a + (r.distance || 0), 0);

/* ---------- Rota (polyline do Strava) ---------- */
function decodePolyline(str) {
  let i = 0, lat = 0, lng = 0;
  const pts = [];
  const next = () => { let b, shift = 0, res = 0; do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20); return (res & 1) ? ~(res >> 1) : (res >> 1); };
  while (i < str.length) { lat += next(); lng += next(); pts.push([lat / 1e5, lng / 1e5]); }
  return pts;
}
function routeSVG(poly, cls = '') {
  if (!poly) return `<div class="route ${cls} none">${ic('run')}</div>`;
  const pts = decodePolyline(poly);
  if (pts.length < 2) return `<div class="route ${cls} none">${ic('run')}</div>`;
  const k = Math.cos(pts.reduce((a, p) => a + p[0], 0) / pts.length * Math.PI / 180);
  const xy = pts.map(([la, lo]) => [lo * k, -la]);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const pad = 8, s = (100 - pad * 2) / span;
  const offX = pad + (100 - pad * 2 - (Math.max(...xs) - minX) * s) / 2, offY = pad + (100 - pad * 2 - (Math.max(...ys) - minY) * s) / 2;
  const step = Math.max(1, Math.floor(xy.length / 400));
  const d = xy.filter((_, i) => i % step === 0 || i === xy.length - 1).map((p, i) => `${i ? 'L' : 'M'}${(offX + (p[0] - minX) * s).toFixed(1)} ${(offY + (p[1] - minY) * s).toFixed(1)}`).join('');
  const [sx, sy] = [offX + (xy[0][0] - minX) * s, offY + (xy[0][1] - minY) * s];
  return `<svg class="route ${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="${d}"/><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3"/></svg>`;
}

/* ---------- Strava ---------- */
async function stravaPostToken(body) {
  const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 400 ? 'Strava recusou as credenciais. Confira o Client ID e o Client Secret.' : `Erro do Strava (${r.status})`);
  return r.json();
}
async function stravaToken() {
  const c = stravaCfg();
  if (!c.refreshToken) throw new Error('Strava não conectado');
  if (c.expiresAt * 1000 > Date.now() + 60000) return c.accessToken;
  const j = await stravaPostToken({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: c.refreshToken });
  Object.assign(c, { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_at });
  saveStrava(c);
  return c.accessToken;
}
function stravaAuthorize() {
  const c = stravaCfg();
  if (!c.clientId || !c.clientSecret) { toast('Preencha o Client ID e o Client Secret'); return; }
  const u = new URL('https://www.strava.com/oauth/authorize');
  u.search = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri(), response_type: 'code', approval_prompt: 'auto', scope: 'read,activity:read_all', state: 'evolua-strava' });
  location.href = u.toString();
}
/* Volta do Strava com ?code=…&state=evolua-strava */
async function stravaHandleRedirect() {
  const q = new URLSearchParams(location.search);
  if (q.get('state') !== 'evolua-strava') return;
  history.replaceState(null, '', location.pathname + '#/corridas');
  if (q.get('error') || !q.get('code')) { toast('Conexão com o Strava cancelada'); return; }
  if (!(q.get('scope') || '').includes('activity:read')) { toast('Autorize o acesso às atividades para importar as corridas'); return; }
  const c = stravaCfg();
  try {
    const j = await stravaPostToken({ client_id: c.clientId, client_secret: c.clientSecret, code: q.get('code'), grant_type: 'authorization_code' });
    Object.assign(c, { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_at, athlete: j.athlete ? `${j.athlete.firstname || ''} ${j.athlete.lastname || ''}`.trim() : '', athleteId: j.athlete?.id });
    saveStrava(c);
    toast('Strava conectado');
    rerender();
    await stravaSync();
  } catch (e) { console.error(e); toast(e.message); }
}
function localIso(s) {
  const [d, t = '0:0:0'] = String(s).replace('Z', '').split('T');
  const [y, mo, da] = d.split('-').map(Number), [h, mi, se] = t.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi, se || 0).toISOString();
}
function fromStrava(a) {
  return {
    id: 's-' + a.id, source: 'strava', stravaId: a.id, name: a.name || 'Corrida', type: a.sport_type || a.type,
    start: localIso(a.start_date_local || a.start_date), distance: a.distance || 0, movingTime: a.moving_time || 0, elapsedTime: a.elapsed_time || 0,
    elevation: a.total_elevation_gain || 0, avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null, maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    cadence: a.average_cadence ? Math.round(a.average_cadence * 2) : null, polyline: a.map?.summary_polyline || '', race: a.workout_type === 1, notes: '',
  };
}
async function stravaSync({ full = false } = {}) {
  if (RUNSYNC.busy) return;
  RUNSYNC.busy = true; refreshRunsView();
  try {
    const token = await stravaToken();
    const have = new Map(DB.runs.filter(r => r.stravaId).map(r => [String(r.stravaId), r]));
    const deleted = new Set((DB.runsDeleted || []).map(String));
    const latest = runsSorted().filter(r => r.stravaId).at(-1);
    const after = full || !latest ? 0 : Math.floor(new Date(latest.start).getTime() / 1000) - 7 * 86400;
    let page = 1, added = 0;
    while (page <= 30) {
      const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}${after ? `&after=${after}` : ''}`, { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 429) throw new Error('Limite de consultas do Strava atingido. Tente de novo em 15 minutos.');
      if (r.status === 401) throw new Error('O Strava negou o acesso. Conecte de novo em Corridas → Strava.');
      if (!r.ok) throw new Error(`Erro do Strava (${r.status})`);
      const list = await r.json();
      if (!list.length) break;
      for (const a of list) {
        if (!RUN_TYPES.includes(a.sport_type || a.type) || deleted.has(String(a.id))) continue;
        const run = fromStrava(a), ex = have.get(String(a.id));
        if (ex) Object.assign(ex, run, { id: ex.id, notes: ex.notes });
        else { DB.runs.push(run); have.set(String(a.id), run); added++; }
      }
      if (list.length < 100) break;
      page++;
    }
    const c = stravaCfg(); c.lastSync = new Date().toISOString(); saveStrava(c);
    saveDB();
    toast(added ? `${added} ${added === 1 ? 'corrida importada' : 'corridas importadas'}` : 'Nenhuma corrida nova');
  } catch (e) {
    console.error(e);
    toast(/fetch|network/i.test(e.message) ? 'Sem conexão com o Strava' : e.message);
  } finally { RUNSYNC.busy = false; refreshRunsView(); }
}
async function stravaDisconnect() {
  const c = stravaCfg();
  try { if (c.accessToken) await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: 'Bearer ' + c.accessToken } }); } catch (e) { }
  saveStrava({ clientId: c.clientId, clientSecret: c.clientSecret });
}
function refreshRunsView() { if (['corridas', 'preferencias'].includes(parseHash().name)) rerender(); }

/* ---------- Tela ---------- */
function renderRuns() {
  const runs = runsSorted(), c = stravaCfg(), now = new Date();
  const conn = !!c.refreshToken;
  let html = pageHead('Corridas', `${conn ? `<button class="icon-btn ${RUNSYNC.busy ? 'spin' : ''}" data-act="runSync" aria-label="Sincronizar com o Strava">${ic('refresh')}</button>` : ''}<button class="btn btn-primary btn-sm" data-act="runNew">${ic('plus')}Registrar</button>`);

  html += conn
    ? `<button class="strava-bar" data-act="stravaSetup"><span class="strava-dot"></span><span><b>Strava</b>${c.athlete ? ' · ' + esc(c.athlete) : ''}<small>${RUNSYNC.busy ? 'Sincronizando…' : c.lastSync ? 'Sincronizado ' + relDay(c.lastSync) + ' às ' + fmtTime(c.lastSync) : 'Ainda não sincronizado'}</small></span>${ic('right', 'chev')}</button>`
    : `<section class="card strava-cta"><div><b>Importe suas corridas do Strava</b><p class="muted small">Conecte uma vez e sincronize com um toque. Também dá para registrar manualmente.</p></div><button class="btn btn-strava" data-act="stravaSetup">Conectar Strava</button></section>`;

  if (!runs.length) return html + emptyState('run', 'Nenhuma corrida ainda', conn ? 'Toque em sincronizar para importar do Strava.' : 'Conecte o Strava ou registre uma corrida.');

  const ws = startOfWeek(now), ms = new Date(now.getFullYear(), now.getMonth(), 1);
  const wk = runsBetween(ws, now), mo = runsBetween(ms, now);
  const moPace = paceSec(mo.reduce((a, r) => a + r.movingTime, 0), sumKm(mo));
  html += `<section class="stats">
    <div class="stat">${ic('run')}<div class="stat-v">${fmtKm(sumKm(wk))}</div><div class="stat-l">esta semana · ${wk.length} ${wk.length === 1 ? 'corrida' : 'corridas'}</div></div>
    <div class="stat">${ic('calendar')}<div class="stat-v">${fmtKm(sumKm(mo))}</div><div class="stat-l">em ${fmtDate(now, { month: 'long' })} · ${mo.length} ${mo.length === 1 ? 'corrida' : 'corridas'}</div></div>
    <div class="stat wide">${ic('timer')}<div class="stat-v">${moPace ? fmtPaceS(moPace) + ' <small>/km</small>' : '—'}</div><div class="stat-l">ritmo médio do mês (tempo em movimento)</div></div>
  </section>`;

  const weeks = weekBuckets(12).map(b => ({ label: fmtShort(b.from), y: Math.round(sumKm(runsBetween(b.from, b.to)) / 100) / 10 }));
  html += `<section class="card"><div class="card-head"><h3>Quilômetros por semana</h3><span class="muted small">12 semanas</span></div>${barChart(weeks, { fmt: v => fmtN(v, 1) })}</section>`;

  const paced = runs.filter(r => r.distance >= 1000 && r.movingTime > 0).slice(-20);
  if (paced.length >= 2) html += `<section class="card"><div class="card-head"><h3>Ritmo médio por corrida</h3><span class="muted small">min/km</span></div>${lineChart(paced.map(r => ({ label: fmtShort(r.start), y: paceSec(r.movingTime, r.distance) })), { fmt: fmtPaceS, tickFmt: fmtPaceS })}</section>`;

  const longest = runs.reduce((a, r) => !a || r.distance > a.distance ? r : a, null);
  const pool = runs.filter(r => r.distance >= 5000 && r.movingTime);
  const fastest5 = pool.reduce((a, r) => !a || paceSec(r.movingTime, r.distance) < paceSec(a.movingTime, a.distance) ? r : a, null);
  const yr = runsBetween(new Date(now.getFullYear(), 0, 1), now);
  html += `<section class="card"><div class="card-head"><h3>Marcas</h3></div><div class="mini-stats">
    <div data-act="runOpen" data-id="${longest.id}"><small>Mais longa</small><b>${fmtKm(longest.distance)}</b><small>${fmtShort(longest.start)}</small></div>
    <div ${fastest5 ? `data-act="runOpen" data-id="${fastest5.id}"` : ''}><small>Melhor ritmo (≥ 5 km)</small><b>${fastest5 ? fmtPace(fastest5.movingTime, fastest5.distance) : '—'}</b>${fastest5 ? `<small>${fmtKm(fastest5.distance)} · ${fmtShort(fastest5.start)}</small>` : ''}</div>
    <div><small>Total em ${now.getFullYear()}</small><b>${fmtKm(sumKm(yr))}</b><small>${yr.length} corridas</small></div>
  </div></section>`;

  let curM = null;
  html += '<div class="timeline">';
  runs.slice().reverse().forEach(r => {
    const m = fmtDate(r.start, { month: 'long', year: 'numeric' });
    if (m !== curM) { curM = m; html += `<h4 class="group-h">${m} <small>${fmtKm(sumKm(runs.filter(x => fmtDate(x.start, { month: 'long', year: 'numeric' }) === m)))}</small></h4>`; }
    html += `<button class="tl-item run-item" data-act="runOpen" data-id="${r.id}">
      ${routeSVG(r.polyline, 'thumb')}
      <div class="tl-main"><b>${esc(r.name)}${r.race ? ' <span class="pill sm acc">prova</span>' : ''}</b><span class="muted">${lower(fmtDate(r.start, { weekday: 'short', day: '2-digit', month: '2-digit' }))} · ${fmtKm(r.distance)} · ${fmtHMS(r.movingTime)} · ${fmtPace(r.movingTime, r.distance)}</span></div>${ic('right', 'chev')}
    </button>`;
  });
  return html + '</div>';
}

ACT.runSync = () => stravaSync();
ACT.runOpen = el => {
  closeAllSheets();
  const r = DB.runs.find(x => x.id === el.dataset.id); if (!r) return;
  const w = openSheet(`<div class="run-detail">
    <small class="muted">${lower(fmtDate(r.start, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }))} · ${fmtTime(r.start)}</small>
    <h3 class="sheet-title">${esc(r.name)}</h3>
    ${r.polyline ? routeSVG(r.polyline, 'big') : ''}
    <div class="mini-stats">
      <div><small>Distância</small><b>${fmtKm(r.distance)}</b></div>
      <div><small>Tempo em movimento</small><b>${fmtHMS(r.movingTime)}</b></div>
      <div><small>Ritmo médio</small><b>${fmtPace(r.movingTime, r.distance)}</b></div>
      <div><small>Tempo total</small><b>${fmtHMS(r.elapsedTime || r.movingTime)}</b></div>
      <div><small>Elevação</small><b>${r.elevation ? fmtN(r.elevation) + ' m' : '—'}</b></div>
      <div><small>FC média / máx.</small><b>${r.avgHr ? `${r.avgHr}${r.maxHr ? ' / ' + r.maxHr : ''} bpm` : '—'}</b></div>
      ${r.cadence ? `<div><small>Cadência</small><b>${r.cadence} ppm</b></div>` : ''}
      ${runKcal(r) ? `<div><small>Gasto estimado</small><b>~${fmtN(runKcal(r))} kcal</b></div>` : ''}
    </div>
    <label class="field"><span>Observações</span><textarea data-live="runNote" data-id="${r.id}" rows="2" placeholder="Como foi a corrida?">${esc(r.notes || '')}</textarea></label>
    ${r.stravaId ? `<a class="btn btn-ghost btn-block" href="https://www.strava.com/activities/${r.stravaId}" target="_blank" rel="noopener">Ver no Strava</a>` : ''}
    <div class="sheet-actions">
      <button class="btn btn-ghost danger" data-act="runDelete" data-id="${r.id}">${ic('trash')}Excluir</button>
      ${r.source === 'manual' ? `<button class="btn btn-ghost" data-act="runEdit" data-id="${r.id}">${ic('edit')}Editar</button>` : ''}
    </div></div>`, { cls: 'tall', onClose: () => { saveDB(); } });
  w._rid = r.id;
};
LIVE.runNote = el => { const r = DB.runs.find(x => x.id === el.dataset.id); if (r) r.notes = el.value; };
ACT.runDelete = async el => {
  const r = DB.runs.find(x => x.id === el.dataset.id);
  closeAllSheets();
  if (!await confirmSheet({ title: 'Excluir esta corrida?', text: r.stravaId ? 'Ela some só do Evolua (continua no Strava) e não será importada de novo.' : 'Esta ação não pode ser desfeita.', ok: 'Excluir', danger: true })) return;
  DB.runs = DB.runs.filter(x => x.id !== r.id); markDeleted('runs', r.id);
  if (r.stravaId) DB.runsDeleted = [...(DB.runsDeleted || []), r.stravaId];
  saveDB(); toast('Corrida excluída'); rerender();
};

/* Registro manual */
let RUNF = null;
ACT.runNew = () => runForm(null);
ACT.runEdit = el => { closeAllSheets(); runForm(DB.runs.find(x => x.id === el.dataset.id)); };
function runForm(r) {
  const d = r ? new Date(r.start) : new Date();
  const local = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const t = r ? r.movingTime : 0;
  RUNF = { id: r?.id || null };
  RUNF.w = openSheet(`<h3 class="sheet-title">${r ? 'Editar corrida' : 'Registrar corrida'}</h3>
    <label class="field"><span>Nome</span><input id="rfName" value="${esc(r?.name || 'Corrida')}"></label>
    <label class="field"><span>Data e hora</span><input id="rfDate" type="datetime-local" value="${local}"></label>
    <div class="ed-grid">
      <label class="field"><span>Distância (km)</span><input id="rfKm" type="number" inputmode="decimal" step="0.01" min="0" value="${r ? +(r.distance / 1000).toFixed(2) : ''}" placeholder="5,0"></label>
      <label class="field"><span>Elevação (m)</span><input id="rfElev" type="number" inputmode="numeric" min="0" value="${r?.elevation || ''}" placeholder="opcional"></label>
    </div>
    <div class="field"><span>Tempo</span><div class="time-in">
      <input id="rfH" type="number" inputmode="numeric" min="0" value="${t ? Math.floor(t / 3600) : ''}" placeholder="0"><i>h</i>
      <input id="rfM" type="number" inputmode="numeric" min="0" max="59" value="${t ? Math.floor(t % 3600 / 60) : ''}" placeholder="30"><i>min</i>
      <input id="rfS" type="number" inputmode="numeric" min="0" max="59" value="${t ? t % 60 : ''}" placeholder="0"><i>s</i></div></div>
    <label class="field"><span>FC média (bpm)</span><input id="rfHr" type="number" inputmode="numeric" min="0" value="${r?.avgHr || ''}" placeholder="opcional"></label>
    <label class="field"><span>Observações</span><textarea id="rfNotes" rows="2">${esc(r?.notes || '')}</textarea></label>
    <div class="sheet-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-act="runFormSave">Salvar</button></div>`, { cls: 'tall' });
}
ACT.runFormSave = () => {
  const v = id => $('#' + id).value;
  const km = +String(v('rfKm')).replace(',', '.'), sec = (+v('rfH') || 0) * 3600 + (+v('rfM') || 0) * 60 + (+v('rfS') || 0);
  if (!(km > 0)) return toast('Informe a distância');
  if (!(sec > 0)) return toast('Informe o tempo');
  const data = {
    name: v('rfName').trim() || 'Corrida', start: new Date(v('rfDate') || Date.now()).toISOString(), distance: Math.round(km * 1000),
    movingTime: sec, elapsedTime: sec, elevation: +v('rfElev') || 0, avgHr: +v('rfHr') || null, notes: v('rfNotes'),
  };
  if (RUNF.id) Object.assign(DB.runs.find(x => x.id === RUNF.id), data);
  else DB.runs.push({ id: 'm-' + uid(), source: 'manual', type: 'Run', maxHr: null, cadence: null, polyline: '', race: false, ...data });
  saveDB(); closeSheet(RUNF.w); toast('Corrida salva'); rerender();
};

/* Configuração do Strava */
ACT.stravaSetup = () => {
  closeAllSheets();
  const c = stravaCfg(), conn = !!c.refreshToken;
  openSheet(conn ? `<h3 class="sheet-title">Strava</h3>
      <p class="muted">Conectado${c.athlete ? ' como <b>' + esc(c.athlete) + '</b>' : ''}. São importadas as atividades de corrida (corrida, trilha e esteira virtual).</p>
      <div class="btn-col">
        <button class="btn btn-primary" data-act="stravaSyncBtn">${ic('refresh')}Sincronizar agora</button>
        <button class="btn btn-ghost" data-act="stravaFull">Reimportar todo o histórico</button>
        <button class="btn btn-text danger" data-act="stravaOff">Desconectar</button>
      </div>`
    : `<h3 class="sheet-title">Conectar ao Strava</h3>
      <p class="muted small">O Strava exige que você crie um “app de API” na sua conta. É grátis e só precisa ser feito uma vez.</p>
      <ol class="steps">
        <li>Abra <a class="link" href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> (faça login no Strava).</li>
        <li>Crie o app com: <b>Nome</b> Evolua · <b>Categoria</b> Training · <b>Site</b> <code>${esc(redirectUri())}</code> · <b>Domínio de retorno de autorização</b> <code>${esc(location.hostname)}</code></li>
        <li>Copie o <b>Client ID</b> e o <b>Client Secret</b> e cole abaixo.</li>
      </ol>
      <label class="field"><span>Client ID</span><input id="svId" inputmode="numeric" value="${esc(c.clientId || '')}" autocomplete="off"></label>
      <label class="field"><span>Client Secret</span><input id="svSecret" type="password" value="${esc(c.clientSecret || '')}" autocomplete="off"></label>
      <p class="muted small">Esses dados ficam salvos só neste aparelho e não entram no backup.</p>
      <button class="btn btn-strava btn-lg btn-block" data-act="stravaGo">Conectar com Strava</button>`, { cls: conn ? '' : 'tall' });
};
ACT.stravaGo = () => {
  const id = $('#svId').value.trim(), secret = $('#svSecret').value.trim();
  if (!/^\d+$/.test(id)) return toast('Client ID deve ter só números');
  if (secret.length < 20) return toast('Confira o Client Secret');
  saveStrava({ ...stravaCfg(), clientId: id, clientSecret: secret });
  stravaAuthorize();
};
ACT.stravaSyncBtn = () => { closeAllSheets(); stravaSync(); };
ACT.stravaFull = () => { closeAllSheets(); stravaSync({ full: true }); };
ACT.stravaOff = async () => {
  closeAllSheets();
  if (!await confirmSheet({ title: 'Desconectar o Strava?', text: 'As corridas já importadas continuam no Evolua.', ok: 'Desconectar', danger: true })) return;
  await stravaDisconnect(); toast('Strava desconectado'); rerender();
};
