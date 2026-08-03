'use strict';
/* Projects — canonical ViewEngine usage for a status-driven collection.
   See js/pages/tasks.js for the reference pattern this follows. */
(function () {
  const STATUS_OPTS = [
    { value: 'active', label: 'Active' },
    { value: 'onhold', label: 'On hold' },
    { value: 'done', label: 'Done' }
  ];
  const STATUS_LABEL = {};
  STATUS_OPTS.forEach(s => { STATUS_LABEL[s.value] = s.label; });

  function projectModal(main, id) {
    const p = id ? Store.get('projects', id) : null;
    const areas = Store.list('areas');

    const body = `
      <label class="fld"><span>Name</span>
        <input type="text" id="fName" value="${UI.esc(p ? p.name : '')}" placeholder="Redesign the website" autofocus></label>
      <div class="grid2f">
        <label class="fld"><span>Area</span><select id="fArea">${UI.optionsHtml(areas, p ? p.areaId : null, { noneLabel: 'No area' })}</select></label>
        <label class="fld"><span>Status</span><select id="fStatus">
          ${STATUS_OPTS.map(s => `<option value="${s.value}" ${(p ? p.status : 'active') === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select></label>
      </div>
      <label class="fld"><span>Due date</span><input type="date" id="fDue" value="${p && p.dueDate ? p.dueDate : ''}"></label>
      <label class="fld"><span>Description</span><textarea id="fDesc" style="min-height:90px">${UI.esc(p ? p.description : '')}</textarea></label>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        <div class="row tight">
          ${p ? `<button class="btn danger" id="pDel">Delete</button>` : ''}
          ${p ? `<button class="btn ghost" id="pArchive">${p.archived ? 'Restore' : 'Archive'}</button>` : ''}
        </div>
        <button class="btn primary" id="pSave">${p ? 'Save changes' : 'Add project'}</button>
      </div>`;

    const m = UI.modal(p ? 'Edit project' : 'New project', body);
    const q = sel => m.root.querySelector(sel);

    if (p) {
      q('#pDel').onclick = async () => {
        if (!(await UI.confirm(`Delete "${p.name}"?`))) return;
        Store.remove('projects', p.id); m.close(); render(main);
      };
      q('#pArchive').onclick = () => {
        if (p.archived) Store.restore('projects', p.id); else Store.archive('projects', p.id);
        m.close(); render(main);
      };
    }
    q('#pSave').onclick = () => {
      const name = q('#fName').value.trim();
      if (!name) { q('#fName').focus(); return; }
      const patch = {
        name,
        areaId: q('#fArea').value || null,
        status: q('#fStatus').value,
        dueDate: q('#fDue').value || null,
        description: q('#fDesc').value
      };
      if (p) Store.update('projects', p.id, patch); else Store.add('projects', patch);
      m.close(); render(main);
    };
  }

  function renderList(main) {
    const container = main.querySelector('#projectView');
    const areas = Store.list('areas');
    const items = Store.list('projects');
    ViewEngine.render(container, {
      key: 'projects:all',
      collection: 'projects',
      items,
      views: ['list', 'board', 'table'],
      statusField: 'status', statusOptions: STATUS_OPTS, doneValue: 'done',
      filters: [
        { key: 'areaId', label: 'Area', options: areas.map(a => ({ value: a.id, label: a.name })) }
      ],
      sorts: [
        { key: 'due', label: 'Due date', cmp: (a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1 },
        { key: 'updated', label: 'Recently updated', cmp: (a, b) => b.updatedAt - a.updatedAt },
        { key: 'name', label: 'Name', cmp: (a, b) => (a.name || '').localeCompare(b.name || '') }
      ],
      columns: [
        { key: 'name', label: 'Name', render: it => UI.esc(it.name) },
        { key: 'area', label: 'Area', render: it => UI.areaBadge(it.areaId) || '—' },
        { key: 'progress', label: 'Progress', render: it => { const pr = Store.link.projectProgress(it.id); return `${pr.done}/${pr.total}`; } },
        { key: 'due', label: 'Due', render: it => UI.dueBadge(it.dueDate) || '—' },
        { key: 'status', label: 'Status', render: it => `<span class="pill ${it.status === 'done' ? 'good' : ''}">${STATUS_LABEL[it.status] || it.status}</span>` }
      ],
      renderCard(it) {
        const prog = Store.link.projectProgress(it.id);
        return `<div style="font-weight:540;font-size:13.5px">${UI.esc(it.name)}</div>
          <div class="row tight" style="margin-top:6px">${UI.areaBadge(it.areaId)}${UI.dueBadge(it.dueDate)}</div>
          <div class="row" style="align-items:center;gap:8px;margin-top:8px">
            <div class="progressbar" style="flex:1"><i style="width:${prog.pct}%"></i></div>
            <span class="sub" style="margin:0;white-space:nowrap">${prog.done}/${prog.total}</span>
          </div>`;
      },
      emptyLabel: 'No projects match — try New project or clear your filters.',
      onOpen: it => projectModal(main, it.id)
    });
  }

  function render(main) {
    const active = Store.list('projects').filter(p => p.status !== 'done').length;
    main.innerHTML = `
      <div class="page-head">
        <div><h1>Projects</h1><div class="sub">${active} active</div></div>
        <button class="btn primary" id="newProject">${UI.icon('plus')} New project</button>
      </div>
      <section class="card"><div id="projectView"></div></section>`;
    main.querySelector('#newProject').onclick = () => projectModal(main, null);
    renderList(main);
  }

  window.Pages.projects = { render };
})();
