'use strict';
/* Tasks (Advanced) — canonical ViewEngine usage. List/Board/Calendar/Table
   views double as "Weekly & Monthly Schedule" (calendar view grouped by
   dueDate) and "Advanced Views & Layouts". Reference this file when wiring
   ViewEngine.render() for Projects/Goals/Contacts/Watchlist. */
(function () {
  const D = Store.date;
  const STATUS_OPTS = [
    { value: 'todo', label: 'To do' },
    { value: 'doing', label: 'Doing' },
    { value: 'done', label: 'Done' }
  ];

  function taskModal(main, id) {
    const t = id ? Store.get('tasks', id) : null;
    const areas = Store.list('areas'), projects = Store.list('projects'), goals = Store.list('goals');
    const rec = (t && t.recurring) || null;

    const body = `
      <label class="fld"><span>What needs doing?</span>
        <input type="text" id="fText" value="${UI.esc(t ? t.text : '')}" placeholder="Ship the release notes" autofocus></label>
      <div class="grid2f">
        <label class="fld"><span>Area</span><select id="fArea">${UI.optionsHtml(areas, t ? t.areaId : null, { noneLabel: 'No area' })}</select></label>
        <label class="fld"><span>Project</span><select id="fProject">${UI.optionsHtml(projects, t ? t.projectId : null, { noneLabel: 'No project' })}</select></label>
      </div>
      <div class="grid2f">
        <label class="fld"><span>Goal</span><select id="fGoal">${UI.optionsHtml(goals, t ? t.goalId : null, { noneLabel: 'No goal' })}</select></label>
        <label class="fld"><span>Due date</span><input type="date" id="fDue" value="${t && t.dueDate ? t.dueDate : ''}"></label>
      </div>
      <div class="grid2f">
        <label class="fld"><span>Priority</span><select id="fPriority">
          ${['low', 'normal', 'high'].map(p => `<option value="${p}" ${(t ? t.priority : 'normal') === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}
        </select></label>
        <label class="fld"><span>Status</span><select id="fStatus">
          ${STATUS_OPTS.map(s => `<option value="${s.value}" ${(t ? t.status : 'todo') === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select></label>
      </div>
      <label class="fld"><span>Tags (comma separated)</span>
        <input type="text" id="fTags" value="${UI.esc(t && t.tags ? t.tags.join(', ') : '')}" placeholder="admin, urgent"></label>
      <label class="fld"><span>Notes</span><textarea id="fNotes" style="min-height:70px">${UI.esc(t ? t.notes : '')}</textarea></label>
      <label class="fld"><span>Repeats</span><select id="fRecur">
        <option value="">Doesn't repeat</option>
        <option value="daily" ${rec && rec.type === 'daily' ? 'selected' : ''}>Daily</option>
        <option value="weekly" ${rec && rec.type === 'weekly' ? 'selected' : ''}>Weekly</option>
        <option value="weekdays" ${rec && rec.type === 'weekdays' ? 'selected' : ''}>Specific weekdays</option>
      </select></label>
      <div class="fld ${rec && rec.type === 'weekdays' ? '' : 'hidden'}" id="wrapRecurDays">
        <div class="daypick">${[1, 2, 3, 4, 5, 6, 0].map(i => `<button type="button" data-rd="${i}" class="${rec && rec.days && rec.days.includes(i) ? 'on' : ''}">${D.DAYS[i][0]}${D.DAYS[i][1]}</button>`).join('')}</div>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        ${t ? `<button class="btn danger" id="tDel">Delete</button>` : '<span></span>'}
        <button class="btn primary" id="tSave">${t ? 'Save changes' : 'Add task'}</button>
      </div>`;

    const m = UI.modal(t ? 'Edit task' : 'New task', body);
    const q = sel => m.root.querySelector(sel);
    const recurDays = new Set(rec && rec.days ? rec.days : []);
    q('#fRecur').onchange = () => q('#wrapRecurDays').classList.toggle('hidden', q('#fRecur').value !== 'weekdays');
    q('#wrapRecurDays').querySelectorAll('[data-rd]').forEach(b => b.onclick = () => {
      const i = +b.dataset.rd;
      if (recurDays.has(i)) recurDays.delete(i); else recurDays.add(i);
      b.classList.toggle('on');
    });
    if (t) q('#tDel').onclick = async () => {
      if (!(await UI.confirm(`Delete "${t.text}"?`))) return;
      Store.remove('tasks', t.id); m.close(); render(main);
    };
    q('#tSave').onclick = () => {
      const text = q('#fText').value.trim();
      if (!text) { q('#fText').focus(); return; }
      const recurType = q('#fRecur').value;
      const recurring = recurType ? (recurType === 'weekdays' ? { type: 'weekdays', days: [...recurDays].sort() } : { type: recurType }) : null;
      const patch = {
        text, notes: q('#fNotes').value,
        areaId: q('#fArea').value || null, projectId: q('#fProject').value || null, goalId: q('#fGoal').value || null,
        dueDate: q('#fDue').value || null, priority: q('#fPriority').value, status: q('#fStatus').value,
        tags: q('#fTags').value.split(',').map(s => s.trim()).filter(Boolean),
        recurring, completedAt: q('#fStatus').value === 'done' ? (t && t.completedAt) || Date.now() : null
      };
      if (t) Store.update('tasks', t.id, patch); else Store.add('tasks', patch);
      m.close(); render(main);
    };
  }

  function renderList(main) {
    const container = main.querySelector('#taskView');
    const areas = Store.list('areas'), projects = Store.list('projects');
    const items = Store.list('tasks');
    ViewEngine.render(container, {
      key: 'tasks:all',
      collection: 'tasks',
      items,
      views: ['list', 'board', 'calendar', 'table'],
      statusField: 'status', statusOptions: STATUS_OPTS, doneValue: 'done',
      dateField: 'dueDate',
      filters: [
        { key: 'areaId', label: 'Area', options: areas.map(a => ({ value: a.id, label: a.name })) },
        { key: 'projectId', label: 'Project', options: projects.map(p => ({ value: p.id, label: p.name })) },
        { key: 'priority', label: 'Priority', options: [{ value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }] }
      ],
      sorts: [
        { key: 'due', label: 'Due date', cmp: (a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1 },
        { key: 'priority', label: 'Priority', cmp: (a, b) => ({ high: 0, normal: 1, low: 2 }[a.priority] || 1) - ({ high: 0, normal: 1, low: 2 }[b.priority] || 1) },
        { key: 'created', label: 'Newest', cmp: (a, b) => b.createdAt - a.createdAt }
      ],
      columns: [
        { key: 'text', label: 'Task', render: it => `${it.status === 'done' ? '<s style="color:var(--faint)">' + UI.esc(it.text) + '</s>' : UI.esc(it.text)}` },
        { key: 'project', label: 'Project', render: it => UI.projectBadge(it.projectId) || UI.areaBadge(it.areaId) || '—' },
        { key: 'due', label: 'Due', render: it => UI.dueBadge(it.dueDate) || '—' },
        { key: 'priority', label: 'Priority', render: it => UI.priorityPill(it.priority) },
        { key: 'status', label: 'Status', render: it => `<span class="pill ${it.status === 'done' ? 'good' : ''}">${it.status}</span>` }
      ],
      renderCard(it) {
        return `<div style="font-weight:540;font-size:13.5px;${it.status === 'done' ? 'color:var(--faint);text-decoration:line-through' : ''}">${UI.esc(it.text)}</div>
          <div class="row tight" style="margin-top:6px">${UI.areaBadge(it.areaId)}${UI.projectBadge(it.projectId)}${UI.dueBadge(it.dueDate)}${UI.priorityPill(it.priority)}${it.recurring ? '<span class="pill">🔁</span>' : ''}</div>`;
      },
      emptyLabel: 'No tasks match — try New task or clear your filters.',
      onOpen: it => taskModal(main, it.id),
      onToggle: it => { Store.taskEngine.completeTask(it.id); render(main); }
    });
  }

  function render(main) {
    const open = Store.list('tasks').filter(t => t.status !== 'done').length;
    main.innerHTML = `
      <div class="page-head">
        <div><h1>Tasks</h1><div class="sub">${open} open · switch views for a weekly or monthly schedule</div></div>
        <button class="btn primary" id="newTask">${UI.icon('plus')} New task</button>
      </div>
      <section class="card"><div id="taskView"></div></section>`;
    main.querySelector('#newTask').onclick = () => taskModal(main, null);
    renderList(main);
  }

  window.Pages.tasks = { render };
})();
