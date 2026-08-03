'use strict';
(function () {
/* =========================================================================
   Second Brain — data store (window.Store)
   =========================================================================
   Unified PARA-ish schema. Every page module (js/pages/*.js) reads and
   writes through this file only — never touch localStorage directly.

   Collections (all plain arrays of plain objects, all share id/createdAt/
   updatedAt/archived unless noted):
     areas      {id,name,emoji,color,description,archived,createdAt,updatedAt}
     projects   {id,name,areaId,status('active'|'onhold'|'done'),description,
                 dueDate('YYYY-MM-DD'|null),archived,createdAt,updatedAt}
     goals      {id,name,description,areaId,projectId,targetDate,
                 metric('milestone'|'numeric'|'tasks'),targetValue,currentValue,
                 status('active'|'done'),archived,createdAt,updatedAt}
     tasks      {id,text,notes,areaId,projectId,goalId,dueDate('YYYY-MM-DD'|null),
                 priority('low'|'normal'|'high'),status('todo'|'doing'|'done'),
                 tags[],recurring(null|{type:'daily'|'weekly'|'weekdays',days[]}),
                 archived,createdAt,updatedAt,completedAt}
     habits     {id,name,schedule({type:'daily'}|{type:'weekdays',days[]}|
                 {type:'weekly',times}),areaId,archived,createdAt}
     completions{ [habitId]: { 'YYYY-MM-DD': 1 } }   -- not archivable, keyed map
     notes      {id,title,body,type('note'|'resource'|'book'),url,author,rating,
                 areaId,projectId,daily('YYYY-MM-DD'|null),archived,createdAt,updatedAt}
     ideas      {id,text,tags[],status('new'|'exploring'|'promoted'),areaId,
                 archived,createdAt,updatedAt}
     watchlist  {id,title,type('movie'|'show'|'book'|'game'),
                 status('want'|'in_progress'|'finished'),rating(0-5|null),notes,
                 archived,createdAt,updatedAt}
     contacts   {id,name,relation,email,phone,areaId,tags[],notes,
                 lastContact('YYYY-MM-DD'|null),followUpDate('YYYY-MM-DD'|null),
                 archived,createdAt,updatedAt}
     smartViews {id,collection,name,filters{},search,sort,viewType,createdAt}
                 -- written by js/viewengine.js, but lives in the same store so
                 export/import carries it along.
     profile    {name,emoji,bio,mission}            -- single object, not an array
     settings   {theme:'system'|'light'|'dark'}

   Generic CRUD (works for every array collection above):
     Store.list(collection, {includeArchived}) -> array
     Store.get(collection, id) -> item | undefined
     Store.add(collection, obj) -> item (fills id/createdAt/updatedAt/archived)
     Store.update(collection, id, patch) -> item | null
     Store.remove(collection, id)                 -- hard delete
     Store.archive(collection, id) / Store.restore(collection, id)

   Whole-state import/wipe (js/pages/data.js): NEVER do `Store.state = x`.
     Store.replaceState(newData) -- validate shape first, then call this
     Store.resetState()          -- wipes everything back to blank

   Store.onChange(fn) -- fn(state) fires after every debounced local save.
     Used by the optional js/sync.js layer to push to a remote store; store.js
     stays unaware of where (or whether) anything syncs.

   Namespaces:
     Store.date       - date helpers (today, key, parseKey, addDays, ...)
     Store.habitEngine - streak/schedule logic for habits
     Store.notesEngine - tags/backlinks/markdown for notes
     Store.link        - cross-collection rollups (project progress, area summary)
     Store.taskEngine   - task completion + recurrence

   Store.uid() -> short random id string
   Store.save() -> debounced localStorage persist (call after direct mutation
                   of Store.state if you ever bypass the CRUD helpers, e.g. for
                   the completions map)
   Store.state -> the live state object (read directly when convenient; the
                  array identities stay stable across renders)
   ========================================================================= */

const STORAGE_KEY = 'secondbrain.v2';
const LEGACY_KEY = 'secondbrain.v1';

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

function blankState() {
  return {
    version: 2,
    profile: { name: '', emoji: '🧠', bio: '', mission: '' },
    areas: [], projects: [], goals: [], tasks: [],
    habits: [], completions: {},
    notes: [], ideas: [], watchlist: [], contacts: [], smartViews: [],
    settings: { theme: 'system' }
  };
}

function migrateFromV1(old) {
  const s = blankState();
  s.habits = old.habits || [];
  s.completions = old.completions || {};
  s.notes = (old.notes || []).map(n => Object.assign({
    type: 'note', url: '', author: '', rating: null, areaId: null, projectId: null, archived: false
  }, n));
  s.tasks = (old.tasks || []).map(t => ({
    id: t.id, text: t.text, notes: '', areaId: null, projectId: null, goalId: null,
    dueDate: t.date || null, priority: 'normal', status: t.done ? 'done' : 'todo',
    tags: [], recurring: null, archived: false,
    createdAt: t.createdAt || Date.now(), updatedAt: t.createdAt || Date.now(),
    completedAt: t.done ? (t.createdAt || Date.now()) : null
  }));
  if (old.settings) s.settings = Object.assign(s.settings, old.settings);
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(blankState(), JSON.parse(raw));
  } catch (e) { console.warn('Second Brain: v2 state failed to parse, starting fresh', e); }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return migrateFromV1(JSON.parse(legacy));
  } catch (e) { console.warn('Second Brain: legacy state failed to parse', e); }
  return blankState();
}

