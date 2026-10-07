'use strict';
/* Importação do arquivo de dados do Strava (Configurações → Minha conta → Baixar ou excluir sua conta).
   Aceita o .zip inteiro (lê activities.csv e as rotas em GPX/TCX/FIT) ou só o activities.csv.
   Não precisa de assinatura nem de app de API. */

const SFILE = { busy: false };

/* ---------- ZIP (lê só as entradas necessárias, sem carregar o arquivo todo) ---------- */
async function zipEntries(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Arquivo .zip inválido');
  const count = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff || count === 0xffff) throw new Error('Arquivo grande demais. Descompacte e escolha só o activities.csv');
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder(), out = new Map();
  for (let p = 0, n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true);
    const nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), off = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nl));
    out.set(name.replace(/^.*?(?=activities)/, ''), { method, csize, off });
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function inflate(bytes, format) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function zipRead(file, e) {
  const h = new DataView(await file.slice(e.off, e.off + 30).arrayBuffer());
  const start = e.off + 30 + h.getUint16(26, true) + h.getUint16(28, true);
  const raw = new Uint8Array(await file.slice(start, start + e.csize).arrayBuffer());
  if (e.method === 0) return raw;
  if (e.method === 8) return inflate(raw, 'deflate-raw');
  throw new Error('Compressão do .zip não suportada');
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const normH = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function csvNum(s) {
  s = String(s || '').trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return parseFloat(s) || 0;
}
const MONTHS = ['jan', 'feb|fev', 'mar', 'apr|abr', 'may|mai', 'jun', 'jul', 'aug|ago', 'sep|set', 'oct|out', 'nov', 'dec|dez'];
/* "Mar 5, 2024, 7:12:33 AM" ou "5 de mar. de 2024 07:12:33" (horário UTC) */
function csvDate(s) {
  s = String(s || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s.includes('Z') || /[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z'); return isNaN(d) ? null : d; }
  const low = normH(s);
  const mi = MONTHS.findIndex(m => new RegExp(`\\b(${m})`).test(low));
  const nums = s.match(/\d+/g) || [];
  if (mi < 0 || nums.length < 3) return null;
  const year = nums.find(n => n.length === 4), day = nums.find(n => n.length <= 2);
  const time = (s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/) || []).slice(1).map(Number);
  let h = time[0] || 0;
  if (/\bpm\b/.test(low) && h < 12) h += 12;
  if (/\bam\b/.test(low) && h === 12) h = 0;
  const d = new Date(Date.UTC(+year, mi, +day, h, time[1] || 0, time[2] || 0));
  return isNaN(d) ? null : d;
}
function csvRuns(text) {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  if (rows.length < 2) return [];
  const head = rows[0].map(normH);
  const all = names => head.reduce((a, h, i) => (names.includes(h) ? [...a, i] : a), []);
  const col = (...names) => all(names)[0] ?? -1;
  const C = {
    id: col('activity id', 'id da atividade'), date: col('activity date', 'data da atividade'), name: col('activity name', 'nome da atividade'),
    type: col('activity type', 'tipo de atividade', 'tipo da atividade'), desc: col('activity description', 'descricao da atividade'),
    moving: col('moving time', 'tempo em movimento'), elapsed: col('elapsed time', 'tempo decorrido'),
    elev: col('elevation gain', 'ganho de elevacao', 'ganho de altitude'), maxHr: col('max heart rate', 'frequencia cardiaca maxima'),
    avgHr: col('average heart rate', 'frequencia cardiaca media'), cad: col('average cadence', 'cadencia media'), file: col('filename', 'nome do arquivo'),
  };
  const dist = all(['distance', 'distancia']);
  if (C.id < 0 || C.date < 0 || C.type < 0 || !dist.length) throw new Error('Não encontrei as colunas do Strava no activities.csv');
  const out = [];
  for (const r of rows.slice(1)) {
    const type = normH(r[C.type]);
    if (!/\brun\b|corrida/.test(type)) continue;
    const start = csvDate(r[C.date]);
    if (!start || !/^\d+$/.test(String(r[C.id]).trim())) continue;
    // O Strava traz duas colunas "Distance": a primeira em km, a última em metros.
    let distance = dist.length > 1 ? csvNum(r[dist.at(-1)]) : 0;
    if (!distance) distance = csvNum(r[dist[0]]) * 1000;
    const elapsed = csvNum(r[C.elapsed]), moving = csvNum(r[C.moving]) || elapsed;
    const hr = i => (i >= 0 && csvNum(r[i]) ? Math.round(csvNum(r[i])) : null);
    const cad = C.cad >= 0 ? csvNum(r[C.cad]) : 0;
    out.push({
      id: 's-' + r[C.id].trim(), source: 'strava', stravaId: +r[C.id], name: (r[C.name] || '').trim() || 'Corrida',
      type: /trilha|trail/.test(type) ? 'TrailRun' : /virtual|esteira/.test(type) ? 'VirtualRun' : 'Run',
      start: start.toISOString(), distance: Math.round(distance), movingTime: Math.round(moving), elapsedTime: Math.round(elapsed || moving),
      elevation: C.elev >= 0 ? Math.round(csvNum(r[C.elev])) : 0, avgHr: hr(C.avgHr), maxHr: hr(C.maxHr),
      cadence: cad ? Math.round(cad < 120 ? cad * 2 : cad) : null, polyline: '', race: false, notes: '',
      _file: C.file >= 0 ? (r[C.file] || '').trim() : '',
    });
  }
  return out;
}

/* ---------- Rotas (GPX, TCX, FIT) ---------- */
function gpsFromText(t) {
  const pts = [];
  let m; const gpx = /<trkpt[^>]*?\blat="([-\d.]+)"[^>]*?\blon="([-\d.]+)"|<trkpt[^>]*?\blon="([-\d.]+)"[^>]*?\blat="([-\d.]+)"/g;
  while ((m = gpx.exec(t))) pts.push(m[1] ? [+m[1], +m[2]] : [+m[4], +m[3]]);
  if (pts.length) return pts;
  const tcx = /<LatitudeDegrees>([-\d.]+)<\/LatitudeDegrees>\s*<LongitudeDegrees>([-\d.]+)<\/LongitudeDegrees>/g;
  while ((m = tcx.exec(t))) pts.push([+m[1], +m[2]]);
  return pts;
}
function gpsFromFit(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), pts = [], defs = {};
  const hs = b[0], end = Math.min(b.length, hs + v.getUint32(4, true));
  const k = 180 / 2 ** 31;
  let p = hs;
  while (p < end) {
    const h = b[p++];
    if (h & 0x80) { readData(defs[(h >> 5) & 3]); continue; }
    const lt = h & 0x0f;
    if (h & 0x40) {
      const little = b[p + 1] === 0, glob = v.getUint16(p + 2, little), n = b[p + 4];
      p += 5;
      const fields = [];
      for (let i = 0; i < n; i++, p += 3) fields.push([b[p], b[p + 1]]);
      let dev = 0;
      if (h & 0x20) { const nd = b[p++]; for (let i = 0; i < nd; i++, p += 3) dev += b[p + 1]; }
      defs[lt] = { little, glob, fields, dev };
    } else readData(defs[lt]);
  }
  function readData(d) {
    if (!d) throw new Error('FIT inválido');
    let lat = null, lon = null;
    for (const [num, size] of d.fields) {
      if (d.glob === 20 && size === 4 && (num === 0 || num === 1)) {
        const x = v.getInt32(p, d.little);
        if (x !== 0x7fffffff) num === 0 ? (lat = x * k) : (lon = x * k);
      }
      p += size;
    }
    p += d.dev;
    if (lat !== null && lon !== null) pts.push([lat, lon]);
  }
  return pts;
}
function encodePolyline(pts) {
  let out = '', pl = 0, pg = 0;
  const enc = n => { n = n < 0 ? ~(n << 1) : n << 1; let s = ''; while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; } return s + String.fromCharCode(n + 63); };
  for (const [la, lo] of pts) { const a = Math.round(la * 1e5), g = Math.round(lo * 1e5); out += enc(a - pl) + enc(g - pg); pl = a; pg = g; }
  return out;
}
async function routeFromZip(file, entries, name) {
  const e = entries.get(name);
  if (!e) return '';
  let b = await zipRead(file, e);
  if (/\.gz$/i.test(name)) b = await inflate(b, 'gzip');
  const pts = /\.fit(\.gz)?$/i.test(name) ? gpsFromFit(b) : gpsFromText(new TextDecoder().decode(b));
  if (pts.length < 2) return '';
  const step = Math.ceil(pts.length / 600);
  return encodePolyline(pts.filter((_, i) => i % step === 0 || i === pts.length - 1));
}

