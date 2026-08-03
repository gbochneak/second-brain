'use strict';
/* =========================================================================
   Second Brain — generic multi-view renderer (window.ViewEngine)
   =========================================================================
   Renders a filterable/sortable List, Board (kanban), Table, or Calendar for
   any collection, plus a toolbar with search, filters, sort, and "Save as
   Smart View" (persisted into Store.state.smartViews). This is the shared
   engine behind Projects, Goals, Tasks, Contacts and Watchlist — it covers
   "Advanced Views & Layouts", "Smart Filters", "Linked Databases" (by simply
   being fed pre-filtered, cross-referenced item lists) and, via the
   calendar view, "Weekly & Monthly Schedule" and part of "Progress Tracker".

   Usage:
     ViewEngine.render(containerEl, {
       key: 'tasks:all',          // unique per call-site; persists view/sort/
                                   // filter/calendar-month choices in localStorage
       collection: 'tasks',       // used to scope Smart Views
       items: someArray,          // already scoped by the page (e.g. one project's tasks)
       views: ['list','board','table','calendar'],  // default ['list','board','table']
       statusField: 'status',     // grouping field for board view
       statusOptions: [{value,label}],  // board columns; omitted = derived from items
       dateField: 'dueDate',      // date field for calendar view
       filters: [{key,label,options:[{value,label}], apply(item,value)?}],
       sorts: [{key,label,cmp(a,b)}],
       columns: [{key,label,render(item)->html}],  // table view columns
       renderCard(item) -> html,  // list/board card body
       doneValue: 'done',         // value of statusField considered "done" for the checkbox
       onOpen(item),              // click card/row/calendar-item
       onToggle(item),            // optional checkbox click (e.g. complete a task)
       emptyLabel: 'No items yet'
     });

   Call ViewEngine.render again (e.g. inside onOpen's modal-close callback) to
   refresh after a mutation — it is cheap, it just re-reads opts.items.
   ========================================================================= */