const state = loadState();

// Fired after every successful local save, with the live state object.
// Lets an optional layer (js/sync.js) push changes to a remote store without
// store.js knowing anything about where that layer sends them.
const changeListeners = [];
function onChange(fn) { changeListeners.push(fn); }
function notifyChange() { changeListeners.forEach(fn => { try { fn(state); } catch (e) { console.error('Second Brain: onChange listener threw', e); } }); }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notifyChange();
    }
    catch (e) { console.error('Second Brain: save failed', e); if (window.UI) UI.toast('Could not save — storage full?'); }
  }, 120);
}

const ARRAY_COLLECTIONS = ['areas', 'projects', 'goals', 'tasks', 'habits', 'notes', 'ideas', 'watchlist', 'contacts', 'smartViews'];

function list(collection, opts) {
  opts = opts || {};
  const arr = state[collection] || [];
  return opts.includeArchived ? arr.slice() : arr.filter(x => !x.archived);
}
function get(collection, id) { return (state[collection] || []).find(x => x.id === id); }
function add(collection, obj) {
  const item = Object.assign({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), archived: false }, obj);
  state[collection].push(item);
  save();
  return item;
}
function update(collection, id, patch) {
  const item = get(collection, id);
  if (!item) return null;
  Object.assign(item, patch, { updatedAt: Date.now() });
  save();
  return item;
}
function remove(collection, id) {
  state[collection] = state[collection].filter(x => x.id !== id);
  if (collection === 'habits') delete state.completions[id];
  save();
}
function archive(collection, id) { return update(collection, id, { archived: true }); }
function restore(collection, id) { return update(collection, id, { archived: false }); }

/* =========================================================================
   Dates — local time, week starts Monday
   ========================================================================= */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const today = () => startOfDay(new Date());
