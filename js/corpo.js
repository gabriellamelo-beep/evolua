'use strict';
/* Corpo e energia: medidas, índices corporais e gasto calórico estimado.
   Tudo é estimativa a partir de fórmulas conhecidas; nada de metas ou recomendações. */

const ACTIVITY_LEVELS = [
  [1.2, 'Sedentária', 'Trabalho sentado, pouco deslocamento'],
  [1.3, 'Leve', 'Algumas caminhadas ao longo do dia'],
  [1.4, 'Moderada', 'Bastante tempo em pé ou andando'],
  [1.5, 'Alta', 'Trabalho físico ou muito ativo'],
];
const MET_STRENGTH = 5; // musculação (Compendium of Physical Activities: 3,5 moderada – 6 vigorosa)
const BODY_FIELDS = [
  ['weight', 'Peso', () => unit()], ['bodyFat', 'Gordura corporal', () => '%'],
  ['waist', 'Cintura', () => 'cm'], ['hip', 'Quadril', () => 'cm'], ['chest', 'Busto', () => 'cm'],
  ['arm', 'Braço', () => 'cm'], ['thigh', 'Coxa', () => 'cm'], ['calf', 'Panturrilha', () => 'cm'],
];
const hasVal = v => v !== '' && v != null && !isNaN(+v);
const kgOf = w => unit() === 'lb' ? w * 0.45359237 : w;
const bodySorted = () => (DB.body || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
function latestField(f, uptoKey) {
  return bodySorted().filter(m => hasVal(m[f]) && (!uptoKey || m.date <= uptoKey)).at(-1) || null;
}
function weightKgAt(date) {
  const m = (date && latestField('weight', dayKey(date))) || latestField('weight');
  return m ? kgOf(+m.weight) : null;
}
function ageAt(d = new Date()) {
  const b = DB.profile.birthDate; if (!b) return null;
  const bd = parseDayKey(b);
  let a = d.getFullYear() - bd.getFullYear();
  if (d.getMonth() < bd.getMonth() || (d.getMonth() === bd.getMonth() && d.getDate() < bd.getDate())) a--;
  return a;
}

/* ---------- Cálculos ---------- */
function bmr() {
  const p = DB.profile, w = weightKgAt(), h = +p.height, age = ageAt(), bf = latestField('bodyFat');
  const out = { mifflin: null, katch: null };
  if (w && h && age != null && p.sex) out.mifflin = 10 * w + 6.25 * h - 5 * age + (p.sex === 'm' ? 5 : -161);
  if (w && bf) out.katch = 370 + 21.6 * w * (1 - bf.bodyFat / 100);
  out.value = out.katch ?? out.mifflin;
  out.formula = out.katch ? 'Katch-McArdle' : out.mifflin ? 'Mifflin-St Jeor' : null;
  return out;
}
/* Gasto líquido do exercício (descontando o repouso, que já está no metabolismo basal). */
function sessionKcal(s) {
  const w = weightKgAt(s.start);
  return w && s.duration ? Math.round((MET_STRENGTH - 1) * w * s.duration / 60) : null;
}
function runKcal(r) {
  const w = weightKgAt(r.start);
  if (!w || !r.distance) return null;
  return Math.round(Math.max(0, w * r.distance / 1000 - w * (r.movingTime || 0) / 3600));
}
function firstDataDay() {
  const c = [DB.profile.createdAt, sortedSessions()[0]?.start, runsSorted()[0]?.start, bodySorted()[0] && parseDayKey(bodySorted()[0].date).toISOString()].filter(Boolean);
  return startOfDay(c.reduce((a, b) => a < b ? a : b));
}
function energy(days) {
  const b = bmr(); if (!b.value) return null;
  const now = new Date();
  const eff = Math.max(1, Math.min(days, daysBetween(firstDataDay(), now) + 1));
  const from = addDays(startOfDay(now), -(eff - 1));
  const f = +DB.profile.activityFactor || 1.3;
  const ss = sessionsBetween(from, now), rr = runsBetween(from, now);
  const st = ss.reduce((a, s) => a + (sessionKcal(s) || 0), 0), rn = rr.reduce((a, r) => a + (runKcal(r) || 0), 0);
  return { days: eff, asked: days, base: b.value, life: b.value * (f - 1), strength: st / eff, run: rn / eff, total: b.value * f + (st + rn) / eff, nSess: ss.length, nRuns: rr.length, formula: b.formula, bmr: b };
}
function dailyEnergy(n) {
  const b = bmr(); if (!b.value) return [];
  const f = +DB.profile.activityFactor || 1.3, out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(startOfDay(new Date()), -i), e = endOfDay(d);
    const ex = sessionsBetween(d, e).reduce((a, s) => a + (sessionKcal(s) || 0), 0) + runsBetween(d, e).reduce((a, r) => a + (runKcal(r) || 0), 0);
    out.push({ label: fmtShort(d), y: Math.round(b.value * f + ex) });
  }
  return out;
}
function indices() {
  const p = DB.profile, w = latestField('weight'), bf = latestField('bodyFat'), wa = latestField('waist'), hi = latestField('hip');
  const h = +p.height, wk = w ? kgOf(+w.weight) : null;
  const out = {};
  if (wk && h) out.imc = wk / Math.pow(h / 100, 2);
  if (wk && bf) { out.lean = +w.weight * (1 - bf.bodyFat / 100); out.fat = +w.weight * bf.bodyFat / 100; }
  if (wa && hi) out.rcq = wa.waist / hi.hip;
  if (wa && h) out.rce = wa.waist / h;
  return out;
}
const kcalFmt = v => fmtN(Math.round(v / 10) * 10);