(function () {
  const VS_KEY = 'sb.viewstate.v1';
  let VS = {};
  try { VS = JSON.parse(localStorage.getItem(VS_KEY)) || {}; } catch (e) { VS = {}; }
  function persistVS() { try { localStorage.setItem(VS_KEY, JSON.stringify(VS)); } catch (e) {} }
  function stateFor(key, views) {
    if (!VS[key]) VS[key] = { viewType: views[0], sort: null, filters: {}, search: '', calMonth: null };
    if (views.indexOf(VS[key].viewType) === -1) VS[key].viewType = views[0];
    return VS[key];
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';

  function applyFilters(items, opts, vs) {
    let out = items;
    if (vs.search && vs.search.trim()) {
      const q = vs.search.trim().toLowerCase();
      out = out.filter(it => JSON.stringify(it).toLowerCase().includes(q));
    }
    (opts.filters || []).forEach(f => {
      const val = vs.filters[f.key];
      if (val === undefined || val === '' || val === '__all__') return;
      out = out.filter(it => f.apply ? f.apply(it, val) : it[f.key] === val);
    });
    return out;
  }
  function applySort(items, opts, vs) {
    const sorts = opts.sorts || [];
    const active = sorts.find(s => s.key === vs.sort) || sorts[0];
    if (!active) return items.slice();
    return items.slice().sort(active.cmp);
  }
  function uniqueCols(items, field) {
    const seen = new Set(), out = [];
    items.forEach(it => { const v = it[field]; if (v != null && !seen.has(v)) { seen.add(v); out.push({ value: v, label: String(v) }); } });
    return out.length ? out : [{ value: undefined, label: 'All' }];
  }

  function cardHtml(it, opts) {
    const checkable = !!opts.onToggle;
    const doneVal = opts.statusField ? it[opts.statusField] === (opts.doneValue || 'done') : false;
    return `<div class="ve-card" data-id="${it.id}">
      ${checkable ? `<button class="check sm ${doneVal ? 'done' : ''}" data-vetoggle="${it.id}">${CHECK}</button>` : ''}
      <div class="ve-card-body">${opts.renderCard(it)}</div>
    </div>`;
  }
  function wireCards(body, items, opts) {
    body.querySelectorAll('.ve-card').forEach(el => {
      el.onclick = (e) => { if (e.target.closest('[data-vetoggle]')) return; const it = items.find(x => x.id === el.dataset.id); if (opts.onOpen) opts.onOpen(it); };
    });
    body.querySelectorAll('[data-vetoggle]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); const it = items.find(x => x.id === b.dataset.vetoggle); if (opts.onToggle) opts.onToggle(it); };
    });
    body.querySelectorAll('.cal-item').forEach(el => {
      el.onclick = (e) => { e.stopPropagation(); const it = items.find(x => x.id === el.dataset.id); if (opts.onOpen) opts.onOpen(it); };
    });
  }

  function renderList(body, items, opts) {
    body.innerHTML = `<div class="ve-list">${items.map(it => cardHtml(it, opts)).join('')}</div>`;
    wireCards(body, items, opts);
  }
  function renderBoard(body, items, opts) {
    const field = opts.statusField || 'status';
    const cols = opts.statusOptions || uniqueCols(items, field);
    body.innerHTML = `<div class="board">${cols.map(c => {
      const colItems = items.filter(it => it[field] === c.value);
      return `<div class="board-col"><div class="board-col-head"><span>${esc(c.label)}</span><span class="pill">${colItems.length}</span></div>
        <div class="board-col-body">${colItems.map(it => cardHtml(it, opts)).join('') || '<div class="board-empty">—</div>'}</div></div>`;
    }).join('')}</div>`;
    wireCards(body, items, opts);
  }
  function renderTable(body, items, opts) {
    const cols = opts.columns || [{ key: 'name', label: 'Name', render: it => esc(it.name || it.text || it.title || '') }];
    body.innerHTML = `<div style="overflow-x:auto"><table class="table"><thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${items.map(it => `<tr data-id="${it.id}">${cols.map(c => `<td>${c.render(it)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    body.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { const it = items.find(x => x.id === tr.dataset.id); if (opts.onOpen) opts.onOpen(it); });
  }
  function shiftMonth(ym, delta) {
    let [y, m] = ym.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  function renderCalendar(body, items, opts, vs, refresh) {
    const D = Store.date;
    const field = opts.dateField || 'dueDate';
    if (!vs.calMonth) vs.calMonth = D.key(D.today()).slice(0, 7);
    const [y, m] = vs.calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startGrid = D.startOfWeek(first);
    const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const byDate = {};
    items.forEach(it => { const d = it[field]; if (!d) return; (byDate[d] = byDate[d] || []).push(it); });
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = D.addDays(startGrid, i);
      const k = D.key(d);
      const inMonth = d.getMonth() === m - 1;
      const dayItems = byDate[k] || [];
      cells += `<div class="cal-cell ${inMonth ? '' : 'out'} ${D.sameDay(d, D.today()) ? 'today' : ''}">
        <div class="cal-daynum">${d.getDate()}</div>
        ${dayItems.slice(0, 4).map(it => `<div class="cal-item" data-id="${it.id}">${esc((it.name || it.text || it.title || '').slice(0, 26))}</div>`).join('')}
        ${dayItems.length > 4 ? `<div class="cal-more">+${dayItems.length - 4} more</div>` : ''}
      </div>`;
    }
    body.innerHTML = `<div class="cal-head"><button class="btn sm" id="calPrev">‹</button><strong>${monthLabel}</strong><button class="btn sm" id="calNext">›</button>
        <button class="btn sm ghost" id="calToday">Today</button></div>
      <div class="cal-grid cal-dow">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div>${d}</div>`).join('')}</div>
      <div class="cal-grid">${cells}</div>`;
    body.querySelector('#calPrev').onclick = () => { vs.calMonth = shiftMonth(vs.calMonth, -1); persistVS(); refresh(); };
    body.querySelector('#calNext').onclick = () => { vs.calMonth = shiftMonth(vs.calMonth, 1); persistVS(); refresh(); };
    body.querySelector('#calToday').onclick = () => { vs.calMonth = D.key(D.today()).slice(0, 7); persistVS(); refresh(); };
    wireCards(body, items, opts);
  }

  function toolbar(container, opts, vs, refresh) {
    const views = opts.views || ['list', 'board', 'table'];
    const smartViews = (Store.state.smartViews || []).filter(v => v.collection === opts.collection);
    let html = `<div class="toolbar">`;
    html += `<div class="viewtabs">` + views.map(v => `<button class="viewtab ${vs.viewType === v ? 'on' : ''}" data-vt="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('') + `</div>`;
    html += `<input type="text" class="ve-search" placeholder="Search…" value="${esc(vs.search || '')}">`;
    (opts.filters || []).forEach(f => {
      html += `<select class="ve-filter" data-fk="${esc(f.key)}"><option value="__all__">${esc(f.label)}: All</option>` +
        f.options.map(o => `<option value="${esc(o.value)}" ${vs.filters[f.key] === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('') + `</select>`;
    });
    if (opts.sorts && opts.sorts.length) {
      html += `<select class="ve-sort">` + opts.sorts.map(s => `<option value="${esc(s.key)}" ${vs.sort === s.key ? 'selected' : ''}>Sort: ${esc(s.label)}</option>`).join('') + `</select>`;
    }
    html += `<button class="btn sm ghost" id="veSaveView">☆ Save view</button>`;
    html += `</div>`;
    if (smartViews.length) {
      html += `<div class="smartviews">${smartViews.map(v => `<span class="tag sv" data-sv="${v.id}">${esc(v.name)} <a href="#" data-svdel="${v.id}" title="Delete">×</a></span>`).join('')}</div>`;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    container.appendChild(wrap);

    wrap.querySelectorAll('[data-vt]').forEach(b => b.onclick = () => { vs.viewType = b.dataset.vt; persistVS(); refresh(); });
    const search = wrap.querySelector('.ve-search');
    let st;
    search.oninput = () => { clearTimeout(st); st = setTimeout(() => { vs.search = search.value; persistVS(); refresh(); }, 250); };
    wrap.querySelectorAll('.ve-filter').forEach(sel => sel.onchange = () => { vs.filters[sel.dataset.fk] = sel.value; persistVS(); refresh(); });
    const sortSel = wrap.querySelector('.ve-sort');
    if (sortSel) sortSel.onchange = () => { vs.sort = sortSel.value; persistVS(); refresh(); };
    wrap.querySelector('#veSaveView').onclick = () => {
      const name = prompt('Name this view:');
      if (!name) return;
      Store.add('smartViews', { collection: opts.collection, name, filters: Object.assign({}, vs.filters), search: vs.search, sort: vs.sort, viewType: vs.viewType });
      refresh();
    };
    wrap.querySelectorAll('[data-sv]').forEach(el => el.onclick = (e) => {
      if (e.target.closest('[data-svdel]')) return;
      const sv = Store.get('smartViews', el.dataset.sv); if (!sv) return;
      vs.filters = Object.assign({}, sv.filters); vs.search = sv.search || ''; vs.sort = sv.sort; vs.viewType = views.indexOf(sv.viewType) !== -1 ? sv.viewType : vs.viewType;
      persistVS(); refresh();
    });
    wrap.querySelectorAll('[data-svdel]').forEach(a => a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); Store.remove('smartViews', a.dataset.svdel); refresh(); });
  }

  function render(container, opts) {
    const views = opts.views || ['list', 'board', 'table'];
    const vs = stateFor(opts.key, views);
    container.innerHTML = '';
    const refresh = () => render(container, opts);
    toolbar(container, opts, vs, refresh);
    let items = applyFilters(opts.items || [], opts, vs);
    items = applySort(items, opts, vs);
    const body = document.createElement('div');
    body.className = 've-body';
    container.appendChild(body);
    if (!items.length) { body.innerHTML = `<div class="empty"><b>Nothing here</b>${esc(opts.emptyLabel || 'No items match.')}</div>`; return; }
    if (vs.viewType === 'board') renderBoard(body, items, opts);
    else if (vs.viewType === 'table') renderTable(body, items, opts);
    else if (vs.viewType === 'calendar') renderCalendar(body, items, opts, vs, refresh);
    else renderList(body, items, opts);
  }

  window.ViewEngine = { render };
})();