/* ---------- Importação ---------- */
async function importStravaFile(file) {
  if (SFILE.busy) return;
  const isZip = /\.zip$/i.test(file.name) || file.type.includes('zip');
  if (isZip && typeof DecompressionStream === 'undefined') { toast('Este navegador não abre .zip. Descompacte e escolha o activities.csv'); return; }
  SFILE.busy = true;
  toast('Lendo o arquivo do Strava…');
  try {
    let entries = null, csv;
    if (isZip) {
      entries = await zipEntries(file);
      const e = entries.get('activities.csv');
      if (!e) throw new Error('Não encontrei o activities.csv dentro do .zip');
      csv = new TextDecoder().decode(await zipRead(file, e));
    } else csv = await file.text();

    const found = csvRuns(csv);
    if (!found.length) { toast('Nenhuma corrida encontrada no arquivo'); return; }
    const have = new Map(DB.runs.filter(r => r.stravaId).map(r => [String(r.stravaId), r]));
    const deleted = new Set((DB.runsDeleted || []).map(String));
    let added = 0, routes = 0, routeErr = 0;
    for (const run of found) {
      const key = String(run.stravaId);
      if (deleted.has(key)) continue;
      let ex = have.get(key);
      const file_ = run._file; delete run._file;
      if (!ex) { DB.runs.push(run); have.set(key, run); ex = run; added++; }
      else for (const k of ['avgHr', 'maxHr', 'cadence', 'elevation']) if (!ex[k] && run[k]) ex[k] = run[k];
      if (entries && file_ && !ex.polyline) {
        try { ex.polyline = await routeFromZip(file, entries, file_); if (ex.polyline) routes++; } catch (err) { console.warn(file_, err); routeErr++; }
      }
    }
    saveDB();
    const msg = added ? `${added} ${added === 1 ? 'corrida importada' : 'corridas importadas'}` : 'Nenhuma corrida nova';
    toast(routes && !added ? `${msg} · ${routes} ${routes === 1 ? "rota adicionada" : "rotas adicionadas"}` : msg);
    if (routeErr) console.warn(`${routeErr} rotas não puderam ser lidas`);
    rerender();
  } catch (e) {
    console.error(e);
    toast(e.message || 'Não foi possível ler o arquivo');
  } finally { SFILE.busy = false; }
}

