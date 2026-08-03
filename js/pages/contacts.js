'use strict';
/* Contacts — ViewEngine usage (list/table only; relation is free text and
   doesn't group well as a board). Modeled on js/pages/tasks.js. */
(function () {
  function contactModal(main, id) {
    const c = id ? Store.get('contacts', id) : null;
    const areas = Store.list('areas');

    const body = `
      <label class="fld"><span>Name</span>
        <input type="text" id="fName" value="${UI.esc(c ? c.name : '')}" placeholder="Jane Doe" autofocus></label>
      <div class="grid2f">
        <label class="fld"><span>Relation</span>
          <input type="text" id="fRelation" value="${UI.esc(c ? c.relation : '')}" placeholder="Friend, coworker, sister…"></label>
        <label class="fld"><span>Area</span><select id="fArea">${UI.optionsHtml(areas, c ? c.areaId : null, { noneLabel: 'No area' })}</select></label>
      </div>
      <div class="grid2f">
        <label class="fld"><span>Email</span>
          <input type="email" id="fEmail" value="${UI.esc(c ? c.email : '')}" placeholder="jane@example.com"></label>
        <label class="fld"><span>Phone</span>
          <input type="text" id="fPhone" value="${UI.esc(c ? c.phone : '')}" placeholder="(555) 555-1234"></label>
      </div>
      <div class="grid2f">
        <label class="fld"><span>Last contact</span>
          <input type="date" id="fLastContact" value="${c && c.lastContact ? c.lastContact : ''}"></label>
        <label class="fld"><span>Follow up</span>
          <input type="date" id="fFollowUp" value="${c && c.followUpDate ? c.followUpDate : ''}"></label>
      </div>
      <label class="fld"><span>Tags (comma separated)</span>
        <input type="text" id="fTags" value="${UI.esc(c && c.tags ? c.tags.join(', ') : '')}" placeholder="family, vip"></label>
      <label class="fld"><span>Notes</span><textarea id="fNotes" style="min-height:70px">${UI.esc(c ? c.notes : '')}</textarea></label>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        ${c ? `<button class="btn danger" id="cDel">Delete</button>` : '<span></span>'}
        <button class="btn primary" id="cSave">${c ? 'Save changes' : 'Add contact'}</button>
      </div>`;

    const m = UI.modal(c ? 'Edit contact' : 'New contact', body);
    const q = sel => m.root.querySelector(sel);

    if (c) q('#cDel').onclick = async () => {
      if (!(await UI.confirm(`Delete "${c.name}"?`))) return;
      Store.remove('contacts', c.id); m.close(); render(main);
    };
    q('#cSave').onclick = () => {
      const name = q('#fName').value.trim();
      if (!name) { q('#fName').focus(); return; }
      const patch = {
        name,
        relation: q('#fRelation').value.trim(),
        email: q('#fEmail').value.trim(),
        phone: q('#fPhone').value.trim(),
        areaId: q('#fArea').value || null,
        tags: q('#fTags').value.split(',').map(s => s.trim()).filter(Boolean),
        notes: q('#fNotes').value,
        lastContact: q('#fLastContact').value || null,
        followUpDate: q('#fFollowUp').value || null
      };
      if (c) Store.update('contacts', c.id, patch); else Store.add('contacts', patch);
      m.close(); render(main);
    };
  }

  function renderList(main) {
    const container = main.querySelector('#contactView');
    const areas = Store.list('areas');
    const items = Store.list('contacts');
    ViewEngine.render(container, {
      key: 'contacts:all',
      collection: 'contacts',
      items,
      views: ['list', 'table'],
      filters: [
        { key: 'areaId', label: 'Area', options: areas.map(a => ({ value: a.id, label: a.name })) }
      ],
      sorts: [
        { key: 'name', label: 'Name', cmp: (a, b) => (a.name || '').localeCompare(b.name || '') },
        { key: 'lastContact', label: 'Last contact', cmp: (a, b) => (a.lastContact || '') < (b.lastContact || '') ? -1 : 1 },
        { key: 'followUp', label: 'Follow-up date', cmp: (a, b) => (a.followUpDate || '9999') < (b.followUpDate || '9999') ? -1 : 1 }
      ],
      columns: [
        { key: 'name', label: 'Name', render: it => `<div class="row tight" style="align-items:center;flex-wrap:nowrap">${UI.avatarCircle(it.name, 'sm')}<strong>${UI.esc(it.name)}</strong></div>` },
        { key: 'relation', label: 'Relation', render: it => it.relation ? UI.esc(it.relation) : '—' },
        { key: 'contact', label: 'Email / Phone', render: it => {
            const parts = [it.email, it.phone].filter(Boolean).map(UI.esc);
            return parts.length ? parts.join(' - ') : '—';
          } },
        { key: 'area', label: 'Area', render: it => UI.areaBadge(it.areaId) || '—' },
        { key: 'lastContact', label: 'Last contact', render: it => it.lastContact ? Store.date.shortDate(Store.date.parseKey(it.lastContact)) : '—' },
        { key: 'followUp', label: 'Follow-up', render: it => UI.dueBadge(it.followUpDate) || '—' }
      ],
      renderCard(it) {
        return `<div class="row" style="align-items:center;flex-wrap:nowrap;gap:11px">
          ${UI.avatarCircle(it.name)}
          <div style="min-width:0">
            <div style="font-weight:600;font-size:13.5px">${UI.esc(it.name)}</div>
            ${it.relation ? `<div class="sub" style="margin-top:1px">${UI.esc(it.relation)}</div>` : ''}
          </div>
        </div>
        <div class="row tight" style="margin-top:8px">
          ${UI.areaBadge(it.areaId)}
          ${(it.tags || []).map(t => `<span class="tag">${UI.esc(t)}</span>`).join('')}
          ${UI.dueBadge(it.followUpDate)}
        </div>`;
      },
      emptyLabel: 'No contacts match — try New contact or clear your filters.',
      onOpen: it => contactModal(main, it.id)
    });
  }

  function render(main) {
    const contacts = Store.list('contacts');
    const overdue = contacts.filter(c => c.followUpDate && Store.date.isOverdue(c.followUpDate)).length;
    main.innerHTML = `
      <div class="page-head">
        <div><h1>Contacts</h1>
          <div class="sub">${contacts.length} contact${contacts.length === 1 ? '' : 's'}${overdue ? ` · ${overdue} follow-up${overdue === 1 ? '' : 's'} overdue` : ''}</div>
        </div>
        <button class="btn primary" id="newContact">${UI.icon('plus')} New contact</button>
      </div>
      <section class="card"><div id="contactView"></div></section>`;
    main.querySelector('#newContact').onclick = () => contactModal(main, null);
    renderList(main);
  }

  window.Pages.contacts = { render };
})();
