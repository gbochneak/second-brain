'use strict';
/* Dashboard Overview — the "right now" snapshot. Reference implementation:
   a rollup page that reads several collections directly (no ViewEngine
   needed here — see js/pages/tasks.js for the canonical ViewEngine usage). */
(function () {
  const D = Store.date;

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Still up?';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function render(main) {
    const profile = Store.state.profile;
    const t = D.today();
    const allTasks = Store.list('tasks');
    const dueToday = allTasks.filter(x => x.status !== 'done' && x.dueDate === D.key(t));
    const overdue = allTasks.filter(x => x.status !== 'done' && x.dueDate && D.isOverdue(x.dueDate));
    const habits = Store.habitEngine.active();
    const dueHabits = habits.filter(h => Store.habitEngine.isDue(h, t));
    const doneHabits = dueHabits.filter(h => Store.habitEngine.isDone(h, t));
    const projects = Store.list('projects').filter(p => p.status !== 'done');
    const goals = Store.list('goals').filter(g => g.status !== 'done' && g.targetDate)
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate)).slice(0, 5);
    const notes = Store.list('notes').filter(n => !n.daily).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const watching = Store.list('watchlist').filter(w => w.status === 'in_progress');
    const atRiskHabits = dueHabits.filter(h => !Store.habitEngine.isDone(h, t) && Store.habitEngine.currentStreak(h).n > 0);

    main.innerHTML = `
      <div class="page-head">
        <div>
          <h1>${UI.esc(greeting())}${profile.name ? ', ' + UI.esc(profile.name) : ''} ${UI.esc(profile.emoji || '')}</h1>
          <div class="sub">${t.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      <div class="stats">
        <div class="card stat"><div class="k">Tasks today</div><div class="v">${dueToday.length}</div><div class="n">${overdue.length ? overdue.length + ' overdue' : 'none overdue'}</div></div>
        <div class="card stat"><div class="k">Habits</div><div class="v">${doneHabits.length}/${dueHabits.length}</div><div class="n">done today</div></div>
        <div class="card stat"><div class="k">Active projects</div><div class="v">${projects.length}</div><div class="n">${Store.list('areas').length} areas</div></div>
        <div class="card stat"><div class="k">Open ideas</div><div class="v">${Store.list('ideas').filter(i => i.status !== 'promoted').length}</div><div class="n">in the hopper</div></div>
      </div>

      <div class="grid2">
        <div style="display:flex;flex-direction:column;gap:18px">
          <section class="card">
            <div class="card-h"><h2>Today &amp; overdue</h2><button class="btn sm" data-goto="tasks">Open Tasks ${UI.icon('arrowRight')}</button></div>
            <div class="card-b" id="dashTasks"></div>
          </section>

          <section class="card">
            <div class="card-h"><h2>Active projects</h2><button class="btn sm" data-goto="projects">Open Projects ${UI.icon('arrowRight')}</button></div>
            <div class="card-b" id="dashProjects"></div>
          </section>

          <section class="card">
            <div class="card-h"><h2>Upcoming goals</h2><button class="btn sm" data-goto="goals">Open Goals ${UI.icon('arrowRight')}</button></div>
            <div class="card-b" id="dashGoals"></div>
          </section>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          ${atRiskHabits.length ? `<section class="card" style="border-color:var(--warn)">
            <div class="card-h"><h2>⚠️ Streaks at risk</h2><button class="btn sm" data-goto="habits">Habits ${UI.icon('arrowRight')}</button></div>
            <div class="card-b">${atRiskHabits.map(h => {
              const st = Store.habitEngine.currentStreak(h);
              return `<div class="habit"><button class="check" data-habit="${h.id}">${UI.icon('check')}</button>
                <div class="hname">${UI.esc(h.name)}<small>${st.n} ${st.unit} on the line</small></div></div>`;
            }).join('')}</div>
          </section>` : ''}

          <section class="card">
            <div class="card-h"><h2>Recent notes</h2><button class="btn sm" data-goto="notes">Open Notes ${UI.icon('arrowRight')}</button></div>
            <div class="card-b">${notes.length ? notes.map(n => `
              <div class="kv"><span class="k">${n.type === 'book' ? '📕' : n.type === 'resource' ? '🔗' : '📝'} ${UI.esc(n.title || 'Untitled')}</span><span>${D.relTime(n.updatedAt)}</span></div>
            `).join('') : '<div class="empty" style="padding:14px">No notes yet.</div>'}</div>
          </section>

          <section class="card">
            <div class="card-h"><h2>Watching / reading</h2><button class="btn sm" data-goto="watchlist">Watchlist ${UI.icon('arrowRight')}</button></div>
            <div class="card-b">${watching.length ? watching.map(w => `
              <div class="kv"><span class="k">${({ movie: '🎬', show: '📺', book: '📖', game: '🎮' })[w.type] || '🎬'} ${UI.esc(w.title)}</span></div>
            `).join('') : '<div class="empty" style="padding:14px">Nothing in progress.</div>'}</div>
          </section>
        </div>
      </div>`;

    main.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => App.go(b.dataset.goto));
    main.querySelectorAll('[data-habit]').forEach(b => b.onclick = () => { Store.habitEngine.toggle(Store.get('habits', b.dataset.habit), t); render(main); });

    const dt = main.querySelector('#dashTasks');
    const todayAndOverdue = overdue.concat(dueToday);
    dt.innerHTML = todayAndOverdue.length ? todayAndOverdue.slice(0, 8).map(x => `
      <div class="task"><button class="check sm ${x.status === 'done' ? 'done' : ''}" data-task="${x.id}">${UI.icon('check')}</button>
        <span class="txt">${UI.esc(x.text)}</span>
        ${D.isOverdue(x.dueDate) ? UI.dueBadge(x.dueDate) : ''}
        ${UI.priorityPill(x.priority)}
      </div>`).join('') : `<div class="empty" style="padding:14px"><b>Clear!</b>Nothing due today.</div>`;
    dt.querySelectorAll('[data-task]').forEach(b => b.onclick = () => { Store.taskEngine.completeTask(b.dataset.task); render(main); });

    const dp = main.querySelector('#dashProjects');
    dp.innerHTML = projects.length ? projects.slice(0, 6).map(p => {
      const prog = Store.link.projectProgress(p.id);
      return `<div style="padding:9px 0;border-bottom:1px solid var(--line)">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <strong style="font-size:13.5px">${UI.esc(p.name)}</strong>
          <span class="sub" style="margin:0">${prog.done}/${prog.total}</span>
        </div>
        <div class="progressbar"><i style="width:${prog.pct}%"></i></div>
      </div>`;
    }).join('') : `<div class="empty" style="padding:14px">No active projects. Create one from an Area.</div>`;

    const dg = main.querySelector('#dashGoals');
    dg.innerHTML = goals.length ? goals.map(g => `
      <div class="kv"><span class="k">${UI.esc(g.name)}</span><span>${UI.dueBadge(g.targetDate)}</span></div>
    `).join('') : `<div class="empty" style="padding:14px">No goals with a target date yet.</div>`;
  }

  window.Pages.dashboard = { render };
})();