const startOfWeek = d => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a, b) => dkey(a) === dkey(b);
function humanDate(d) {
  const t = today(), diff = Math.round((startOfDay(d) - t) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
function shortDate(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function relTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function isOverdue(dateKeyStr) { return !!dateKeyStr && parseKey(dateKeyStr) < today(); }

const DateUtil = { DAYS, key: dkey, parseKey, addDays, startOfDay, today, startOfWeek, sameDay, humanDate, shortDate, relTime, isOverdue };

/* =========================================================================
   Habit engine — schedules, streaks
   ========================================================================= */
function isDue(habit, d) {
  const s = habit.schedule || { type: 'daily' };
  if (s.type === 'weekdays') return (s.days || []).includes(d.getDay());
  return true;
}
function isDone(habit, d) { return !!(state.completions[habit.id] || {})[dkey(d)]; }
function toggleCompletion(habit, d) {
  const map = state.completions[habit.id] || (state.completions[habit.id] = {});
  const k = dkey(d);
  if (map[k]) delete map[k]; else map[k] = 1;
  save();
}
function scheduleLabel(h) {
  const s = h.schedule || { type: 'daily' };
  if (s.type === 'daily') return 'Every day';
  if (s.type === 'weekly') return `${s.times}× per week`;
  const days = (s.days || []).slice().sort();
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '0,6') return 'Weekends';
  return days.map(i => DAYS[i]).join(', ') || 'No days set';
}
function weekCount(habit, weekStart) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(habit, addDays(weekStart, i))) n++;
  return n;
}
function currentStreak(habit) {
  const born = startOfDay(new Date(habit.createdAt));
  if (habit.schedule && habit.schedule.type === 'weekly') {
    const need = habit.schedule.times || 1;
    let w = startOfWeek(today()), n = 0;
    if (weekCount(habit, w) >= need) n++;
    w = addDays(w, -7);
    while (addDays(w, 6) >= startOfWeek(born) && weekCount(habit, w) >= need) { n++; w = addDays(w, -7); }
    return { n, unit: n === 1 ? 'week' : 'weeks' };
  }
  let d = today();
  if (isDue(habit, d) && !isDone(habit, d)) d = addDays(d, -1);
  let n = 0, guard = 0;
  while (d >= born && guard++ < 4000) {
    if (isDue(habit, d)) { if (isDone(habit, d)) n++; else break; }
    d = addDays(d, -1);
  }
  return { n, unit: n === 1 ? 'day' : 'days' };
}
function bestStreak(habit) {
  const born = startOfDay(new Date(habit.createdAt));
  if (habit.schedule && habit.schedule.type === 'weekly') {
    const need = habit.schedule.times || 1;
    let best = 0, run = 0;
    for (let w = startOfWeek(born); w <= startOfWeek(today()); w = addDays(w, 7)) {
      if (weekCount(habit, w) >= need) { run++; best = Math.max(best, run); } else run = 0;
    }
    return best;
  }
  let best = 0, run = 0;
  for (let d = born; d <= today(); d = addDays(d, 1)) {
    if (!isDue(habit, d)) continue;
    if (isDone(habit, d)) { run++; best = Math.max(best, run); } else run = 0;
  }
  return best;
}
function habitRate(habit, span) {
  span = span || 30;
  const born = startOfDay(new Date(habit.createdAt));
  let due = 0, hit = 0;
  for (let i = span - 1; i >= 0; i--) {
    const d = addDays(today(), -i);
    if (d < born) continue;
    if (habit.schedule && habit.schedule.type === 'weekly') { due++; if (isDone(habit, d)) hit++; continue; }
    if (!isDue(habit, d)) continue;
    due++; if (isDone(habit, d)) hit++;
  }
  return { due, hit, pct: due ? Math.round(hit / due * 100) : 0 };
}
function totalDone(habit) { return Object.keys(state.completions[habit.id] || {}).length; }
function activeHabits() { return list('habits'); }

const HabitEngine = {
  isDue, isDone, toggle: toggleCompletion, scheduleLabel, weekCount,
  currentStreak, bestStreak, rate: habitRate, totalDone, active: activeHabits
};

/* =========================================================================
   Notes engine — tags, wikilinks, backlinks, tiny markdown renderer
   ========================================================================= */
