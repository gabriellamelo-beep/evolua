'use strict';
/* Ícones, toasts, folhas (bottom sheets) e confirmações. */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  dumbbell: '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
  body: '<circle cx="12" cy="4.5" r="2"/><path d="M5 8.5l7 1 7-1M12 9.5v5.5M8.5 21l3.5-6 3.5 6"/>',
  chart: '<path d="M3 20h18M6.5 16v-5M11.5 16V6M16.5 16v-8"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></g>',
  play: '<path d="M7 5v14l12-7z" fill="currentColor"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  note: '<path d="M5 4h14v16H5zM9 9h6M9 13h6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
  pie: '<path d="M12 3v9h9A9 9 0 1 1 12 3z"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 14v4M8 21h8"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400);
}

function openSheet(html, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet ${opts.cls || ''}" role="dialog" aria-modal="true"><div class="sheet-grip" data-close></div><div class="sheet-body">${html}</div></div>`;
  $('#sheets').appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(wrap); });
  wrap._onClose = opts.onClose;
  return wrap;
}
function setSheet(wrap, html) { $('.sheet-body', wrap).innerHTML = html; }
function closeSheet(wrap) {
  wrap = wrap || $$('#sheets .sheet-wrap').pop();
  if (!wrap || wrap._closing) return;
  wrap._closing = true;
  wrap.classList.remove('open');
  setTimeout(() => wrap.remove(), 240);
  if (wrap._onClose) wrap._onClose();
}
function closeAllSheets() { $$('#sheets .sheet-wrap').forEach(w => closeSheet(w)); }

function confirmSheet({ title, text = '', ok = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise(res => {
    let done = false;
    const w = openSheet(`<h3 class="sheet-title">${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <div class="sheet-actions"><button class="btn btn-ghost" data-r="0">${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(ok)}</button></div>`,
      { onClose: () => { if (!done) { done = true; res(false); } } });
    w.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) { done = true; res(b.dataset.r === '1'); closeSheet(w); }
    });
  });
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function vibrate(p) { if (DB.profile.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { } }

const seg = (act, options, value, extra = '') => `<div class="seg" role="tablist">${options.map(([v, l]) => `<button class="${String(v) === String(value) ? 'on' : ''}" data-act="${act}" data-v="${v}" ${extra}>${l}</button>`).join('')}</div>`;
const emptyState = (icon, title, text, action = '') => `<div class="empty">${ic(icon)}<h3>${title}</h3><p>${text}</p>${action}</div>`;
