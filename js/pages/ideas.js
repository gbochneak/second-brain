'use strict';
/* Ideas Hub — quick-capture inbox for stray thoughts, with a lightweight
   List/Board over ViewEngine and a "Promote to Project" action that spins an
   idea into a real project without losing the idea itself. */
(function () {
  const STATUS_OPTS = [
    { value: 'new', label: 'New' },
    { value: 'exploring', label: 'Exploring' },
    { value: 'promoted', label: 'Promoted' }
  ];

  function ideaModal(main, id) {
    const idea = Store.get('ideas', id);
    if (!idea) return;
    const areas = Store.list('areas');

    const body = `
      <label class="fld"><span>Idea</span>
        <textarea id="fText" style="min-height:70px">${UI.esc(idea.text)}</textarea></label>
      <label class="fld"><span>Tags (comma separated)</span>
        <input type="text" id="fTags" value="${UI.esc((idea.tags || []).join(', '))}" placeholder="growth, side-project"></label>
      <div class="grid2f">
        <label class="fld"><span>Area</span><select id="fArea">${UI.optionsHtml(areas, idea.areaId, { noneLabel: 'No area' })}</select></label>
        <label class="fld"><span>Status</span><select id="fStatus">
          ${STATUS_OPTS.map(s => `<option value="${s.value}" ${idea.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select></label>
      </div>
      ${idea.status !== 'promoted'
        ? `<button type="button" class="btn primary" id="iPromote" style="width:100%;margin-bottom:14px">${UI.icon('arrowRight')} Promote to Project</button>`
        : `<div class="empty" style="padding:10px;margin-bottom:14px"><b>Already promoted</b>This idea became a project — it's still here for reference.</div>`}
      <div class="row" style="justify-content:space-between;margin-top:6px">
        <button class="btn danger" id="iDel">Delete</button>
        <button class="btn primary" id="iSave">Save changes</button>
      </div>`;

    const m = UI.modal(idea.status === 'promoted' ? 'Idea (promoted)' : 'Edit idea', body);
    const q = sel => m.root.querySelector(sel);

    const promoteBtn = q('#iPromote');
    if (promoteBtn) promoteBtn.onclick = () => {
      Store.add('projects', { name: idea.text, areaId: idea.areaId, status: 'active' });
      Store.update('ideas', idea.id, { status: 'promoted' });
      UI.toast('Promoted to a project');
      m.close();
      render(main);
    };

    q('#iDel').onclick = async () => {
      if (!(await UI.confirm('Delete this idea?'))) return;
      Store.remove('ideas', idea.id);
      m.close();
      render(main);
    };

    q('#iSave').onclick = () => {
      const text = q('#fText').value.trim();
      if (!text) { q('#fText').focus(); return; }
      Store.update('ideas', idea.id, {
        text,
        tags: q('#fTags').value.split(',').map(s => s.trim()).filter(Boolean),
        areaId: q('#fArea').value || null,
        status: q('#fStatus').value
      });
      m.close();
      render(main);
    };
  }

  function renderList(main) {
    const container = main.querySelector('#ideaView');
    const areas = Store.list('areas');
    const items = Store.list('ideas');
    ViewEngine.render(container, {
      key: 'ideas:all',
      collection: 'ideas',
      items,
      views: ['list', 'board'],
      statusField: 'status',
      statusOptions: STATUS_OPTS,
      filters: [
        { key: 'areaId', label: 'Area', options: areas.map(a => ({ value: a.id, label: a.name })) }
      ],
      renderCard(it) {
        const tags = (it.tags || []).map(tg => `<span class="tag">${UI.esc(tg)}</span>`).join('');
        return `<div style="font-weight:540;font-size:13.5px">${UI.esc(it.text)}</div>
          <div class="row tight" style="margin-top:6px">${UI.areaBadge(it.areaId)}${tags}</div>`;
      },
      emptyLabel: 'No ideas match — capture one above or clear your filters.',
      onOpen: it => ideaModal(main, it.id)
    });
  }

  function render(main) {
    const total = Store.list('ideas').length;
    main.innerHTML = `
      <div class="page-head">
        <div><h1>Ideas Hub</h1><div class="sub">${total} idea${total === 1 ? '' : 's'} captured</div></div>
        <div class="row" style="gap:8px">
          <input type="text" id="qcText" placeholder="Capture an idea…" style="min-width:240px">
          <button class="btn primary" id="qcAdd">${UI.icon('plus')} Add</button>
        </div>
      </div>
      <section class="card"><div id="ideaView"></div></section>`;

    const add = () => {
      const input = main.querySelector('#qcText');
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      Store.add('ideas', { text, tags: [], status: 'new', areaId: null });
      render(main);
    };
    main.querySelector('#qcAdd').onclick = add;
    main.querySelector('#qcText').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    main.querySelector('#qcText').focus();

    renderList(main);
  }

  window.Pages.ideas = { render };
})();
