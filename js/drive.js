'use strict';
/* Sincronização pelo Google Drive (celular, computador…).
   Login pelo Google no próprio navegador (sem servidor): o token vale ~1 h. Cada aparelho baixa o
   arquivo "evolua-backup.json", junta com o que tem (por id; exclusões registradas em DB.deleted) e
   envia de volta. O Drive guarda as versões anteriores. O treino em andamento e o estado da tela não
   são sincronizados. A configuração (Client ID e token) fica só neste aparelho, fora do backup. */

const DRIVE_KEY = 'evolua.drive';
const DRIVE_FILE = 'evolua-backup.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE = { busy: false };

function driveCfg() { try { return JSON.parse(localStorage.getItem(DRIVE_KEY)) || {}; } catch (e) { return {}; } }
function saveDrive(c) { try { localStorage.setItem(DRIVE_KEY, JSON.stringify(c)); } catch (e) { } }
const driveConnected = () => !!driveCfg().connected;
const driveTokenOk = () => { const c = driveCfg(); return !!c.accessToken && Date.now() < (c.expiresAt || 0) - 60e3; };
const driveRedirectUri = () => location.origin + location.pathname;
// Há alterações desde o último envio? (saveDB grava evolua.changed)
function driveDirty() {
  const c = driveCfg();
  let changed = 0; try { changed = +localStorage.getItem('evolua.changed') || 0; } catch (e) { }
  return !c.lastSync || changed > new Date(c.lastSync).getTime();
}

/* Vai ao Google e volta com o token no endereço (#access_token=…). silent = sem tela, se já autorizado. */
function driveAuthorize({ silent = false, then = '' } = {}) {
  const c = driveCfg();
  if (!c.clientId) return ACT.driveSetup();
  c.returnTo = location.hash || '#/'; c.then = then; saveDrive(c);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const q = { client_id: c.clientId, redirect_uri: driveRedirectUri(), response_type: 'token', scope: DRIVE_SCOPE, include_granted_scopes: 'true', state: 'evolua-drive' };
  if (silent) q.prompt = 'none';
  if (c.email) q.login_hint = c.email;
  u.search = new URLSearchParams(q);
  location.href = u.toString();
}

/* Chamado antes do roteamento: trata a volta do Google. */
function driveHandleRedirect() {
  const h = location.hash;
  if (!h.includes('state=evolua-drive')) return;
  const q = new URLSearchParams(h.slice(1));
  const c = driveCfg();
  history.replaceState(null, '', location.pathname + (c.returnTo || '#/'));
  const then = c.then; delete c.returnTo; delete c.then;
  if (q.get('access_token')) {
    Object.assign(c, { accessToken: q.get('access_token'), expiresAt: Date.now() + (+q.get('expires_in') || 3600) * 1000, connected: true });
    saveDrive(c);
    setTimeout(() => { if (then === 'restore') driveRestore(); else driveSync({ force: true }); }, 300);
  } else {
    saveDrive(c);
    const err = q.get('error');
    // Sem sessão do Google ou autorização pendente: pede para entrar de novo, com a tela do Google.
    setTimeout(() => toast(err === 'access_denied' ? 'Acesso ao Google Drive não autorizado' : 'Entre de novo na sua conta Google para o backup no Drive'), 300);
    if (err && err !== 'access_denied') { c.needsLogin = true; saveDrive(c); }
  }
}

async function driveFetch(url, opts = {}) {
  const c = driveCfg();
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + c.accessToken, ...(opts.headers || {}) } });
  if (r.status === 401) { c.accessToken = ''; saveDrive(c); throw new Error('auth'); }
  if (!r.ok) throw new Error('Drive respondeu ' + r.status);
  return r;
}

async function driveFindFile() {
  const c = driveCfg();
  if (c.fileId) {
    try { return await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${c.fileId}?fields=id,modifiedTime,trashed`)).json().then(f => f.trashed ? null : f); }
    catch (e) { if (e.message === 'auth') throw e; }
  }
  const q = encodeURIComponent(`name='${DRIVE_FILE}' and trashed=false`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`);
  return (await r.json()).files?.[0] || null;
}

function backupJson() {
  return JSON.stringify({ app: 'evolua', version: 1, exportedAt: new Date().toISOString(), data: DB });
}

async function driveUpload(fileId) {
  const body = backupJson();
  if (fileId) {
    try {
      const r = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return await r.json();
    } catch (e) { if (e.message === 'auth') throw e; }
  }
  const b = 'evolua' + Date.now();
  const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: DRIVE_FILE, mimeType: 'application/json' })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multipart });
  return await r.json();
}

/* Junta os dados de dois aparelhos. Mesmo item nos dois: vale o do aparelho salvo por último.
   Itens excluídos em qualquer um dos lados (DB.deleted) somem. */
