'use strict';
/* Goals — canonical ViewEngine usage (see js/pages/tasks.js). Progress for
   each goal comes from Store.link.goalProgress(goal), which already knows
   how to read the three metric types (milestone/numeric/tasks). */
(function () {
  const D = Store.date;
  const STATUS_OPTS = [
    { value: 'active', label: 'Active' },
    { value: 'done', label: 'Done' }
  ];

  function goalModal(main, id) {
    const g = id ? Store.get('goals', id) : null;
    const areas = Store.list('areas'), projects = Store.list('projects');
    const metric = (g && g.metric) || 'milestone';

    const body = `
      <label class="fld"><span>Name</span>
        <input type="text" id="fName" value="${UI.esc(g ? g.name : '')}" placeholder="Run a half marathon" autofocus></label>
      <label class="fld"><span>Description</span>
        <textarea id="fDesc" style="min-height:70px">${UI.esc(g ? g.description : '')}</textarea></label>
      <div class="grid2f">
        <label class="fld"><span>Area</span><select id="fArea">${UI.optionsHtml(areas, g ? g.areaId : null, { noneLabel: 'No area' })}</select></label>
        <label class="fld"><span>Project</span><select id="fProject">${UI.optionsHtml(projects, g ? g.projectId : null, { noneLabel: 'No project' })}</select></label>
      </div>
      <div class="grid2f">
        <label class="fld"><span>Target date</span><input type="date" id="fDate" value="${g && g.targetDate ? g.targetDate : ''}"></label>
        <label class="fld"><span>Status</span><select id="fStatus">
          ${STATUS_OPTS.map(s => `<option value="${s.value}" ${(g ? g.status : 'active') === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select></label>
      </div>
      <label class="fld"><span>How is progress measured?</span><select id="fMetric">
        <option value="milestone" ${metric === 'milestone' ? 'selected' : ''}>Milestone (done / not done)</option>
        <option value="numeric" ${metric === 'numeric' ? 'selected' : ''}>Numeric (current / target)</option>
        <option value="tasks" ${metric === 'tasks' ? 'selected' : ''}>Linked tasks</option>
      </select></label>
      <div class="grid2f ${metric === 'numeric' ? '' : 'hidden'}" id="wrapNumeric">
        <label class="fld"><span>Current value</span><input type="number" id="fCurrent" value="${g && g.currentValue != null ? g.currentValue : ''}"></label>
        <label class="fld"><span>Target value</span><input type="number" id="fTarget" value="${g && g.targetValue != null ? g.targetValue : ''}"></label>
      </div>
      <div class="fld ${metric === 'tasks' ? '' : 'hidden'}" id="wrapTasksHint">
        <span class="sub" style="margin:0">Progress comes from tasks linked to this goal via their Goal field on the Tasks page.</span>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        ${g ? `<button class="btn danger" id="gDel">Delete</button>` : '<span></span>'}
        <button class="btn primary" id="gSave">${g ? 'Save changes' : 'Add goal'}</button>
      </div>`;

    const m = UI.modal(g ? 'Edit goal' : 'New goal', body);
    const q = sel => m.root.querySelector(sel);

    q('#fMetric').onchange = () => {
      const v = q('#fMetric').value;
      q('#wrapNumeric').classList.toggle('hidden', v !== 'numeric');
      q('#wrapTasksHint').classList.toggle('hidden', v !== 'tasks');
    };

    if (g) {
      q('#gDel').onclick = async () => {
        if (!(await UI.confirm(`Delete "${g.name}"?`))) return;
        Store.remove('goals', g.id); m.close(); render(main);
      };
    }
    q('#gSave').onclick = () => {
      const name = q('#fName').value.trim();
      if (!name) { q('#fName').focus(); return; }
      const patch = {
        name, description: q('#fDesc').value,
        areaId: q('#fArea').value || null, projectId: q('#fProject').value || null,
        targetDate: q('#fDate').value || null, status: q('#fStatus').value,
        metric: q('#fMetric').value,
        currentValue: q('#fCurrent').value === '' ? null : Number(q('#fCurrent').value),
        targetValue: q('#fTarget').value === '' ? null : Number(q('#fTarget').value)
      };
      if (g) Store.update('goals', g.id, patch); else Store.add('goals', patch);
      m.close(); render(main);
    };
  }

  function renderList(main) {
    const container = main.querySelector('#goalView');
    const areas = Store.list('areas'), projects = Store.list('projects');
    const items = Store.list('goals');
    ViewEngine.render(container, {
      key: 'goals:all',
      collection: 'goals',
      items,
      views: ['list', 'board', 'table'],
      statusField: 'status', statusOptions: STATUS_OPTS, doneValue: 'done',
      dateField: 'targetDate',
      filters: [
        { key: 'areaId', label: 'Area', options: areas.map(a => ({ value: a.id, label: a.name })) },
        { key: 'projectId', label: 'Project', options: projects.map(p => ({ value: p.id, label: p.name })) }
      ],
      sorts: [
        { key: 'due', label: 'Target date', cmp: (a, b) => (a.targetDate || '9999') < (b.targetDate || '9999') ? -1 : 1 },
        { key: 'updated', label: 'Recently updated', cmp: (a, b) => b.updatedAt - a.updatedAt }
      ],
      columns: [
        { key: 'name', label: 'Goal', render: it => `${it.status === 'done' ? '<s style="color:var(--faint)">' + UI.esc(it.name) + '</s>' : UI.esc(it.name)}` },
        { key: 'project', label: 'Project', render: it => UI.projectBadge(it.projectId) || UI.areaBadge(it.areaId) || '—' },
        { key: 'progress', label: 'Progress', render: it => { const p = Store.link.goalProgress(it); return `<div class="progressbar" style="width:90px"><i style="width:${p.pct}%"></i></div>`; } },
        { key: 'due', label: 'Target', render: it => UI.dueBadge(it.targetDate) || '—' },
        { key: 'status', label: 'Status', render: it => `<span class="pill ${it.status === 'done' ? 'good' : ''}">${it.status}</span>` }
      ],
      renderCard(it) {
        const p = Store.link.goalProgress(it);
        return `<div style="font-weight:540;font-size:13.5px;${it.status === 'done' ? 'color:var(--faint);text-decoration:line-through' : ''}">${UI.esc(it.name)}</div>
          <div class="row tight" style="margin-top:6px">${UI.areaBadge(it.areaId)}${UI.projectBadge(it.projectId)}${UI.dueBadge(it.targetDate)}</div>
          <div class="row tight" style="margin-top:8px;align-items:center;gap:8px">
            <div class="progressbar" style="flex:1"><i style="width:${p.pct}%"></i></div>
            <span class="sub" style="margin:0;white-space:nowrap">${UI.esc(p.label)}</span>
          </div>`;
      },
      emptyLabel: 'No goals match — try New goal or clear your filters.',
      onOpen: it => goalModal(main, it.id)
    });
  }

  function render(main) {
    const open = Store.list('goals').filter(g => g.status !== 'done').length;
    main.innerHTML = `
      <div class="page-head">
        <div><h1>Goals</h1><div class="sub">${open} active</div></div>
        <button class="btn primary" id="newGoal">${UI.icon('plus')} New goal</button>
      </div>
      <section class="card"><div id="goalView"></div></section>`;
    main.querySelector('#newGoal').onclick = () => goalModal(main, null);
    renderList(main);
  }

  window.Pages.goals = { render };
})();
