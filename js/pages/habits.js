'use strict';
/* Habits & Journal — a single date-cursor view combining habit tracking
   (Store.habitEngine) with a lightweight daily journal (Store.notesEngine
   daily notes). No ViewEngine here: habits are a small, hand-rolled list
   keyed off a moving date cursor, closer in spirit to dashboard.js than to
   tasks.js's ViewEngine usage. */
(function () {
  const D = Store.date;

  // Date cursor lives at module scope so it survives re-renders triggered
  // by toggles/edits within this page (App.render() re-invokes render()
  // with a freshly emptied container each time the page is (re)navigated to,
  // but that always starts the cursor back at "today" — acceptable for a
  // lightweight daily view).
  let cursor = D.today();

  function habitModal(container, id) {
    const h = id ? Store.get('habits', id) : null;
    const areas = Store.list('areas');
    const sched = (h && h.schedule) || { type: 'daily' };

    const body = `
      <label class="fld"><span>Name</span>
        <input type="text" id="fName" value="${UI.esc(h ? h.name : '')}" placeholder="Meditate" autofocus></label>
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
    if (h) q('#hDel').onclick = async () => {
      if (!(await UI.confirm(`Delete "${h.name}"?`))) return;
      Store.remove('habits', h.id); m.close(); render(container);
    };
    q('#hSave').onclick = () => {
      const name = q('#fName').value.trim();
      if (!name) { q('#fName').focus(); return; }
      const type = q('#fSchedType').value;
      let schedule;
      if (type === 'weekdays') schedule = { type: 'weekdays', days: [...days].sort() };
      else if (type === 'weekly') schedule = { type: 'weekly', times: Math.min(7, Math.max(1, +q('#fTimes').value || 1)) };
      else schedule = { type: 'daily' };
      const patch = { name, areaId: q('#fArea').value || null, schedule };
      if (h) Store.update('habits', h.id, patch); else Store.add('habits', patch);
      m.close(); render(container);
    };
  }

  function render(container) {
    const habits = Store.habitEngine.active();
    const note = Store.notesEngine.dailyNote(D.key(cursor), true);

    container.innerHTML = `
      <div class="page-head">
        <div><h1>Habits &amp; Journal</h1><div class="sub">${UI.esc(D.humanDate(cursor))}</div></div>
        <div class="row tight">
          <button class="btn sm" id="datePrev">‹ Prev</button>
          <button class="btn sm ghost" id="dateToday">Today</button>
          <button class="btn sm" id="dateNext">Next ›</button>
        </div>
      </div>

      <div class="grid2">
        <section class="card">
          <div class="card-h"><h2>Habits</h2><button class="btn sm primary" id="newHabit">${UI.icon('plus')} New habit</button></div>
          <div class="card-b" id="habitList"></div>
        </section>

        <section class="card">
          <div class="card-h"><h2>Journal</h2><span class="saveflag" id="saveFlag">Saved ${D.relTime(note.updatedAt)}</span></div>
          <div class="card-b">
            <textarea id="journalBody" style="min-height:420px" placeholder="Write about today…">${UI.esc(note.body)}</textarea>
          </div>
        </section>
      </div>`;

    container.querySelector('#datePrev').onclick = () => { cursor = D.addDays(cursor, -1); render(container); };
    container.querySelector('#dateNext').onclick = () => { cursor = D.addDays(cursor, 1); render(container); };
    container.querySelector('#dateToday').onclick = () => { cursor = D.today(); render(container); };
    container.querySelector('#newHabit').onclick = () => habitModal(container, null);

    const listEl = container.querySelector('#habitList');
    listEl.innerHTML = habits.length ? habits.map(h => {
      const due = Store.habitEngine.isDue(h, cursor);
      const done = Store.habitEngine.isDone(h, cursor);
      const streak = Store.habitEngine.currentStreak(h);
      return `<div class="habit ${due ? '' : 'notdue'}">
        <button class="check ${done ? 'done' : ''}" data-toggle="${h.id}">${UI.icon('check')}</button>
        <div class="hname" data-edit="${h.id}" style="cursor:pointer">
          ${UI.esc(h.name)}
          <small>${UI.esc(Store.habitEngine.scheduleLabel(h))}</small>
        </div>
        ${UI.areaBadge(h.areaId)}
        <span class="pill ${streak.n > 0 ? 'good' : ''}">${streak.n > 0 ? '🔥 ' : ''}${streak.n} ${UI.esc(streak.unit)}</span>
      </div>`;
    }).join('') : `<div class="empty"><b>No habits yet</b>Add one to start tracking streaks.</div>`;

    listEl.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
      Store.habitEngine.toggle(Store.get('habits', b.dataset.toggle), cursor);
      render(container);
    });
    listEl.querySelectorAll('[data-edit]').forEach(el => el.onclick = () => habitModal(container, el.dataset.edit));

    const ta = container.querySelector('#journalBody');
    const flag = container.querySelector('#saveFlag');
    let saveTimer = null;
    ta.oninput = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const updated = Store.update('notes', note.id, { body: ta.value });
        if (updated) flag.textContent = 'Saved ' + D.relTime(updated.updatedAt);
      }, 400);
    };
  }

  window.Pages.habits = { render };
})();