/* ---------- Tela ---------- */
function renderCorpo() {
  const p = DB.profile, ms = bodySorted();
  let html = `<header class="page-head"><a class="icon-btn" href="#/" aria-label="Voltar">${ic('left')}</a><h1 class="h-sm">Corpo e energia</h1><button class="btn btn-primary btn-sm" data-act="bodyNew">${ic('plus')}Medidas</button></header>`;
  const lvl = ACTIVITY_LEVELS.find(l => l[0] === +p.activityFactor) || ACTIVITY_LEVELS[1];
  html += `<button class="card basics" data-act="bodyBasics">
    <div class="card-head"><h3>Dados básicos</h3><span class="link">Editar</span></div>
    <div class="basics-row"><span>${p.sex ? (p.sex === 'f' ? 'Feminino' : 'Masculino') : '<i>sexo</i>'}</span><span>${ageAt() != null ? ageAt() + ' anos' : '<i>idade</i>'}</span><span>${p.height ? fmtN(p.height) + ' cm' : '<i>altura</i>'}</span><span>Dia a dia: ${lvl[1].toLowerCase()}</span></div>
  </button>`;

  const per = DB.ui.energyDays || 28, e = energy(per);
  if (e) {
    const parts = [['base', 'Metabolismo basal', e.base], ['life', 'Atividade do dia a dia', e.life], ['strength', 'Treinos de força', e.strength], ['run', 'Corridas', e.run]];
    html += `<section class="card energy">
      <div class="card-head"><h3>Gasto médio estimado</h3>${seg('energyD', [[7, '7 dias'], [28, '28 dias']], per)}</div>
      <div class="kcal-big">~${kcalFmt(e.total)}<small> kcal/dia</small></div>
      <div class="stack-bar">${parts.filter(x => x[2] > 0).map(([k, , v]) => `<i class="eb-${k}" style="flex:${v}"></i>`).join('')}</div>
      <div class="energy-list">
        <div><i class="eb-base"></i><span>Metabolismo basal<small>${e.formula}</small></span><b>${kcalFmt(e.base)}</b></div>
        <div data-act="bodyBasics"><i class="eb-life"></i><span>Atividade do dia a dia<small>fator ${fmtN(+p.activityFactor || 1.3, 1)} · ${lvl[1].toLowerCase()}</small></span><b>${kcalFmt(e.life)}</b></div>
        <div><i class="eb-strength"></i><span>Treinos de força<small>${e.nSess} ${e.nSess === 1 ? 'sessão' : 'sessões'} · média por dia</small></span><b>${kcalFmt(e.strength)}</b></div>
        <div><i class="eb-run"></i><span>Corridas<small>${e.nRuns} ${e.nRuns === 1 ? 'corrida' : 'corridas'} · média por dia</small></span><b>${kcalFmt(e.run)}</b></div>
      </div>
      ${e.days < e.asked ? `<p class="muted small">Média de ${e.days} ${e.days === 1 ? 'dia' : 'dias'} — o período começa no seu primeiro registro.</p>` : ''}
      <h4 class="sub-h">Últimos 14 dias</h4>
      ${barChart(dailyEnergy(14), { h: 130, fmt: v => fmtN(v) })}
      <p class="muted small note">Estimativa por fórmulas (${e.bmr.mifflin ? `Mifflin-St Jeor ${kcalFmt(e.bmr.mifflin)}` : ''}${e.bmr.mifflin && e.bmr.katch ? ' · ' : ''}${e.bmr.katch ? `Katch-McArdle ${kcalFmt(e.bmr.katch)}` : ''} kcal de basal; musculação ≈ ${MET_STRENGTH} METs; corrida ≈ 1 kcal/kg/km, descontado o repouso). Pode variar 10–20% para mais ou para menos e não substitui avaliação profissional.</p>
    </section>`;
  } else {
    const miss = [!p.sex && 'sexo', !p.birthDate && 'data de nascimento', !p.height && 'altura', !weightKgAt() && 'peso'].filter(Boolean);
    html += `<section class="card">${emptyState('flame', 'Gasto calórico', `Para estimar, falta${miss.length > 1 ? 'm' : ''}: ${miss.join(', ')}.`, `<button class="btn btn-primary" data-act="${!weightKgAt() && miss.length === 1 ? 'bodyNew' : 'bodyBasics'}">Completar dados</button>`)}</section>`;
  }

  if (!ms.length) return html + `<section class="card">${emptyState('body', 'Nenhuma medida ainda', 'Registre peso e medidas para acompanhar a evolução e os índices.', `<button class="btn btn-primary" data-act="bodyNew">Registrar medidas</button>`)}</section>`;

  const ix = indices(), w = latestField('weight'), bf = latestField('bodyFat'), wa = latestField('waist');
  const wHist = ms.filter(m => hasVal(m.weight)), prevW = wHist.at(-2);
  const delta = (cur, prev, u) => prev != null ? `<small class="${cur - prev > 0 ? 'up' : cur - prev < 0 ? 'dn' : ''}">${cur - prev > 0 ? '+' : ''}${fmtN(cur - prev, 1)} ${u} vs anterior</small>` : '';
  html += `<section class="card"><div class="card-head"><h3>Índices atuais</h3>${w ? `<span class="muted small">peso de ${fmtShort(parseDayKey(w.date))}</span>` : ''}</div>
    <div class="mini-stats">
      ${w ? `<div><small>Peso</small><b>${fmtN(w.weight, 1)} ${unit()}</b>${delta(+w.weight, prevW && +prevW.weight, unit())}</div>` : ''}
      ${ix.imc ? `<div><small>IMC</small><b>${fmtN(ix.imc, 1)}</b><small>kg/m²</small></div>` : ''}
      ${bf ? `<div><small>Gordura corporal</small><b>${fmtN(bf.bodyFat, 1)}%</b><small>${fmtShort(parseDayKey(bf.date))}</small></div>` : ''}
      ${ix.lean ? `<div><small>Massa magra</small><b>${fmtN(ix.lean, 1)} ${unit()}</b></div><div><small>Massa gorda</small><b>${fmtN(ix.fat, 1)} ${unit()}</b></div>` : ''}
      ${wa ? `<div><small>Cintura</small><b>${fmtN(wa.waist, 1)} cm</b><small>${fmtShort(parseDayKey(wa.date))}</small></div>` : ''}
      ${ix.rcq ? `<div><small>Cintura/quadril</small><b>${fmtN(ix.rcq, 2)}</b></div>` : ''}
      ${ix.rce ? `<div><small>Cintura/altura</small><b>${fmtN(ix.rce, 2)}</b></div>` : ''}
    </div>
    ${!p.height ? `<p class="muted small note">Informe a altura em Dados básicos para calcular IMC e cintura/altura.</p>` : ''}
  </section>`;

  const avail = BODY_FIELDS.filter(([f]) => ms.filter(m => hasVal(m[f])).length >= 1);
  const metric = avail.some(([f]) => f === DB.ui.bodyMetric) ? DB.ui.bodyMetric : avail[0]?.[0];
  if (metric) {
    const def = BODY_FIELDS.find(x => x[0] === metric), pts = ms.filter(m => hasVal(m[metric])).map(m => ({ label: fmtShort(parseDayKey(m.date)), y: +m[metric] }));
    const first = pts[0], last = pts.at(-1);
    html += `<section class="card"><div class="chips scroll">${avail.map(([f, l]) => `<button class="chip ${f === metric ? 'on' : ''}" data-act="bodyMetric" data-v="${f}">${l}</button>`).join('')}</div>
      ${pts.length > 1 ? `<div class="seq">${fmtN(first.y, 1)} <i>→</i> ${fmtN(last.y, 1)} <small>${def[2]()} · ${last.y - first.y > 0 ? '+' : ''}${fmtN(last.y - first.y, 1)} desde ${first.label}</small></div>` : ''}
      ${lineChart(pts.slice(-24), { unitLabel: ' ' + def[2](), fmt: v => fmtN(v, 1) })}</section>`;
  }

  html += `<h4 class="group-h">Registros</h4><div class="list card">${ms.slice().reverse().map(m => `<div class="row" data-act="bodyEdit" data-id="${m.id}">
    <div class="row-main"><b>${fmtDate(parseDayKey(m.date))}</b><span class="muted">${BODY_FIELDS.filter(([f]) => hasVal(m[f])).map(([f, l, u]) => `${f === 'weight' || f === 'bodyFat' ? '' : l.toLowerCase() + ' '}${fmtN(m[f], 1)}${u() === '%' ? '%' : ' ' + u()}`).join(' · ')}</span></div>${ic('right', 'chev')}</div>`).join('')}</div>
    <div class="spacer"></div>`;
  return html;
}
ACT.energyD = el => { DB.ui.energyDays = +el.dataset.v; saveDB(); rerender(); };
ACT.bodyMetric = el => { DB.ui.bodyMetric = el.dataset.v; saveDB(); rerender(); };

