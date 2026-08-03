'use strict';
/* Notes, Resources & Books — a searchable/tag-filterable knowledge base with
   a two-pane editor (list left, editor right, .notes-wrap). Supports
   [[Wikilinks]] (auto-create on click-through), #tags, and backlinks via
   Store.notesEngine. Journal entries (notes with a non-null .daily) are
   created from the Habits & Journal page and are excluded here. */
(function () {
  const D = Store.date;
  const NE = Store.notesEngine;

  /* ---------- page-local UI state (persists across nav within this session) ---------- */
  let selId = null;
  let previewMode = false;
  let query = '';
  let activeTag = null;

  /* ---------- debounced autosave (merges title/body/url/author edits per note) ---------- */
  let pending = null; // { id, patch, timer }
  function scheduleSave(id, patch) {
    if (pending && pending.id === id) {
      Object.assign(pending.patch, patch);
    } else {
      flushPending();
      pending = { id, patch: Object.assign({}, patch), timer: null };
    }
    clearTimeout(pending.timer);
    pending.timer = setTimeout(flushPending, 350);
  }
  function flushPending() {
    if (!pending) return;
    const p = pending; pending = null;
    Store.update('notes', p.id, p.patch);
  }

  function typeEmoji(t) { return t === 'book' ? '📕' : t === 'resource' ? '🔗' : '📝'; }

  function computeList() {
    let items = Store.list('notes').filter(n => !n.daily);
    if (activeTag) items = items.filter(n => NE.tagsOf(n).includes(activeTag));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(n => (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q));
    }
    return items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /* ---------- left column ---------- */
  function renderTagRow(container) {
    const row = container.querySelector('#tagRow');
    if (!row) return;
    const tags = NE.allTags();
    let html = tags.map(([t, c]) => `<span class="tag ${activeTag === t ? 'on' : ''}" data-tag="${UI.esc(t)}">#${UI.esc(t)} · ${c}</span>`).join('');
    if (activeTag) html += `<span class="tag" data-tag="__clear__">Clear ×</span>`;
    row.innerHTML = html;
    row.querySelectorAll('[data-tag]').forEach(el => el.onclick = () => {
      const t = el.dataset.tag;
      activeTag = (t === '__clear__') ? null : (activeTag === t ? null : t);
      renderTagRow(container);
      renderList(container);
    });
  }

  function renderList(container) {
    const list = container.querySelector('#noteList');
    if (!list) return;
    const items = computeList();
    list.innerHTML = items.length ? items.map(n => `
      <button class="noteitem ${n.id === selId ? 'active' : ''}" data-id="${n.id}">
        <div class="t">${typeEmoji(n.type)} ${UI.esc(n.title || 'Untitled')}${Store.state.settings.motivationNoteId === n.id ? ' <span class="pill accent">🌅 Morning read</span>' : ''}</div>
        <div class="p">${UI.esc((n.body || '').replace(/\s+/g, ' ').trim()) || 'No content yet.'}</div>
        <div class="m">${D.relTime(n.updatedAt)}</div>
      </button>`).join('') :
      `<div class="empty"><b>No notes</b>${activeTag || query.trim() ? 'Nothing matches your filter.' : 'Create your first note, resource, or book.'}</div>`;
    list.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
      if (b.dataset.id === selId) return;
      flushPending();
      selId = b.dataset.id;
      renderList(container);
      renderEditor(container);
    });
  }

  /* ---------- right column (editor) ---------- */
  function typeExtraHtml(n) {
    if (n.type === 'resource') {
      return `<label class="fld"><span>URL</span><input type="url" id="fUrl" value="${UI.esc(n.url || '')}" placeholder="https://…"></label>`;
    }
    if (n.type === 'book') {
      return `<label class="fld"><span>Author</span><input type="text" id="fAuthor" value="${UI.esc(n.author || '')}" placeholder="Author name"></label>
        <div class="fld"><span>Rating</span><div id="fStars">${UI.starRating(n.rating, 5)}</div></div>`;
    }
    return '';
  }

  function bodyHtml(n) {
    if (previewMode) return `<div class="preview" id="fPreview">${NE.md(n.body)}</div>`;
    return `<textarea class="editor" id="fBody" placeholder="Write in Markdown… use #tags and [[Wikilinks]]">${UI.esc(n.body || '')}</textarea>`;
  }

  function renderEditor(container) {
    const card = container.querySelector('#editorCard');
    if (!card) return;
    const n = selId ? Store.get('notes', selId) : null;
    if (!n) {
      card.innerHTML = `<div class="empty"><b>No note selected</b>Pick a note on the left, or create a new one.</div>`;
      return;
    }
    const areas = Store.list('areas'), projects = Store.list('projects');
    const backlinks = NE.backlinksTo(n);

    card.innerHTML = `
      <div class="card-h">
        <input type="text" class="title-in" id="fTitle" placeholder="Untitled" value="${UI.esc(n.title)}" style="flex:1;min-width:0">
        <div class="row tight" style="flex:0 0 auto">
          <button class="btn sm ${Store.state.settings.motivationNoteId === n.id ? 'primary' : 'ghost'}" id="btnMorning" title="Show this note as a once-a-day popup when the app first opens">🌅 ${Store.state.settings.motivationNoteId === n.id ? 'Morning read ✓' : 'Set as morning read'}</button>
          <button class="btn sm ghost" id="btnPreview">${previewMode ? 'Edit' : 'Preview'}</button>
          <button class="btn sm danger" id="btnDelete">Delete</button>
        </div>
      </div>
      <div class="card-b">
        <div class="grid2f">
          <label class="fld"><span>Type</span><select id="fType">
            <option value="note" ${n.type === 'note' ? 'selected' : ''}>Note</option>
            <option value="resource" ${n.type === 'resource' ? 'selected' : ''}>Resource</option>
            <option value="book" ${n.type === 'book' ? 'selected' : ''}>Book</option>
          </select></label>
          <div id="fTypeExtra">${typeExtraHtml(n)}</div>
        </div>
        <div class="grid2f">
          <label class="fld"><span>Area</span><select id="fArea">${UI.optionsHtml(areas, n.areaId, { noneLabel: 'No area' })}</select></label>
          <label class="fld"><span>Project</span><select id="fProject">${UI.optionsHtml(projects, n.projectId, { noneLabel: 'No project' })}</select></label>
        </div>
        <div id="fBodyWrap">${bodyHtml(n)}</div>
        <div class="backlinks">
          <h3>Linked from ${backlinks.length} note${backlinks.length === 1 ? '' : 's'}</h3>
          ${backlinks.length ? backlinks.map(b => `
            <div class="kv" data-backlink="${b.id}" style="cursor:pointer">
              <span class="k">${typeEmoji(b.type)} ${UI.esc(b.title || 'Untitled')}</span><span>${D.relTime(b.updatedAt)}</span>
            </div>`).join('') : `<div class="sub" style="margin:0">No notes link here yet. Use [[${UI.esc(n.title || 'Note Title')}]] in another note.</div>`}
        </div>
      </div>`;
    wireEditor(container, n);
  }

  function wireEditor(container, n) {
    const card = container.querySelector('#editorCard');
    const q = sel => card.querySelector(sel);

    q('#fTitle').oninput = (e) => {
      const val = e.target.value;
      const t = container.querySelector(`.noteitem[data-id="${n.id}"] .t`);
      if (t) t.textContent = `${typeEmoji(n.type)} ${val || 'Untitled'}`;
      scheduleSave(n.id, { title: val });
    };

    q('#fType').onchange = (e) => {
      flushPending();
      Store.update('notes', n.id, { type: e.target.value });
      renderTagRow(container); renderList(container); renderEditor(container);
    };

    q('#fArea').onchange = (e) => { flushPending(); Store.update('notes', n.id, { areaId: e.target.value || null }); };
    q('#fProject').onchange = (e) => { flushPending(); Store.update('notes', n.id, { projectId: e.target.value || null }); };

    const urlEl = q('#fUrl');
    if (urlEl) urlEl.oninput = (e) => scheduleSave(n.id, { url: e.target.value });
    const authorEl = q('#fAuthor');
    if (authorEl) authorEl.oninput = (e) => scheduleSave(n.id, { author: e.target.value });
    const starsWrap = q('#fStars');
    if (starsWrap) starsWrap.querySelectorAll('[data-star]').forEach(s => s.onclick = () => {
      flushPending();
      Store.update('notes', n.id, { rating: +s.dataset.star });
      renderEditor(container);
    });

    q('#btnMorning').onclick = () => {
      const isSet = Store.state.settings.motivationNoteId === n.id;
      Store.state.settings.motivationNoteId = isSet ? null : n.id;
      Store.save();
      UI.toast(isSet ? 'No longer your morning read' : 'Set as your morning read — it\'ll pop up once a day, first thing');
      renderList(container);
      renderEditor(container);
    };
    q('#btnPreview').onclick = () => {
      flushPending();
      previewMode = !previewMode;
      renderEditor(container);
    };
    q('#btnDelete').onclick = async () => {
      if (!(await UI.confirm(`Delete "${n.title || 'Untitled'}"? This can't be undone.`))) return;
      pending = null;
      Store.remove('notes', n.id);
      selId = null;
      render(container);
    };

    const bodyEl = q('#fBody');
    if (bodyEl) bodyEl.oninput = (e) => {
      const val = e.target.value;
      const p = container.querySelector(`.noteitem[data-id="${n.id}"] .p`);
      if (p) p.textContent = val.replace(/\s+/g, ' ').trim() || 'No content yet.';
      scheduleSave(n.id, { body: val });
    };

    const previewEl = q('#fPreview');
    if (previewEl) {
      previewEl.querySelectorAll('a.wiki').forEach(a => a.onclick = (e) => {
        e.preventDefault();
        flushPending();
        const title = a.dataset.wiki;
        let target = NE.noteByTitle(title);
        let created = false;
        if (!target) {
          target = Store.add('notes', { title, body: '', type: 'note', url: '', author: '', rating: null, areaId: null, projectId: null, daily: null });
          created = true;
        }
        selId = target.id;
        if (created) previewMode = false;
        renderTagRow(container); renderList(container); renderEditor(container);
      });
      previewEl.querySelectorAll('a.tag').forEach(a => a.onclick = (e) => {
        e.preventDefault();
        const t = a.dataset.tag;
        activeTag = (activeTag === t) ? null : t;
        renderTagRow(container); renderList(container);
      });
    }

    card.querySelectorAll('[data-backlink]').forEach(row => row.onclick = () => {
      flushPending();
      selId = row.dataset.backlink;
      renderTagRow(container); renderList(container); renderEditor(container);
    });
  }

  /* ---------- page shell ---------- */
  function render(container) {
    if (selId && !Store.get('notes', selId)) selId = null;
    const count = Store.list('notes').filter(n => !n.daily).length;

    container.innerHTML = `
      <div class="page-head">
        <div><h1>Notes, Resources &amp; Books</h1><div class="sub">${count} saved</div></div>
        <button class="btn primary" id="newNote">${UI.icon('plus')} New note</button>
      </div>
      <div class="notes-wrap">
        <section class="card">
          <div style="padding:12px 14px 0"><input type="text" id="noteSearch" placeholder="Search title or body…" value="${UI.esc(query)}"></div>
          <div class="tagrow" id="tagRow"></div>
          <div class="notelist" id="noteList"></div>
        </section>
        <section class="card" id="editorCard"></section>
      </div>`;

    container.querySelector('#newNote').onclick = () => {
      flushPending();
      const n = Store.add('notes', { title: '', body: '', type: 'note', url: '', author: '', rating: null, areaId: null, projectId: null, daily: null });
      selId = n.id; previewMode = false;
      render(container);
    };

    const search = container.querySelector('#noteSearch');
    let sTimer;
    search.oninput = () => {
      clearTimeout(sTimer);
      sTimer = setTimeout(() => { query = search.value; renderList(container); }, 250);
    };

    renderTagRow(container);
    renderList(container);
    renderEditor(container);
  }

  window.Pages.notes = { render };
})();
