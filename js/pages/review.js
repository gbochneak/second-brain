'use strict';
/* Review Hub — analytics/retrospective page. Deliberately does NOT repeat
   Dashboard's "today" / "at risk today" content: this is the long-view —
   26-week habit heatmaps + streak stats, a Projects/Goals progress rollup,
   and a 7-day "tasks completed" bar chart. Reads Store directly, no
   ViewEngine (nothing here is a filterable record list). */
(function () {
  const D = Store.date;

  /* ---------- Section 1: habit history heatmaps ---------- */
  function habitHeatmap(h, today) {
    const weeks = [];
    let ws = D.startOfWeek(today);
    for (let i = 0; i < 26; i++) { weeks.unshift(ws); ws = D.addDays(ws, -7); }
    const cols = weeks.map(weekStart => {
      let cells = '';
      for (let day = 0; day < 7; day++) {
        const d = D.addDays(weekStart, day);
        let cls = 'hmcell';
        if (d > today || !Store.habitEngine.isDue(h, d)) cls += ' off';
        else if (Store.habitEngine.isDone(h, d)) cls += ' l4';
        cells += `<div class="${cls}"></div>`;
      }
      return `<div class="hmcol">${cells}</div>`;
    }).join('');
    return `<div class="hm">${cols}</div>`;
  }

  function habitRowHtml(h, today) {
    const cs = Store.habitEngine.currentStreak(h);
    const bs = Store.habitEngine.bestStreak(h);
    const rate = Store.habitEngine.rate(h, 30);
    const total = Store.habitEngine.totalDone(h);
    return `<div class="hmrow">
      <div class="hmhead">
        <strong>${UI.esc(h.name)}</strong>
        <div class="row tight">
          <span class="pill accent">🔥 ${cs.n} ${cs.unit} streak</span>
          <span class="pill">Best ${bs} ${cs.unit}</span>
          <span class="pill ${rate.pct >= 70 ? 'good' : ''}">${rate.pct}% / 30d</span>
          <span class="pill">${total} total</span>
        </div>
      </div>
      ${habitHeatmap(h, today)}
    </div>`;
  }

  function habitSectionHtml() {
    const habits = Store.habitEngine.active();
    if (!habits.length) {
      return `<div class="empty"><b>No habits yet</b>Create a habit to start tracking streaks.</div>`;
    }
    const today = D.today();
    const dueToday = habits.filter(h => Store.habitEngine.isDue(h, today));
    const doneToday = dueToday.filter(h => Store.habitEngine.isDone(h, today));
    const todayPct = dueToday.length ? Math.round(doneToday.length / dueToday.length * 100) : 0;
    const streaks = habits.map(h => Store.habitEngine.currentStreak(h));
    const longest = streaks.reduce((best, s) => s.n > best.n ? s : best, { n: 0, unit: 'days' });
    const avgRate = Math.round(habits.reduce((sum, h) => sum + Store.habitEngine.rate(h, 30).pct, 0) / habits.length);
    const totalCheckins = habits.reduce((sum, h) => sum + Store.habitEngine.totalDone(h), 0);

    const stats = `<div class="stats">
      <div class="card stat"><div class="k">Today's completion</div><div class="v">${todayPct}%</div><div class="n">${doneToday.length}/${dueToday.length} done</div></div>
      <div class="card stat"><div class="k">Longest active streak</div><div class="v">${longest.n}</div><div class="n">${longest.unit}</div></div>
      <div class="card stat"><div class="k">Avg 30-day consistency</div><div class="v">${avgRate}%</div><div class="n">across ${habits.length} habit${habits.length === 1 ? '' : 's'}</div></div>
      <div class="card stat"><div class="k">Total check-ins</div><div class="v">${totalCheckins}</div><div class="n">all-time</div></div>
    </div>`;

    return stats + habits.map(h => habitRowHtml(h, today)).join('');
  }

  /* ---------- Section 2: progress tracker ---------- */
  function progressRowHtml(name, prog, label) {
    return `<div style="padding:9px 0;border-bottom:1px solid var(--line)">
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <strong style="font-size:13.5px">${UI.esc(name)}</strong>
        <span class="sub" style="margin:0">${UI.esc(label)}</span>
      </div>
      <div class="progressbar"><i style="width:${prog.pct}%"></i></div>
    </div>`;
  }

  function projectsListHtml() {
    const projects = Store.list('projects').filter(p => p.status !== 'done');
    if (!projects.length) return `<div class="empty" style="padding:14px">No active projects yet.</div>`;
    return projects.map(p => {
      const prog = Store.link.projectProgress(p.id);
      return progressRowHtml(p.name, prog, `${prog.done}/${prog.total}`);
    }).join('');
  }

  function goalsListHtml() {
    const goals = Store.list('goals').filter(g => g.status !== 'done');
    if (!goals.length) return `<div class="empty" style="padding:14px">No active goals yet.</div>`;
    return goals.map(g => {
      const prog = Store.link.goalProgress(g);
      return progressRowHtml(g.name, prog, prog.label);
    }).join('');
  }

  /* ---------- Section 3: tasks completed, last 7 days ---------- */
  function taskChartHtml() {
    const allTasks = Store.list('tasks', { includeArchived: true });
    if (!allTasks.length) return `<div class="empty"><b>No tasks yet</b>Complete some tasks to see this chart.</div>`;
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(D.addDays(D.today(), -i));
    const counts = days.map(d => {
      const k = D.key(d);
      return allTasks.filter(t => t.completedAt && D.key(new Date(t.completedAt)) === k).length;
    });
    const max = Math.max(1, ...counts);
    const bars = counts.map(c => {
      const pct = c === 0 ? 4 : Math.max(6, Math.round(c / max * 100));
      return `<div class="bar" style="height:${pct}%"><span>${c}</span></div>`;
    }).join('');
    const labels = days.map(d => `<span>${D.DAYS[d.getDay()]}</span>`).join('');
    return `<div class="chart">${bars}</div><div class="chart-labels">${labels}</div>`;
  }

  /* ---------- render ---------- */
  function render(container) {
    container.innerHTML = `
      <div class="page-head">
        <div><h1>Review Hub</h1><div class="sub">Streak history, progress rollups, and completion trends</div></div>
      </div>

      <section class="card" style="margin-bottom:18px">
        <div class="card-h"><h2>Habit history</h2><button class="btn sm" data-goto="habits">Open Habits ${UI.icon('arrowRight')}</button></div>
        <div class="card-b" id="reviewHabits"></div>
      </section>

      <section class="card" style="margin-bottom:18px">
        <div class="card-h"><h2>Progress tracker</h2></div>
        <div class="card-b grid2">
          <div>
            <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
              <h3>Projects</h3><button class="btn sm ghost" data-goto="projects">Open Projects ${UI.icon('arrowRight')}</button>
            </div>
            <div id="reviewProjects"></div>
          </div>
          <div>
            <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
              <h3>Goals</h3><button class="btn sm ghost" data-goto="goals">Open Goals ${UI.icon('arrowRight')}</button>
            </div>
            <div id="reviewGoals"></div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-h"><h2>Tasks completed &mdash; last 7 days</h2></div>
        <div class="card-b" id="reviewChart"></div>
      </section>
    `;

    container.querySelector('#reviewHabits').innerHTML = habitSectionHtml();
    container.querySelector('#reviewProjects').innerHTML = projectsListHtml();
    container.querySelector('#reviewGoals').innerHTML = goalsListHtml();
    container.querySelector('#reviewChart').innerHTML = taskChartHtml();

    container.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => App.go(b.dataset.goto));
  }

  window.Pages.review = { render };
})();