/* Dados básicos */
ACT.bodyBasics = () => {
  closeAllSheets();
  const p = DB.profile;
  openSheet(`<h3 class="sheet-title">Dados básicos</h3>
    <div class="field row-field"><span>Sexo</span>${seg('basicSex', [['f', 'Feminino'], ['m', 'Masculino']], p.sex)}</div>
    <p class="muted small" style="margin-top:-8px">Usado só na fórmula do metabolismo basal.</p>
    <div class="ed-grid">
      <label class="field"><span>Data de nascimento</span><input type="date" data-bind="basic" data-k="birthDate" value="${esc(p.birthDate || '')}"></label>
      <label class="field"><span>Altura (cm)</span><input type="number" inputmode="numeric" min="100" max="230" data-bind="basic" data-k="height" value="${esc(p.height || '')}" placeholder="165"></label>
    </div>
    <div class="field"><span>Atividade do dia a dia <small>(sem contar treinos e corridas, que já entram no cálculo)</small></span>
      <div class="opt-list">${ACTIVITY_LEVELS.map(([f, l, d]) => `<button class="opt ${+p.activityFactor === f ? 'on' : ''}" data-act="basicAct" data-v="${f}"><b>${l}</b><small>${d}</small></button>`).join('')}</div></div>
    <button class="btn btn-primary btn-block" data-close>Pronto</button>`, { onClose: () => { if (parseHash().name === 'corpo' || parseHash().name === '') rerender(); } });
};
ACT.basicSex = el => { DB.profile.sex = el.dataset.v; saveDB(); $$('[data-act=basicSex]').forEach(b => b.classList.toggle('on', b === el)); };
ACT.basicAct = el => { DB.profile.activityFactor = +el.dataset.v; saveDB(); $$('[data-act=basicAct]').forEach(b => b.classList.toggle('on', b === el)); };
BIND.basic = el => { DB.profile[el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value; saveDB(); };

/* Registro de medidas */
let BODYF = null;
ACT.bodyNew = () => bodyForm(null);
ACT.bodyEdit = el => bodyForm(DB.body.find(m => m.id === el.dataset.id));
function bodyForm(m) {
  closeAllSheets();
  BODYF = { id: m?.id || null };
  const lastOf = f => latestField(f);
  BODYF.w = openSheet(`<h3 class="sheet-title">${m ? 'Editar medidas' : 'Registrar medidas'}</h3>
    <label class="field"><span>Data</span><input type="date" id="bfDate" value="${m ? m.date : dayKey(new Date())}"></label>
    <p class="muted small">Preencha só o que mediu. Em cinza, o último valor registrado.</p>
    <div class="ed-grid">${BODY_FIELDS.map(([f, l, u]) => `<label class="field"><span>${l} (${u()})</span><input type="number" inputmode="decimal" step="0.1" min="0" id="bf_${f}" value="${m && hasVal(m[f]) ? m[f] : ''}" placeholder="${lastOf(f) ? fmtN(lastOf(f)[f], 1) : '—'}"></label>`).join('')}</div>
    <label class="field"><span>Observações</span><input id="bfNotes" value="${esc(m?.notes || '')}" placeholder="Ex.: em jejum, pela manhã"></label>
    <div class="sheet-actions">${m ? `<button class="btn btn-ghost danger" data-act="bodyDelete">${ic('trash')}Excluir</button>` : `<button class="btn btn-ghost" data-close>Cancelar</button>`}<button class="btn btn-primary" data-act="bodySave">Salvar</button></div>`, { cls: 'tall' });
}
ACT.bodySave = () => {
  const rec = { date: $('#bfDate').value || dayKey(new Date()), notes: $('#bfNotes').value };
  let any = false;
  BODY_FIELDS.forEach(([f]) => { const v = $('#bf_' + f).value.replace(',', '.'); rec[f] = v === '' ? '' : +v; if (v !== '') any = true; });
  if (!any) return toast('Preencha pelo menos uma medida');
  if (hasVal(rec.bodyFat) && (rec.bodyFat <= 2 || rec.bodyFat >= 70)) return toast('Confira a % de gordura');
  if (BODYF.id) Object.assign(DB.body.find(x => x.id === BODYF.id), rec);
  else DB.body.push({ id: uid(), ...rec });
  saveDB(); closeSheet(BODYF.w); toast('Medidas salvas');
  if (parseHash().name === 'corpo') rerender(); else go('#/corpo');
};
ACT.bodyDelete = async () => {
  const id = BODYF.id; closeAllSheets();
  if (!await confirmSheet({ title: 'Excluir este registro de medidas?', ok: 'Excluir', danger: true })) return;
  DB.body = DB.body.filter(x => x.id !== id); markDeleted('body', id); saveDB(); rerender();
};
