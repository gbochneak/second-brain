'use strict';
(function () {
/* =========================================================================
   Second Brain — app shell (window.UI, window.App, window.Pages)
   =========================================================================
   Load order (see index.html): store.js, viewengine.js, app.js, then every
   js/pages/*.js file, then a final `App.boot()` call.

   Each page module MUST do exactly this and nothing else to index.html:
     window.Pages.<key> = { render(container) { ...build DOM into container... } };
   `container` is emptied for you before render() is called. Page modules
   read/write through Store (js/store.js) and may use ViewEngine (js/viewengine.js)
   and the UI helpers below (modals, toasts, icons, badges, option lists).

   Valid page keys (must match js/app.js NAV_GROUPS below exactly):
     dashboard, areas, projects, goals, tasks, habits, notes, ideas,
     watchlist, contacts, review, archive, data
   ========================================================================= */

const NAV_GROUPS = [
  { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'home' }] },
  { label: 'Plan', items: [
    { key: 'areas', label: 'Areas & Profile', icon: 'grid' },
    { key: 'projects', label: 'Projects', icon: 'folder' },
    { key: 'goals', label: 'Goals', icon: 'target' },
    { key: 'tasks', label: 'Tasks', icon: 'check' }
  ] },
  { label: 'Capture', items: [
    { key: 'habits', label: 'Habits & Journal', icon: 'flame' },
    { key: 'notes', label: 'Notes, Resources & Books', icon: 'book' },
    { key: 'ideas', label: 'Ideas', icon: 'bulb' }
  ] },
  { label: 'Life', items: [
    { key: 'watchlist', label: 'Watchlist', icon: 'film' },
    { key: 'contacts', label: 'Contacts', icon: 'users' }
  ] },
  { label: 'Reflect', items: [
    { key: 'review', label: 'Review Hub', icon: 'chart' },
    { key: 'archive', label: 'Archive', icon: 'archive' }
  ] }
];
const FOOT_ITEMS = [{ key: 'data', label: 'Data', icon: 'database' }];
const ALL_NAV = NAV_GROUPS.flatMap(g => g.items).concat(FOOT_ITEMS);

/* ---------- icons (feather-style inline svg, stroke=currentColor) ---------- */
const ICONS = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  check: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  flame: '<path d="M12 2c1 4-4 5-4 9a4 4 0 0 0 8 0c0-1-.5-2-1-2 .5 2-1 3-1 1 0-3 3-4 2-8z"/>',
  book: '<path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h5M8 13h8M8 17h5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11.2c.6.4 1 1 1 1.8h4c0-.8.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.3c2.4.4 4.5 2.6 4.5 5.7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 13h4"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  link: '<path d="M9 15l6-6M8 12l-3 3a3.5 3.5 0 0 0 5 5l3-3M16 12l3-3a3.5 3.5 0 0 0-5-5l-3 3"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};
function icon(name, cls) {
  return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ICONS[name] || ''}</svg>`;
}

/* ---------- shared UI helpers ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function closeModal() { document.getElementById('overlay').innerHTML = ''; }
function modal(title, bodyHtml, opts) {
  opts = opts || {};
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<div class="scrim" id="scrim"><div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="card-h"><h2>${esc(title)}</h2><button class="btn ghost sm" id="mClose">Close</button></div>
    <div class="card-b">${bodyHtml}</div>
  </div></div>`;
  const close = closeModal;
  overlay.querySelector('#mClose').onclick = close;
  overlay.querySelector('#scrim').onclick = e => { if (e.target.id === 'scrim') close(); };
  return { root: overlay, close };
}
// In-app confirmation dialog — use this instead of window.confirm(). Native
// confirm() is unreliable inside embedded/preview browser contexts (it can
// silently auto-dismiss as Cancel with no visible dialog, which makes
// destructive-action buttons look like they've stopped responding).
// Usage: if (!(await UI.confirm('Delete this?'))) return;
function confirmDialog(message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `<div class="scrim" id="scrim"><div class="modal" role="alertdialog" aria-modal="true">
      <div class="card-h"><h2>${esc(opts.title || 'Are you sure?')}</h2></div>
      <div class="card-b">
        <p class="sub" style="margin-top:0">${esc(message)}</p>
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button class="btn ghost" id="cCancel">Cancel</button>
          <button class="btn ${opts.danger === false ? 'primary' : 'danger'}" id="cOk">${esc(opts.okLabel || 'Confirm')}</button>
        </div>
      </div>
    </div></div>`;
    const finish = (result) => { overlay.innerHTML = ''; resolve(result); };
    overlay.querySelector('#cCancel').onclick = () => finish(false);
    overlay.querySelector('#cOk').onclick = () => finish(true);
    overlay.querySelector('#scrim').onclick = e => { if (e.target.id === 'scrim') finish(false); };
  });
}