const TAG_RE = /(^|[\s(])#([a-z0-9][\w/-]*)/gi;
function tagsOf(note) {
  const out = new Set(); let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(note.body || '')) !== null) out.add(m[2].toLowerCase());
  return [...out];
}
function allTags() {
  const c = {};
  state.notes.forEach(n => { if (!n.archived) tagsOf(n).forEach(t => c[t] = (c[t] || 0) + 1); });
  return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function linksOf(note) {
  const out = new Set(); const re = /\[\[([^\]]+)\]\]/g; let m;
  while ((m = re.exec(note.body || '')) !== null) out.add(m[1].trim().toLowerCase());
  return [...out];
}
function backlinksTo(note) {
  const t = (note.title || '').trim().toLowerCase();
  if (!t) return [];
  return state.notes.filter(n => n.id !== note.id && !n.archived && linksOf(n).includes(t));
}
function noteByTitle(title) {
  const t = title.trim().toLowerCase();
  return state.notes.find(n => (n.title || '').trim().toLowerCase() === t);
}
function dailyNote(dateKeyStr, create) {
  let n = state.notes.find(x => x.daily === dateKeyStr);
  if (!n && create) {
    n = add('notes', { title: 'Daily — ' + dateKeyStr, body: '', type: 'note', daily: dateKeyStr, areaId: null, projectId: null });
  }
  return n;
}
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, t) => {
    const title = t.trim(), hit = noteByTitle(title);
    return `<a href="#" class="wiki${hit ? '' : ' missing'}" data-wiki="${esc(title)}">${esc(title)}</a>`;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|\s)#([a-z0-9][\w/-]*)/gi, (_, p, t) => `${p}<a href="#" class="tag" data-tag="${esc(t.toLowerCase())}">#${esc(t)}</a>`);
  return s;
}
function md(src) {
  const lines = String(src || '').split('\n');
  let out = '', listType = null, code = false, buf = [];
  const closeList = () => { if (listType) { out += `</${listType}>`; listType = null; } };
  for (const raw of lines) {
    if (/^```/.test(raw)) {
      if (code) { out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; buf = []; code = false; }
      else { closeList(); code = true; }
      continue;
    }
    if (code) { buf.push(raw); continue; }
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { closeList(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if (/^>\s?/.test(line)) { closeList(); out += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`; continue; }
    if ((m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))) {
      if (listType !== 'ul') { closeList(); out += '<ul>'; listType = 'ul'; }
      const on = m[1].toLowerCase() === 'x';
      out += `<li style="list-style:none;margin-left:-1.1em">${on ? '☑' : '☐'} <span${on ? ' style="opacity:.55;text-decoration:line-through"' : ''}>${inline(m[2])}</span></li>`;
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (listType !== 'ul') { closeList(); out += '<ul>'; listType = 'ul'; }
      out += `<li>${inline(m[1])}</li>`; continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      if (listType !== 'ol') { closeList(); out += '<ol>'; listType = 'ol'; }
      out += `<li>${inline(m[1])}</li>`; continue;
    }
    closeList();
    out += `<p>${inline(line)}</p>`;
  }
  if (code && buf.length) out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
  closeList();
  return out || '<p style="color:var(--faint)">Nothing here yet.</p>';
}
const NotesEngine = { tagsOf, allTags, linksOf, backlinksTo, noteByTitle, dailyNote, md, inline, esc };

/* =========================================================================
   Cross-collection rollups (the "linked databases" glue)
   ========================================================================= */
function itemsLinkedToArea(areaId) {
  return {
    projects: state.projects.filter(x => x.areaId === areaId && !x.archived),
    goals: state.goals.filter(x => x.areaId === areaId && !x.archived),
    tasks: state.tasks.filter(x => x.areaId === areaId && !x.archived),
    habits: state.habits.filter(x => x.areaId === areaId && !x.archived),
    notes: state.notes.filter(x => x.areaId === areaId && !x.archived),
    contacts: state.contacts.filter(x => x.areaId === areaId && !x.archived),
    ideas: state.ideas.filter(x => x.areaId === areaId && !x.archived)
  };
}
function itemsLinkedToProject(projectId) {
  return {
    tasks: state.tasks.filter(x => x.projectId === projectId && !x.archived),
    goals: state.goals.filter(x => x.projectId === projectId && !x.archived),
    notes: state.notes.filter(x => x.projectId === projectId && !x.archived)
  };
}
function projectProgress(projectId) {
  const tasks = state.tasks.filter(t => t.projectId === projectId && !t.archived);
  const done = tasks.filter(t => t.status === 'done').length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}