ACT.stravaFileHelp = () => {
  closeAllSheets();
  openSheet(`<h3 class="sheet-title">Importar arquivo do Strava</h3>
    <p class="muted small">Funciona sem assinatura. O Strava manda por e-mail um arquivo com todas as suas atividades; o Evolua pega só as corridas, com a rota.</p>
    <ol class="steps">
      <li>No site <a class="link" href="https://www.strava.com/account" target="_blank" rel="noopener">strava.com/account</a>, toque em <b>Baixar ou excluir sua conta</b> → <b>Começar</b>.</li>
      <li>Em <b>Baixar solicitação</b>, toque em <b>Solicitar seu arquivo</b>.</li>
      <li>Quando chegar o e-mail do Strava, baixe o <b>.zip</b> (no iPhone ele fica no app Arquivos).</li>
      <li>Escolha o .zip abaixo. Também dá para escolher só o <code>activities.csv</code> (sem as rotas).</li>
    </ol>
    <p class="muted small">Pode importar de novo quando quiser: corridas que já estão no app não são duplicadas.</p>
    <label class="btn btn-strava btn-lg btn-block">${ic('upload')}Escolher arquivo<input type="file" accept=".zip,.csv,application/zip,text/csv" data-bind="stravaFile" hidden></label>`, { cls: 'tall' });
};
BIND.stravaFile = el => {
  const file = el.files[0]; el.value = '';
  if (!file) return;
  closeAllSheets();
  importStravaFile(file);
};