function mergeDB(local, remote) {
  const lt = local.savedAt || '', rt = remote.savedAt || '';
  const [newer, older] = rt > lt ? [remote, local] : [local, remote];
  const out = JSON.parse(JSON.stringify(newer));
  const deleted = {};
  for (const k of new Set([...Object.keys(local.deleted || {}), ...Object.keys(remote.deleted || {})])) {
    deleted[k] = [...new Set([...(local.deleted?.[k] || []), ...(remote.deleted?.[k] || [])])];
  }
  out.deleted = deleted;
  for (const k of ['sessions', 'workouts', 'exercises', 'body', 'runs']) {
    const gone = new Set(deleted[k] || []);
    const ids = new Set((newer[k] || []).map(x => x.id));
    const extra = (older[k] || []).filter(x => !ids.has(x.id));
    out[k] = [...(newer[k] || []), ...extra].filter(x => !gone.has(x.id));
  }
  out.sessions.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  out.runsDeleted = [...new Set([...(local.runsDeleted || []), ...(remote.runsDeleted || [])])];
  out.removedBuiltins = [...new Set([...(local.removedBuiltins || []), ...(remote.removedBuiltins || [])])];
  out.savedAt = newer.savedAt;
  return out;
}

// Troca os dados por outros, mantendo o que é só deste aparelho (treino em andamento e tela).
function adoptDB(data) {
  const keep = { active: DB.active, ui: DB.ui };
  DB = migrate({ ...data, ...keep });
  saveDB();
  applyTheme();
}

/* Sincroniza: baixa o que mudou no Drive, junta com o local e envia se preciso.
   Sem token válido: interactive = vai ao Google buscar (sem tela, se já autorizado). */
async function driveSync({ force = false, interactive = false, quiet = false } = {}) {
  if (!driveConnected() || DRIVE.busy) return;
  if (!driveTokenOk()) { if (interactive) driveAuthorize({ silent: !driveCfg().needsLogin }); return; }
  DRIVE.busy = true; DRIVE.mute = true;
  let pulled = false;
  try {
    const c = driveCfg();
    const dirty = force || driveDirty();
    const f = await driveFindFile();
    let mustUpload = dirty || !f;
    if (f && f.modifiedTime !== c.remoteMod) {
      const obj = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
      const remote = obj.data || obj;
      if (Array.isArray(remote.sessions) && Array.isArray(remote.workouts)) {
        const firstTime = !c.remoteMod;
        if ((firstTime && !DB.sessions.length) || !driveDirty()) {
          adoptDB(remote); mustUpload = false;             // aparelho novo ou sem mudanças locais: fica igual ao Drive
        } else {
          const merged = mergeDB(DB, remote);
          mustUpload = syncedJson(merged) !== syncedJson(migrate(JSON.parse(JSON.stringify(remote))));
          adoptDB(merged);
        }
        pulled = true;
      }
    }
    const c2 = driveCfg();
    c2.fileId = f?.id || c2.fileId || '';
    c2.remoteMod = f?.modifiedTime || c2.remoteMod;
    if (mustUpload) {
      const up = await driveUpload(c2.fileId);
      c2.fileId = up.id; c2.remoteMod = up.modifiedTime;
    }
    Object.assign(c2, { lastSync: new Date().toISOString(), needsLogin: false });
    saveDrive(c2);
    DB.profile.lastBackup = c2.lastSync; saveDB();
    try { localStorage.setItem('evolua.changed', String(Date.now() - 1000)); } catch (e) { }
    if (!quiet && mustUpload) toast('Backup salvo no Google Drive');
    if (pulled && !mustUpload) toast('Dados atualizados do Google Drive');
  } catch (e) {
    console.error(e);
    if (e.message === 'auth') { if (interactive) driveAuthorize({ silent: true }); }
    else if (!quiet) toast('Não foi possível sincronizar com o Drive. Tente de novo mais tarde.');
  } finally {
    DRIVE.busy = false; DRIVE.mute = false;
    driveRefreshScreen(pulled);
  }
}

// Atualiza a tela depois de sincronizar, sem atrapalhar um treino, uma edição ou uma janela aberta.
function driveRefreshScreen(pulled) {
  if (DB.active || $('#sheets .sheet-wrap') || parseHash().name === 'editar') return;
  if (pulled || parseHash().name === '' || parseHash().name === 'preferencias') rerender();
}

// Depois de cada alteração salva, envia em alguns segundos (se o login ainda vale).
let _driveTimer = null;
function driveOnSave() {
  if (DRIVE.mute || !driveConnected()) return;
  clearTimeout(_driveTimer);
  _driveTimer = setTimeout(() => driveSync({ quiet: true }), 4000);
}

// Ao abrir o app: busca o que mudou nos outros aparelhos. Login vencido → passa rapidinho pelo Google
// (no máximo a cada 10 min, e nunca durante um treino).
function driveOnOpen() {
  if (!driveConnected()) return;
  const c = driveCfg();
  if (driveTokenOk()) return driveSync({ quiet: true });
  if (c.needsLogin || DB.active || Date.now() - (c.lastAuto || 0) < 10 * 60e3) return;
  c.lastAuto = Date.now(); saveDrive(c);
  driveAuthorize({ silent: true });
}