function goalProgress(goal) {
  if (goal.metric === 'tasks') {
    const tasks = state.tasks.filter(t => t.goalId === goal.id && !t.archived);
    const done = tasks.filter(t => t.status === 'done').length;
    return { pct: tasks.length ? Math.round(done / tasks.length * 100) : 0, label: `${done}/${tasks.length} tasks` };
  }
  if (goal.metric === 'numeric') {
    const tv = Number(goal.targetValue) || 0, cv = Number(goal.currentValue) || 0;
    const pct = tv ? Math.min(100, Math.round(cv / tv * 100)) : 0;
    return { pct, label: `${cv} / ${tv}` };
  }
  const pct = goal.status === 'done' ? 100 : 0;
  return { pct, label: goal.status === 'done' ? 'Done' : 'In progress' };
}
function areaSummary(areaId) {
  const l = itemsLinkedToArea(areaId);
  return {
    projects: l.projects.length, goals: l.goals.length, tasks: l.tasks.length,
    habits: l.habits.length, notes: l.notes.length, contacts: l.contacts.length, ideas: l.ideas.length
  };
}
const Link = { itemsLinkedToArea, itemsLinkedToProject, projectProgress, goalProgress, areaSummary };

/* =========================================================================
   Task engine — completion + recurrence
   ========================================================================= */
function nextRecurringDate(task) {
  const base = task.dueDate ? parseKey(task.dueDate) : today();
  const from = base < today() ? today() : base;
  const r = task.recurring;
  if (!r) return null;
  if (r.type === 'daily') return dkey(addDays(from, 1));
  if (r.type === 'weekly') return dkey(addDays(from, 7));
  if (r.type === 'weekdays' && r.days && r.days.length) {
    let d = addDays(from, 1);
    for (let i = 0; i < 14; i++) { if (r.days.includes(d.getDay())) return dkey(d); d = addDays(d, 1); }
  }
  return null;
}
function completeTask(taskId) {
  const t = get('tasks', taskId);
  if (!t) return;
  const wasDone = t.status === 'done';
  update('tasks', taskId, { status: wasDone ? 'todo' : 'done', completedAt: wasDone ? null : Date.now() });
  if (!wasDone && t.recurring) {
    const nd = nextRecurringDate(t);
    add('tasks', {
      text: t.text, notes: t.notes, areaId: t.areaId, projectId: t.projectId, goalId: t.goalId,
      dueDate: nd, priority: t.priority, status: 'todo', tags: (t.tags || []).slice(), recurring: t.recurring
    });
  }
}
const TaskEngine = { completeTask, nextRecurringDate };

/* =========================================================================
   Public API
   ========================================================================= */
// Import/wipe MUST go through these two — never do `Store.state = x`. Page
// code only ever sees the `state` object via the `state` property below, and
// every CRUD function above closes over the same `state` variable by
// reference. Reassigning `Store.state` would repoint the public property
// while list/get/add/... keep reading the old object, silently desyncing
// the UI from what gets saved. Mutating `state`'s keys in place keeps every
// reference (including this one) pointed at the same object.
function replaceState(newData) {
  const fresh = Object.assign(blankState(), newData || {});
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, fresh);
  save();
}
function resetState() { replaceState(blankState()); }

window.Store = {
  state, uid, save,
  list, get, add, update, remove, archive, restore,
  replaceState, resetState, onChange,
  collections: ARRAY_COLLECTIONS,
  date: DateUtil,
  habitEngine: HabitEngine,
  notesEngine: NotesEngine,
  link: Link,
  taskEngine: TaskEngine
};
})();
