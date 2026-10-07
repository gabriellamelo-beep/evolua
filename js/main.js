'use strict';
/* Inicialização e delegação de eventos. */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-bind]');
  if (el && BIND[el.dataset.bind]) BIND[el.dataset.bind](el, e);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-live]');
  if (el && LIVE[el.dataset.live]) LIVE[el.dataset.live](el, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#sheets .sheet-wrap')) closeSheet();
  if (e.key === 'Enter' && e.target.matches('.set.cur input:not(.set-note)')) { e.target.blur(); }
});
window.addEventListener('hashchange', () => { closeAllSheets(); route(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

loadDB();
applyTheme();
driveHandleRedirect();
route();
if (DB.active) openRunner();
stravaHandleRedirect();
// Backup no Drive ao abrir/voltar ao app (só se o login ainda vale; sem sair da tela).
setTimeout(() => driveSync({ quiet: true }), 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') driveSync({ quiet: true }); });

if (navigator.storage?.persist) navigator.storage.persist().catch(() => { });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // Versão nova instalada: recarrega uma vez (os dados e o treino em andamento ficam salvos).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || RUNSYNC.busy) return;
    reloaded = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(err => console.warn('SW', err));
}