async function driveRestore() {
  if (!driveTokenOk()) return driveAuthorize({ then: 'restore' });
  try {
    const f = await driveFindFile();
    if (!f) return toast('Nenhum backup encontrado no seu Drive');
    const obj = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
    const c = driveCfg(); c.fileId = f.id; c.remoteMod = f.modifiedTime; saveDrive(c);
    await importBackupData(obj, `do Drive (salvo em ${fmtDate(f.modifiedTime)} às ${fmtTime(f.modifiedTime)})`);
  } catch (e) { console.error(e); toast(e.message === 'auth' ? 'Entre de novo na sua conta Google' : 'Não foi possível ler o backup do Drive'); }
}

/* ---------- telas ---------- */
ACT.driveSetup = () => {
  closeAllSheets();
  const c = driveCfg();
  if (c.connected) {
    openSheet(`<h3 class="sheet-title">Backup no Google Drive</h3>
      <p class="muted">Seus dados ficam sincronizados pelo arquivo <b>${DRIVE_FILE}</b> no seu Drive: o que você registra no celular aparece no computador e vice-versa. O Drive guarda as versões anteriores.</p>
      <p class="muted small">${c.lastSync ? `Última sincronização: ${fmtDate(c.lastSync)} às ${fmtTime(c.lastSync)}.` : 'Ainda não sincronizado.'}</p>
      <div class="field"><span>Para conectar outro aparelho, use este ID do cliente</span><div class="copy-row"><code id="gdCopy">${esc(c.clientId || '')}</code><button class="btn btn-soft btn-sm" data-act="driveCopyId">${ic('copy')}Copiar</button></div></div>
      <div class="btn-col">
        <button class="btn btn-primary" data-act="driveNow">${ic('refresh')}Sincronizar agora</button>
        <button class="btn btn-ghost" data-act="driveRestoreBtn">${ic('download')}Restaurar do Drive</button>
        <button class="btn btn-text danger" data-act="driveOff">Desconectar</button>
      </div>`);
    return;
  }
  const origin = location.origin, redir = driveRedirectUri();
  openSheet(`<h3 class="sheet-title">Backup automático no Google Drive</h3>
    <p class="muted small"><b>Já conectou em outro aparelho?</b> Copie o ID do cliente de lá (Preferências → Backup no Google Drive), cole abaixo e toque em Conectar. Os dados do Drive vêm para este aparelho.</p>
    <p class="muted small">Primeira vez: o Google exige que você crie um acesso na sua conta. É grátis e só precisa ser feito uma vez (uns 10 minutos, de preferência no computador).</p>
    <ol class="steps">
      <li>Abra <a class="link" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> e crie um projeto chamado <b>Evolua</b>.</li>
      <li>Em <a class="link" href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a>, toque em <b>Ativar</b>.</li>
      <li>Em <a class="link" href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a>, toque em <b>Começar</b>: nome do app <b>Evolua</b>, seu e-mail, público <b>Externo</b>. Depois, em <b>Público-alvo</b>, adicione seu e-mail em <b>Usuários de teste</b>.</li>
      <li>Em <a class="link" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Clientes</a>, crie um cliente do tipo <b>Aplicativo da Web</b> com:<br>
        <b>Origens JavaScript autorizadas</b>: <code>${esc(origin)}</code><br>
        <b>URIs de redirecionamento autorizados</b>: <code>${esc(redir)}</code></li>
      <li>Copie o <b>ID do cliente</b> (termina em <code>.apps.googleusercontent.com</code>) e cole abaixo.</li>
    </ol>
    <label class="field"><span>ID do cliente</span><input id="gdId" value="${esc(c.clientId || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <p class="muted small">O app só enxerga os arquivos que ele mesmo cria no seu Drive. O ID fica salvo só neste aparelho.</p>
    <button class="btn btn-primary btn-lg btn-block" data-act="driveGo">Conectar com Google</button>`, { cls: 'tall' });
};
ACT.driveGo = () => {
  const id = $('#gdId').value.trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) return toast('O ID do cliente termina em .apps.googleusercontent.com');
  saveDrive({ ...driveCfg(), clientId: id });
  driveAuthorize();
};
ACT.driveCopyId = () => {
  const id = driveCfg().clientId || '';
  navigator.clipboard?.writeText(id).then(() => toast('ID copiado')).catch(() => toast(id));
};
ACT.driveNow = () => { closeAllSheets(); driveSync({ force: true, interactive: true }); };
ACT.driveRestoreBtn = () => { closeAllSheets(); driveRestore(); };
ACT.driveOff = async () => {
  closeAllSheets();
  if (!await confirmSheet({ title: 'Desconectar o Google Drive?', text: 'O backup que já está no Drive continua lá. O app para de atualizá-lo.', ok: 'Desconectar', danger: true })) return;
  const c = driveCfg();
  try { if (c.accessToken) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(c.accessToken), { method: 'POST' }); } catch (e) { }
  saveDrive({ clientId: c.clientId });
  toast('Google Drive desconectado'); rerender();
};
