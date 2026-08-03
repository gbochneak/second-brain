'use strict';
/* Archive — lists every archived item across collections, with per-item
   Restore / Delete forever actions. No ViewEngine needed: these are simple
   flat rows, not filterable/sortable views. */
(function () {
  const SECTIONS = [
    { collection: 'areas', label: 'Areas' },
    { collection: 'projects', label: 'Projects' },
    { collection: 'goals', label: 'Goals' },
    { collection: 'tasks', label: 'Tasks' },
    { collection: 'habits', label: 'Habits' },
    { collection: 'notes', label: 'Notes' },
    { collection: 'ideas', label: 'Ideas' },
    { collection: 'watchlist', label: 'Watchlist' },
    { collection: 'contacts', label: 'Contacts' }
  ];

  function labelFor(it) {
    return it.name || it.title || it.text || 'Untitled';
  }

  function render(container) {
    const groups = SECTIONS.map(s => ({
      collection: s.collection,
      label: s.label,
      items: Store.list(s.collection, { includeArchived: true }).filter(x => x.archived)
    })).filter(g => g.items.length);

    const totalCount = groups.reduce((n, g) => n + g.items.length, 0);

    container.innerHTML = `
      <div class="page-head">
        <div><h1>Archive</h1><div class="sub">${totalCount} archived item${totalCount === 1 ? '' : 's'}</div></div>
      </div>
      ${groups.length ? groups.map(g => `
        <section class="card" style="margin-bottom:18px">
          <div class="card-h"><h2>${UI.esc(g.label)} (${g.items.length})</h2></div>
          <div class="card-b">
            ${g.items.map(it => `
              <div class="kv" style="align-items:center">
                <span>${UI.esc(labelFor(it))}</span>
                <span class="row tight" style="flex:0 0 auto">
                  <button class="btn sm" data-act="restore" data-col="${g.collection}" data-id="${it.id}">Restore</button>
                  <button class="btn sm danger" data-act="delete" data-col="${g.collection}" data-id="${it.id}">Delete forever</button>
                </span>
              </div>`).join('')}
          </div>
        </section>`).join('') : `<div class="empty"><b>Nothing archived yet.</b>Archived items from any page will show up here.</div>`}
    `;

    container.querySelectorAll('[data-act="restore"]').forEach(b => {
      b.onclick = () => {
        Store.restore(b.dataset.col, b.dataset.id);
        render(container);
      };
    });
    container.querySelectorAll('[data-act="delete"]').forEach(b => {
      b.onclick = async () => {
        const it = Store.get(b.dataset.col, b.dataset.id);
        const name = it ? labelFor(it) : 'this item';
        if (!(await UI.confirm(`Permanently delete "${name}"? This cannot be undone.`))) return;
        Store.remove(b.dataset.col, b.dataset.id);
        render(container);
      };
    });
  }

  window.Pages.archive = { render };
})();
