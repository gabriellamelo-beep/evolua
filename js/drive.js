'use strict';
/* Backup automático no Google Drive.
   Login pelo Google no próprio navegador (sem servidor): o token vale ~1 h. O arquivo
   "evolua-backup.json" é atualizado no fim de cada treino e ao abrir o app; o Drive guarda as
   versões anteriores. A configuração (Client ID e token) fica só neste aparelho, fora do backup. */

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
  const q = encodeURIComponent(`name='${DRIVE_FILE}' and trashed=false`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`);
  return (await r.json()).files?.[0] || null;
}

function backupJson() {
  return JSON.stringify({ app: 'evolua', version: 1, exportedAt: new Date().toISOString(), data: DB });
}

async function driveUpload() {
  const c = driveCfg(), body = backupJson();
  if (!c.fileId) c.fileId = (await driveFindFile())?.id || '';
  if (c.fileId) {
    try {
      await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${c.fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return c.fileId;
    } catch (e) { if (e.message === 'auth') throw e; c.fileId = ''; }
  }
  const b = 'evolua' + Date.now();
  const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: DRIVE_FILE, mimeType: 'application/json' })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multipart });
  return (await r.json()).id;
}

/* Envia o backup se houver alterações (ou force). Sem token válido: interactive = vai ao Google buscar. */
async function driveSync({ force = false, interactive = false, quiet = false } = {}) {
  if (!driveConnected() || DRIVE.busy) return;
  if (!force && !driveDirty()) return;
  if (!driveTokenOk()) { if (interactive) driveAuthorize({ silent: !driveCfg().needsLogin }); return; }
  DRIVE.busy = true;
  try {
    const id = await driveUpload();
    const c = driveCfg(); Object.assign(c, { fileId: id, lastSync: new Date().toISOString(), needsLogin: false }); saveDrive(c);
    DB.profile.lastBackup = c.lastSync; saveDB();
    try { localStorage.setItem('evolua.changed', String(Date.now() - 1000)); } catch (e) { }
    if (!quiet) toast('Backup salvo no Google Drive');
  } catch (e) {
    console.error(e);
    if (e.message === 'auth') { if (interactive) driveAuthorize({ silent: true }); }
    else if (!quiet) toast('Não foi possível salvar no Drive. Tente de novo mais tarde.');
  } finally {
    DRIVE.busy = false;
    if (parseHash().name === '' || parseHash().name === 'preferencias') rerender();
  }
}

async function driveRestore() {
  if (!driveTokenOk()) return driveAuthorize({ then: 'restore' });
  try {
    const f = await driveFindFile();
    if (!f) return toast('Nenhum backup encontrado no seu Drive');
    const obj = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
    const c = driveCfg(); c.fileId = f.id; saveDrive(c);
    await importBackupData(obj, `do Drive (salvo em ${fmtDate(f.modifiedTime)} às ${fmtTime(f.modifiedTime)})`);
  } catch (e) { console.error(e); toast(e.message === 'auth' ? 'Entre de novo na sua conta Google' : 'Não foi possível ler o backup do Drive'); }
}

/* ---------- telas ---------- */
ACT.driveSetup = () => {
  closeAllSheets();
  const c = driveCfg();
  if (c.connected) {
    openSheet(`<h3 class="sheet-title">Backup no Google Drive</h3>
      <p class="muted">O arquivo <b>${DRIVE_FILE}</b> no seu Drive é atualizado sozinho no fim de cada treino e quando você abre o app. O Drive guarda as versões anteriores.</p>
      <p class="muted small">${c.lastSync ? `Último envio: ${fmtDate(c.lastSync)} às ${fmtTime(c.lastSync)}.` : 'Ainda não enviado.'}</p>
      <div class="btn-col">
        <button class="btn btn-primary" data-act="driveNow">${ic('upload')}Salvar no Drive agora</button>
        <button class="btn btn-ghost" data-act="driveRestoreBtn">${ic('download')}Restaurar do Drive</button>
        <button class="btn btn-text danger" data-act="driveOff">Desconectar</button>
      </div>`);
    return;
  }
  const origin = location.origin, redir = driveRedirectUri();
  openSheet(`<h3 class="sheet-title">Backup automático no Google Drive</h3>
    <p class="muted small">O Google exige que você crie um acesso na sua conta. É grátis e só precisa ser feito uma vez (uns 10 minutos, de preferência no computador).</p>
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
