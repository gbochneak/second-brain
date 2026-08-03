'use strict';
/* Areas & Profile — the top of the PARA hierarchy. Profile is a single
   object on Store.state (read/write directly + Store.save()), Areas are a
   normal array collection rendered as a card grid (not ViewEngine — a small
   fixed grid of rich cards reads better than list/board/table here).
   Reference dashboard.js for the "read Store directly, no ViewEngine" shape
   and tasks.js for the modal CRUD shape. */
(function () {
  const esc = UI.esc;
  const EMOJIS = ['🏠', '💼', '💪', '💰', '🎨', '📚', '❤️', '🌱', '🎯', '🧠', '✝️'];

  /* ---------------- profile ---------------- */
  function renderProfile(container) {
    const p = Store.state.profile;
    const body = container.querySelector('#profileBody');
    const hasExtra = p.bio || p.mission;
    body.innerHTML = `
      <div class="row" style="align-items:center;gap:14px">
        <div class="avatar" style="width:54px;height:54px;font-size:26px">${esc(p.emoji || '🧠')}</div>
        <div>
          <div style="font-weight:650;font-size:18px;letter-spacing:-.01em">${p.name ? esc(p.name) : '<span style="color:var(--faint)">No name set</span>'}</div>
        </div>
      </div>
      ${p.bio ? `<p style="margin:14px 0 0;color:var(--muted)">${esc(p.bio)}</p>` : ''}
      ${p.mission ? `<div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px">
        <div class="sub" style="margin:0 0 4px">Mission</div>
        <p style="margin:0">${esc(p.mission)}</p>
      </div>` : ''}
      ${hasExtra ? '' : '<div class="empty" style="padding:16px 0">Add a bio and a mission to make this page yours.</div>'}`;
  }

  function profileModal(container) {
    const p = Store.state.profile;
    const body = `
      <label class="fld"><span>Name</span><input type="text" id="fName" value="${esc(p.name)}" placeholder="Your name" autofocus></label>
      <label class="fld"><span>Emoji</span><input type="text" id="fEmoji" value="${esc(p.emoji)}" placeholder="🧠" style="width:80px"></label>
      <label class="fld"><span>Bio</span><textarea id="fBio" style="min-height:70px" placeholder="A couple sentences about you">${esc(p.bio)}</textarea></label>
      <label class="fld"><span>Mission</span><textarea id="fMission" style="min-height:70px" placeholder="What you're steering toward">${esc(p.mission)}</textarea></label>
      <div class="row" style="justify-content:flex-end;margin-top:6px">
        <button class="btn primary" id="pSave">Save</button>
      </div>`;
    const m = UI.modal('Edit profile', body);
    const q = sel => m.root.querySelector(sel);
    q('#pSave').onclick = () => {
      p.name = q('#fName').value.trim();
      p.emoji = q('#fEmoji').value.trim() || '🧠';
      p.bio = q('#fBio').value;
      p.mission = q('#fMission').value;
      Store.save();
      m.close();
      renderProfile(container);
      UI.toast('Profile updated');
    };
  }

  /* ---------------- areas ---------------- */
  function summaryLine(areaId) {
    const s = Store.link.areaSummary(areaId);
    const parts = [
      ['projects', 'project'], ['goals', 'goal'], ['tasks', 'task'],
      ['habits', 'habit'], ['notes', 'note'], ['contacts', 'contact'], ['ideas', 'idea']
    ].filter(([k]) => s[k] > 0).map(([k, sing]) => `${s[k]} ${s[k] === 1 ? sing : sing + 's'}`);
    return parts.length ? parts.join(', ') : 'Nothing linked yet';
  }

  function renderAreas(container) {
    const areas = Store.list('areas');
    const sub = container.querySelector('#areasSub');
    if (sub) sub.textContent = areas.length ? `${areas.length} area${areas.length === 1 ? '' : 's'} · click a card to see everything linked to it` : 'Nothing here yet';
    const grid = container.querySelector('#areaGrid');
    if (!areas.length) {
      grid.innerHTML = `<div class="empty"><b>No areas yet</b>Areas are the big buckets of your life — Health, Work, Family. Add one to start linking projects, goals and tasks to it.</div>`;
      return;
    }
    grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px">
      ${areas.map(a => {
        const c = a.color || '#4f46e5';
        const desc = a.description ? (a.description.length > 110 ? a.description.slice(0, 110) + '…' : a.description) : '';
        return `<div class="card" data-area="${a.id}" style="padding:14px;cursor:pointer;border-left:4px solid ${c}">
          <div class="row" style="align-items:center;justify-content:space-between;gap:8px">
            <div class="row" style="align-items:center;gap:9px">
              <div class="avatar" style="background:${c}22;color:${c};font-size:18px">${esc(a.emoji || '📁')}</div>
              <strong style="font-size:14.5px">${esc(a.name)}</strong>
            </div>
            <div class="row tight">
              <button class="btn ghost sm" data-editarea="${a.id}">Edit</button>
              <button class="btn ghost sm" data-delarea="${a.id}">Archive</button>
            </div>
          </div>
          ${desc ? `<p class="sub" style="margin:10px 0 0">${esc(desc)}</p>` : ''}
          <div class="sub" style="margin-top:10px">${esc(summaryLine(a.id))}</div>
        </div>`;
      }).join('')}
    </div>`;

    grid.querySelectorAll('[data-area]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-editarea]') || e.target.closest('[data-delarea]')) return;
        areaDetailModal(container, el.dataset.area);
      };
    });
    grid.querySelectorAll('[data-editarea]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); areaModal(container, b.dataset.editarea); };
    });
    grid.querySelectorAll('[data-delarea]').forEach(b => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const a = Store.get('areas', b.dataset.delarea);
        if (!a) return;
        if (!(await UI.confirm(`Archive "${a.name}"? Items linked to it stay put, they just won't show its badge.`))) return;
        Store.archive('areas', a.id);
        renderAreas(container);
        UI.toast('Area archived');
      };
    });
  }

  function areaModal(container, id) {
    const a = id ? Store.get('areas', id) : null;
    let selEmoji = a ? (a.emoji || EMOJIS[0]) : EMOJIS[0];
    let selColor = a ? (a.color || UI.AREA_COLORS[0]) : UI.AREA_COLORS[0];

    const body = `
      <label class="fld"><span>Name</span><input type="text" id="fName" value="${esc(a ? a.name : '')}" placeholder="Health" autofocus></label>
      <label class="fld"><span>Emoji</span><div class="emojipick" id="fEmoji">${EMOJIS.map(e => `<button type="button" data-e="${e}" class="${selEmoji === e ? 'on' : ''}">${e}</button>`).join('')}</div></label>
      <label class="fld"><span>Color</span><div class="colorpick" id="fColor">${UI.AREA_COLORS.map(c => `<button type="button" data-c="${c}" class="${selColor === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></label>
      <label class="fld"><span>Description</span><textarea id="fDesc" style="min-height:80px" placeholder="What this area covers">${esc(a ? a.description : '')}</textarea></label>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        ${a ? `<button class="btn danger" id="aDel">Archive</button>` : '<span></span>'}
        <button class="btn primary" id="aSave">${a ? 'Save changes' : 'Add area'}</button>
      </div>`;

    const m = UI.modal(a ? 'Edit area' : 'New area', body);
    const q = sel => m.root.querySelector(sel);
    q('#fEmoji').querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
      selEmoji = b.dataset.e;
      q('#fEmoji').querySelectorAll('[data-e]').forEach(x => x.classList.toggle('on', x.dataset.e === selEmoji));
    });
    q('#fColor').querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      selColor = b.dataset.c;
      q('#fColor').querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x.dataset.c === selColor));
    });
    if (a) q('#aDel').onclick = async () => {
      if (!(await UI.confirm(`Archive "${a.name}"? Items linked to it stay put, they just won't show its badge.`))) return;
      Store.archive('areas', a.id);
      m.close();
      renderAreas(container);
      UI.toast('Area archived');
    };
    q('#aSave').onclick = () => {
      const name = q('#fName').value.trim();
      if (!name) { q('#fName').focus(); return; }
      const patch = { name, emoji: selEmoji, color: selColor, description: q('#fDesc').value };
      if (a) Store.update('areas', a.id, patch); else Store.add('areas', patch);
      m.close();
      renderAreas(container);
      UI.toast(a ? 'Area updated' : 'Area added');
    };
  }

  function areaDetailModal(container, areaId) {
    const a = Store.get('areas', areaId);
    if (!a) return;
    const linked = Store.link.itemsLinkedToArea(areaId);
    const groups = [
      ['Projects', 'projects', 'projects', it => it.name],
      ['Goals', 'goals', 'goals', it => it.name],
      ['Tasks', 'tasks', 'tasks', it => it.text],
      ['Habits', 'habits', 'habits', it => it.name],
      ['Notes', 'notes', 'notes', it => it.title || 'Untitled'],
      ['Contacts', 'contacts', 'contacts', it => it.name],
      ['Ideas', 'ideas', 'ideas', it => it.text]
    ];
    const c = a.color || '#4f46e5';
    const body = `
      <div class="row" style="align-items:center;gap:12px;margin-bottom:16px">
        <div class="avatar" style="background:${c}22;color:${c};font-size:22px">${esc(a.emoji || '📁')}</div>
        <div>
          <div style="font-weight:650;font-size:16px">${esc(a.name)}</div>
          ${a.description ? `<div class="sub" style="margin-top:2px">${esc(a.description)}</div>` : ''}
        </div>
      </div>
      ${groups.map(([label, key, pageKey, getLabel]) => {
        const items = linked[key] || [];
        return `<div style="margin-bottom:16px">
          <div class="card-h" style="padding:0 0 8px;border-bottom:1px solid var(--line);margin-bottom:8px">
            <h3>${esc(label)} <span class="pill">${items.length}</span></h3>
            <button class="btn sm ghost" data-goto="${pageKey}">Open ${esc(label)} ${UI.icon('arrowRight')}</button>
          </div>
          ${items.length ? items.map(it => `<div class="kv"><span class="k">${esc(getLabel(it))}</span></div>`).join('') : '<div class="empty" style="padding:8px 0">Nothing linked.</div>'}
        </div>`;
      }).join('')}`;

    const m = UI.modal(`${a.emoji || '📁'} ${a.name}`, body, { wide: true });
    m.root.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { m.close(); App.go(b.dataset.goto); });
  }

  /* ---------------- page shell ---------------- */
  function render(container) {
    container.innerHTML = `
      <div class="page-head">
        <div><h1>Areas &amp; Profile</h1><div class="sub" id="areasSub"></div></div>
        <button class="btn primary" id="newArea">${UI.icon('plus')} New area</button>
      </div>
      <section class="card" style="margin-bottom:18px">
        <div class="card-h"><h2>Profile</h2><button class="btn sm" id="editProfile">Edit profile</button></div>
        <div class="card-b" id="profileBody"></div>
      </section>
      <section class="card">
        <div class="card-h"><h2>Areas</h2></div>
        <div class="card-b" id="areaGrid"></div>
      </section>`;

    container.querySelector('#newArea').onclick = () => areaModal(container, null);
    container.querySelector('#editProfile').onclick = () => profileModal(container);
    renderProfile(container);
    renderAreas(container);
  }

  window.Pages.areas = { render };
})();
