'use strict';
/* Habits & Journal — a single date-cursor "today view" combining habit
   tracking (Store.habitEngine) with a structured daily journal
   (Store.notesEngine daily notes). No ViewEngine here: habits are a small,
   hand-rolled list keyed off a moving date cursor, closer in spirit to
   dashboard.js than to tasks.js's ViewEngine usage.

   Two deliberate design choices worth knowing before touching this file:
   - The daily list only shows habits actually DUE on the viewed day (via
     Store.habitEngine.isDue), grouped under Morning/Night headers by each
     habit's `timeOfDay` field ('morning'|'night', missing = 'morning' for
     any habit created before this field existed — see todOf()). It does
     NOT show not-due habits at all (earlier versions dimmed them instead).
   - There's exactly one entry point for creating/editing/deleting habits:
     the "Edit habits" button in the page header, which opens a management
     modal listing every habit. habitModal() takes an optional
     opts.returnTo callback so it can hand control back to that management
     modal after a save/delete, instead of just closing to the page.
*/
(function () {
  const D = Store.date;

  // Date cursor lives at module scope so it survives re-renders triggered
  // by toggles/edits within this page (App.render() re-invokes render()
  // with a freshly emptied container each time the page is (re)navigated to,
  // but that always starts the cursor back at "today" — acceptable for a
  // lightweight daily view).
  let cursor = D.today();

  const TOD = {
    morning: { label: 'Morning', icon: '🌅' },
    afternoon: { label: 'Afternoon', icon: '☀️' },
    night: { label: 'Night', icon: '🌙' }
  };
  const TOD_ORDER = ['morning', 'afternoon', 'night'];
  function todOf(h) { return TOD[h.timeOfDay] ? h.timeOfDay : 'morning'; }

  // Reorders within the full active-habits list (the same order everywhere
  // habits are shown — see Store.habitEngine.active()'s doc comment).
  // Always re-normalizes to contiguous 0..n-1 values first so a swap is
  // meaningful even when habits share a stale/missing `order` (e.g. every
  // habit created before this field existed defaults to 0).
  function moveHabit(id, dir) {
    const ordered = Store.habitEngine.active();
    ordered.forEach((h, i) => { if (h.order !== i) Store.update('habits', h.id, { order: i }); });
    const idx = ordered.findIndex(h => h.id === id);
    const swapIdx = idx + dir;
    if (idx === -1 || swapIdx < 0 || swapIdx >= ordered.length) return;
    Store.update('habits', ordered[idx].id, { order: swapIdx });
    Store.update('habits', ordered[swapIdx].id, { order: idx });
  }

  /* ---------- create/edit habit modal ---------- */
  function habitModal(container, id, opts) {
    opts = opts || {};
    const h = id ? Store.get('habits', id) : null;
    const areas = Store.list('areas');
    const sched = (h && h.schedule) || { type: 'daily' };
    let tod = h ? todOf(h) : 'morning';

    const body = `
      <label class="fld"><span>Name</span>
        <input type="text" id="fName" value="${UI.esc(h ? h.name : '')}" placeholder="Meditate" autofocus></label>
      <label class="fld"><span>Time of day</span>
        <div class="row tight" id="fTod">
          ${TOD_ORDER.map(key => `<button type="button" class="btn sm ${tod === key ? 'primary' : 'ghost'}" data-tod="${key}">${TOD[key].icon} ${TOD[key].label}</button>`).join('')}
        </div>
      </label>
      <label class="fld"><span>Area</span><select id="fArea">${UI.optionsHtml(areas, h ? h.areaId : null, { noneLabel: 'No area' })}</select></label>
      <label class="fld"><span>Schedule</span><select id="fSchedType">
        <option value="daily" ${sched.type === 'daily' ? 'selected' : ''}>Every day</option>
        <option value="weekdays" ${sched.type === 'weekdays' ? 'selected' : ''}>Specific weekdays</option>
        <option value="weekly" ${sched.type === 'weekly' ? 'selected' : ''}>Times per week</option>
      </select></label>
      <div class="fld ${sched.type === 'weekdays' ? '' : 'hidden'}" id="wrapDays">
        <div class="daypick">${[1, 2, 3, 4, 5, 6, 0].map(i => `<button type="button" data-hd="${i}" class="${sched.days && sched.days.includes(i) ? 'on' : ''}">${D.DAYS[i][0]}${D.DAYS[i][1]}</button>`).join('')}</div>
      </div>
      <label class="fld ${sched.type === 'weekly' ? '' : 'hidden'}" id="wrapTimes"><span>Times per week</span>
        <input type="number" id="fTimes" min="1" max="7" value="${sched.times || 3}"></label>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        ${h ? `<button class="btn danger" id="hDel">Delete</button>` : '<span></span>'}
        <button class="btn primary" id="hSave">${h ? 'Save changes' : 'Add habit'}</button>
      </div>`;

    const m = UI.modal(h ? 'Edit habit' : 'New habit', body);
    const q = sel => m.root.querySelector(sel);
    const days = new Set(sched.days ? sched.days : []);

    q('#fTod').querySelectorAll('[data-tod]').forEach(b => b.onclick = () => {
      tod = b.dataset.tod;
      q('#fTod').querySelectorAll('[data-tod]').forEach(x => x.classList.toggle('primary', x.dataset.tod === tod));
      q('#fTod').querySelectorAll('[data-tod]').forEach(x => x.classList.toggle('ghost', x.dataset.tod !== tod));
    });
    q('#fSchedType').onchange = () => {
      const v = q('#fSchedType').value;
      q('#wrapDays').classList.toggle('hidden', v !== 'weekdays');
      q('#wrapTimes').classList.toggle('hidden', v !== 'weekly');
    };
    q('#wrapDays').querySelectorAll('[data-hd]').forEach(b => b.onclick = () => {
      const i = +b.dataset.hd;
      if (days.has(i)) days.delete(i); else days.add(i);
      b.classList.toggle('on');
    });

    const finish = () => {
      m.close();
      render(container);
      if (opts.returnTo) opts.returnTo();
    };
    if (h) q('#hDel').onclick = async () => {
      if (!(await UI.confirm(`Delete "${h.name}"? This removes its full history too.`))) return;
      Store.remove('habits', h.id);
      finish();
    };
    q('#hSave').onclick = () => {
      const name = q('#fName').value.trim();
      if (!name) { q('#fName').focus(); return; }
      const type = q('#fSchedType').value;
      let schedule;
      if (type === 'weekdays') schedule = { type: 'weekdays', days: [...days].sort() };
      else if (type === 'weekly') schedule = { type: 'weekly', times: Math.min(7, Math.max(1, +q('#fTimes').value || 1)) };
      else schedule = { type: 'daily' };
      const patch = { name, areaId: q('#fArea').value || null, schedule, timeOfDay: tod };
      if (h) {
        Store.update('habits', h.id, patch);
      } else {
        // new habits go to the end of the list by default
        const maxOrder = Store.list('habits', { includeArchived: true }).reduce((m, x) => Math.max(m, x.order || 0), -1);
        Store.add('habits', Object.assign(patch, { order: maxOrder + 1 }));
      }
      finish();
    };
  }

  /* ---------- "Edit habits" management modal — lists every habit ---------- */
  function manageHabitRowHtml(h, idx, total) {
    const tod = TOD[todOf(h)];
    return `<div class="habit">
      <span class="row tight" style="flex:0 0 auto">
        <button class="btn sm ghost" data-move-up="${h.id}" ${idx === 0 ? 'disabled' : ''} title="Move up" style="width:28px;justify-content:center;padding:5px">↑</button>
        <button class="btn sm ghost" data-move-down="${h.id}" ${idx === total - 1 ? 'disabled' : ''} title="Move down" style="width:28px;justify-content:center;padding:5px">↓</button>
      </span>
      <div class="hname">
        ${UI.esc(h.name)}
        <small>${tod.icon} ${tod.label} · ${UI.esc(Store.habitEngine.scheduleLabel(h))}</small>
      </div>
      ${UI.areaBadge(h.areaId)}
      <span class="row tight" style="flex:0 0 auto">
        <button class="btn sm ghost" data-manage-edit="${h.id}">Edit</button>
        <button class="btn sm ghost" data-manage-del="${h.id}" style="color:var(--danger)">Delete</button>
      </span>
    </div>`;
  }

  function manageHabitsModal(container) {
    const m = UI.modal('Manage habits', `
      <button class="btn primary" id="mAdd" style="width:100%;margin-bottom:14px">${UI.icon('plus')} Add habit</button>
      <div id="mList"></div>`, { wide: true });

    function refreshList() {
      const habits = Store.habitEngine.active();
      const listEl = m.root.querySelector('#mList');
      listEl.innerHTML = habits.length ? habits.map((h, i) => manageHabitRowHtml(h, i, habits.length)).join('')
        : `<div class="empty"><b>No habits yet</b>Add your first one above.</div>`;

      listEl.querySelectorAll('[data-manage-edit]').forEach(b => b.onclick = () => {
        m.close();
        habitModal(container, b.dataset.manageEdit, { returnTo: () => manageHabitsModal(container) });
      });
      listEl.querySelectorAll('[data-manage-del]').forEach(b => b.onclick = async () => {
        const h = Store.get('habits', b.dataset.manageDel);
        if (!h) return;
        if (await UI.confirm(`Delete "${h.name}"? This removes its full history too.`)) {
          Store.remove('habits', h.id);
          render(container);
        }
        manageHabitsModal(container); // UI.confirm already overwrote the overlay — reopen fresh
      });
      // Reordering never opens a nested modal/confirm, so refresh in place —
      // avoids a jarring close/reopen flash on every click of a rapid,
      // repeated interaction.
      listEl.querySelectorAll('[data-move-up]').forEach(b => b.onclick = () => {
        moveHabit(b.dataset.moveUp, -1);
        render(container);
        refreshList();
      });
      listEl.querySelectorAll('[data-move-down]').forEach(b => b.onclick = () => {
        moveHabit(b.dataset.moveDown, 1);
        render(container);
        refreshList();
      });
    }

    m.root.querySelector('#mAdd').onclick = () => {
      m.close();
      habitModal(container, null, { returnTo: () => manageHabitsModal(container) });
    };
    refreshList();
  }

  /* ---------- daily habit list: due-today only, grouped by time of day ---------- */
  function dailyHabitRowHtml(h) {
    const done = Store.habitEngine.isDone(h, cursor);
    const streak = Store.habitEngine.currentStreak(h);
    return `<div class="habit">
      <button class="check ${done ? 'done' : ''}" data-toggle="${h.id}">${UI.icon('check')}</button>
      <div class="hname" data-edit="${h.id}" style="cursor:pointer">
        ${UI.esc(h.name)}
        <small>${UI.esc(Store.habitEngine.scheduleLabel(h))}</small>
      </div>
      ${UI.areaBadge(h.areaId)}
      <span class="pill ${streak.n > 0 ? 'good' : ''}">${streak.n > 0 ? '🔥 ' : ''}${streak.n} ${UI.esc(streak.unit)}</span>
    </div>`;
  }

  function renderHabitList(container) {
    const listEl = container.querySelector('#habitList');
    const all = Store.habitEngine.active();
    const dueToday = all.filter(h => Store.habitEngine.isDue(h, cursor));

    const group = key => {
      const list = dueToday.filter(h => todOf(h) === key);
      if (!list.length) return '';
      return `<div class="habit-group-label">${TOD[key].icon} ${TOD[key].label}</div>${list.map(dailyHabitRowHtml).join('')}`;
    };

    if (!all.length) {
      listEl.innerHTML = `<div class="empty"><b>No habits yet</b>Click "Edit habits" above to add your first one.</div>`;
    } else if (!dueToday.length) {
      listEl.innerHTML = `<div class="empty"><b>Nothing due today</b>Enjoy the day off.</div>`;
    } else {
      listEl.innerHTML = TOD_ORDER.map(group).join('');
    }

    listEl.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
      Store.habitEngine.toggle(Store.get('habits', b.dataset.toggle), cursor);
      renderHabitList(container);
    });
    listEl.querySelectorAll('[data-edit]').forEach(el => el.onclick = () => habitModal(container, el.dataset.edit));
  }

  /* ---------- journal: general free-write + three structured prompts ---------- */
  const JOURNAL_FIELDS = [
    { key: 'gratitude', label: '✝️ Grateful for', placeholder: 'Three things you’re grateful for today…', rows: 70 },
    { key: 'wentWell', label: '✅ Went well', placeholder: 'One thing you did well today…', rows: 60 },
    { key: 'improveTomorrow', label: '🎯 Improve tomorrow', placeholder: 'One thing you can do better tomorrow…', rows: 60 },
    { key: 'body', label: '📝 General', placeholder: 'Anything else on your mind…', rows: 160 }
  ];

  function renderJournal(container, note) {
    const wrap = container.querySelector('#journalFields');
    wrap.innerHTML = JOURNAL_FIELDS.map(f => `
      <label class="fld"><span>${f.label}</span>
        <textarea data-jkey="${f.key}" style="min-height:${f.rows}px" placeholder="${UI.esc(f.placeholder)}">${UI.esc(note[f.key] || '')}</textarea>
      </label>`).join('');

    const flag = container.querySelector('#saveFlag');
    let saveTimer = null;
    wrap.querySelectorAll('[data-jkey]').forEach(ta => {
      ta.oninput = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const updated = Store.update('notes', note.id, { [ta.dataset.jkey]: ta.value });
          if (updated) flag.textContent = 'Saved ' + D.relTime(updated.updatedAt);
        }, 400);
      };
    });
  }

  /* ---------- progress: weight + photo, tied to the same daily note ---------- */
  // Downscales+recompresses to a JPEG data URL before it ever touches Store,
  // since these notes live in one JSON blob that's both persisted to
  // localStorage and pushed whole on every sync (see js/sync.js) — a
  // full-resolution photo per day would bloat both fast.
  function resizeImage(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Could not read file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read that image'));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderProgress(container, note) {
    const wrap = container.querySelector('#progressFields');
    const flag = container.querySelector('#progressSaveFlag');
    wrap.innerHTML = `
      <div class="row" style="align-items:flex-start">
        <label class="fld" style="margin-bottom:0">
          <span>⚖️ Weight</span>
          <div class="row tight" style="align-items:center">
            <input type="number" id="fWeight" step="0.1" min="0" placeholder="—" value="${note.weight != null ? note.weight : ''}" style="width:90px;flex:0 0 auto">
            <span class="sub" style="margin:0">lbs</span>
          </div>
        </label>
        <div class="fld" style="margin-bottom:0">
          <span>📷 Progress photo</span>
          <div class="photo-row">
            ${note.photo ? `
              <img class="photo-thumb" id="photoThumb" src="${note.photo}" title="Click to view full size">
              <div class="col tight">
                <button type="button" class="btn sm ghost" id="photoReplace">Replace</button>
                <button type="button" class="btn sm ghost" id="photoRemove" style="color:var(--danger)">Remove</button>
              </div>` : `
              <button type="button" class="photo-upload" id="photoUploadBtn">📷<span>Upload photo</span></button>`}
          </div>
        </div>
      </div>
      <input type="file" accept="image/*" id="fPhoto" class="hidden">`;

    let saveTimer = null;
    wrap.querySelector('#fWeight').oninput = e => {
      clearTimeout(saveTimer);
      const val = e.target.value;
      saveTimer = setTimeout(() => {
        const updated = Store.update('notes', note.id, { weight: val === '' ? null : Math.max(0, +val) });
        if (updated) { note = updated; flag.textContent = 'Saved ' + D.relTime(updated.updatedAt); }
      }, 400);
    };

    const fileInput = wrap.querySelector('#fPhoto');
    const openPicker = () => fileInput.click();
    const uploadBtn = wrap.querySelector('#photoUploadBtn');
    if (uploadBtn) uploadBtn.onclick = openPicker;
    const replaceBtn = wrap.querySelector('#photoReplace');
    if (replaceBtn) replaceBtn.onclick = openPicker;
    const removeBtn = wrap.querySelector('#photoRemove');
    if (removeBtn) removeBtn.onclick = async () => {
      if (!(await UI.confirm('Remove this progress photo?'))) return;
      const updated = Store.update('notes', note.id, { photo: null });
      flag.textContent = 'Saved ' + D.relTime(updated.updatedAt);
      renderProgress(container, updated);
    };
    const thumb = wrap.querySelector('#photoThumb');
    if (thumb) thumb.onclick = () => UI.modal('Progress photo', `<img src="${note.photo}" style="width:100%;border-radius:var(--radius-sm);display:block">`);

    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const dataUrl = await resizeImage(file, 900, 0.78);
        const updated = Store.update('notes', note.id, { photo: dataUrl });
        flag.textContent = 'Saved ' + D.relTime(updated.updatedAt);
        renderProgress(container, updated);
      } catch (err) {
        UI.toast('Could not read that image');
      }
    };
  }

  /* ---------- page shell ---------- */
  function render(container) {
    const note = Store.notesEngine.dailyNote(D.key(cursor), true);

    container.innerHTML = `
      <div class="page-head">
        <div><h1>Habits &amp; Journal</h1><div class="sub">${UI.esc(D.humanDate(cursor))}</div></div>
        <button class="btn primary" id="editHabits">${UI.icon('flame')} Edit habits</button>
      </div>

      <div class="row tight" style="margin-bottom:18px">
        <button class="btn sm" id="datePrev">‹ Prev</button>
        <button class="btn sm ghost" id="dateToday">Today</button>
        <button class="btn sm" id="dateNext">Next ›</button>
      </div>

      <div class="grid2">
        <section class="card">
          <div class="card-h"><h2>Habits</h2></div>
          <div class="card-b" id="habitList"></div>
        </section>

        <section class="card">
          <div class="card-h"><h2>Journal</h2><span class="saveflag" id="saveFlag">Saved ${D.relTime(note.updatedAt)}</span></div>
          <div class="card-b" id="journalFields"></div>
        </section>
      </div>

      <section class="card" style="margin-top:18px">
        <div class="card-h"><h2>Progress</h2><span class="saveflag" id="progressSaveFlag">Saved ${D.relTime(note.updatedAt)}</span></div>
        <div class="card-b" id="progressFields"></div>
      </section>`;

    container.querySelector('#editHabits').onclick = () => manageHabitsModal(container);
    container.querySelector('#datePrev').onclick = () => { cursor = D.addDays(cursor, -1); render(container); };
    container.querySelector('#dateNext').onclick = () => { cursor = D.addDays(cursor, 1); render(container); };
    container.querySelector('#dateToday').onclick = () => { cursor = D.today(); render(container); };

    renderHabitList(container);
    renderJournal(container, note);
    renderProgress(container, note);
  }

  window.Pages.habits = { render };
})();