// Build <option> html for a picker. items need id + (name|title|text).
function optionsHtml(items, selectedId, opts) {
  opts = opts || {};
  const none = opts.none !== false;
  let h = none ? `<option value="">${esc(opts.noneLabel || '— None —')}</option>` : '';
  h += items.map(it => `<option value="${it.id}" ${it.id === selectedId ? 'selected' : ''}>${esc(opts.label ? opts.label(it) : (it.name || it.title || it.text || 'Untitled'))}</option>`).join('');
  return h;
}
const AREA_COLORS = ['#4f46e5', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#c026d3', '#0284c7', '#65a30d'];
function areaBadge(areaId) {
  const a = areaId && Store.get('areas', areaId);
  if (!a) return '';
  const c = a.color || '#4f46e5';
  return `<span class="pill" style="background:${c}22;color:${c}">${a.emoji || '📁'} ${esc(a.name)}</span>`;
}
function projectBadge(projectId) {
  const p = projectId && Store.get('projects', projectId);
  if (!p) return '';
  return `<span class="pill accent">${icon('folder')} ${esc(p.name)}</span>`;
}
function priorityPill(p) {
  const map = { high: ['danger', '● High'], normal: ['', '● Normal'], low: ['', '● Low'] };
  const [cls, label] = map[p] || map.normal;
  return `<span class="pill ${cls}">${label}</span>`;
}
function dueBadge(dateStr) {
  if (!dateStr) return '';
  const overdue = Store.date.isOverdue(dateStr);
  const d = Store.date.parseKey(dateStr);
  return `<span class="pill ${overdue ? 'danger' : ''}">${overdue ? '⚠ ' : ''}${Store.date.shortDate(d)}</span>`;
}
function starRating(rating, max) {
  max = max || 5;
  let h = '';
  for (let i = 1; i <= max; i++) h += `<span class="star ${i <= (rating || 0) ? 'on' : ''}" data-star="${i}">★</span>`;
  return h;
}

window.UI = { icon, esc, toast, modal, closeModal, confirm: confirmDialog, optionsHtml, areaBadge, projectBadge, priorityPill, dueBadge, starRating, AREA_COLORS };
window.Pages = window.Pages || {};

/* =========================================================================
   Router + shell
   ========================================================================= */
const uiState = { view: 'dashboard' };
function go(view) {
  uiState.view = view;
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === view));
  render();
}
function render() {
  const main = document.getElementById('main');
  const page = Pages[uiState.view];
  const scroll = main.scrollTop;
  if (!page || !page.render) {
    main.innerHTML = `<div class="empty"><b>${esc(uiState.view)}</b>This page hasn't loaded yet.</div>`;
    return;
  }
  main.innerHTML = '';
  page.render(main);
  main.scrollTop = scroll;
}
function buildSidebar() {
  const nav = document.getElementById('navGroups');
  nav.innerHTML = NAV_GROUPS.map(g => `
    <div class="navgroup-label">${esc(g.label)}</div>
    ${g.items.map(it => `<button class="navbtn" data-nav="${it.key}">${icon(it.icon)} ${esc(it.label)}</button>`).join('')}
  `).join('');
  const foot = document.getElementById('navFoot');
  foot.innerHTML = `
    <button class="navbtn" id="themeBtn">${icon('theme')} <span id="themeLbl">Theme</span></button>
    ${FOOT_ITEMS.map(it => `<button class="navbtn" data-nav="${it.key}">${icon(it.icon)} ${esc(it.label)}</button>`).join('')}
  `;
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { go(b.dataset.nav); closeSidebar(); });
  document.getElementById('themeBtn').onclick = () => {
    const order = ['system', 'light', 'dark'];
    Store.state.settings.theme = order[(order.indexOf(Store.state.settings.theme) + 1) % 3];
    Store.save(); applyTheme();
  };
}
// Off-canvas sidebar for narrow viewports (see the .mobilebar/.sidebar-scrim
// rules in app.css, gated behind the same max-width breakpoint). Harmless
// no-op on desktop widths since nothing ever adds the 'sidebar-open' class
// there — the hamburger button is display:none above the breakpoint.
function openSidebar() { document.getElementById('appRoot').classList.add('sidebar-open'); }
function closeSidebar() { document.getElementById('appRoot').classList.remove('sidebar-open'); }
function wireMobileNav() {
  document.getElementById('hamburgerBtn').onclick = openSidebar;
  document.getElementById('sidebarScrim').onclick = closeSidebar;
}
function applyTheme() {
  const t = Store.state.settings.theme || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const lbl = document.getElementById('themeLbl');
  if (lbl) lbl.textContent = t === 'system' ? 'Theme: Auto' : t === 'dark' ? 'Theme: Dark' : 'Theme: Light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('overlay').innerHTML) closeModal();
  else closeSidebar();
});

function boot() {
  buildSidebar();
  wireMobileNav();
  applyTheme();
  go('dashboard');
}
window.App = { go, render, boot, applyTheme, NAV_GROUPS, ALL_NAV };
})();
