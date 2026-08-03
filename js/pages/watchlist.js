'use strict';
/* Watchlist — movies/shows/books/games to consume. Straightforward
   ViewEngine usage (see js/pages/tasks.js for the canonical example):
   list/board/table views over a single flat collection, plus a modal with
   a clickable star-rating row (same button-group-toggle pattern tasks.js
   uses for its weekday picker, applied to <span data-star> instead). */
(function () {
  const TYPE_EMOJI = { movie: '🎬', show: '📺', book: '📖', game: '🎮' };
  const TYPE_LABEL = { movie: 'Movie', show: 'Show', book: 'Book', game: 'Game' };
  const STATUS_OPTS = [
    { value: 'want', label: 'Want to' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'finished', label: 'Finished' }
  ];
  const STATUS_STYLE = { want: '', in_progress: 'accent', finished: 'good' };

  function statusPill(status) {
    const opt = STATUS_OPTS.find(s => s.value === status);
    return `<span class="pill ${STATUS_STYLE[status] || ''}">${UI.esc(opt ? opt.label : status)}</span>`;
  }
  // Static (non-interactive) star display for the table view — table cells
  // don't need UI.starRating's clickable data-star markup, just the look.
  function starsStatic(rating) {
    let h = '';
    for (let i = 1; i <= 5; i++) h += `<span class="star ${i <= (rating || 0) ? 'on' : ''}">★</span>`;
    return h;
  }

  function watchlistModal(main, id) {
    const w = id ? Store.get('watchlist', id) : null;
    let rating = w ? (w.rating || 0) : 0;

    const body = `
      <label class="fld"><span>Title</span>
        <input type="text" id="fTitle" value="${UI.esc(w ? w.title : '')}" placeholder="The Bear" autofocus></label>
      <div class="grid2f">
        <label class="fld"><span>Type</span><select id="fType">
          ${['movie', 'show', 'book', 'game'].map(t => `<option value="${t}" ${(w ? w.type : 'movie') === t ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}
        </select></label>
        <label class="fld"><span>Status</span><select id="fStatus">
          ${STATUS_OPTS.map(s => `<option value="${s.value}" ${(w ? w.status : 'want') === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select></label>
      </div>
      <label class="fld"><span>Rating</span><div id="fStars">${UI.starRating(rating, 5)}</div></label>
      <label class="fld"><span>Notes</span><textarea id="fNotes" style="min-height:70px">${UI.esc(w ? w.notes : '')}</textarea></label>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        ${w ? `<button class="btn danger" id="wDel">Delete</button>` : '<span></span>'}
        <button class="btn primary" id="wSave">${w ? 'Save changes' : 'Add to watchlist'}</button>
      </div>`;

    const m = UI.modal(w ? 'Edit watchlist item' : 'Add to watchlist', body);
    const q = sel => m.root.querySelector(sel);

    function paintStars() {
      const wrap = q('#fStars');
      wrap.innerHTML = UI.starRating(rating, 5);
      wrap.querySelectorAll('[data-star]').forEach(s => s.onclick = () => {
        const v = +s.dataset.star;
        rating = rating === v ? 0 : v; // click same star again to clear
        paintStars();
      });
    }
    paintStars();

    if (w) q('#wDel').onclick = async () => {
      if (!(await UI.confirm(`Delete "${w.title}"?`))) return;
      Store.remove('watchlist', w.id); m.close(); render(main);
    };
    q('#wSave').onclick = () => {
      const title = q('#fTitle').value.trim();
      if (!title) { q('#fTitle').focus(); return; }
      const patch = {
        title, type: q('#fType').value, status: q('#fStatus').value,
        rating: rating || null, notes: q('#fNotes').value
      };
      if (w) Store.update('watchlist', w.id, patch); else Store.add('watchlist', patch);
      m.close(); render(main);
    };
  }

  function renderList(main) {
    const container = main.querySelector('#watchlistView');
    const items = Store.list('watchlist');
    ViewEngine.render(container, {
      key: 'watchlist:all',
      collection: 'watchlist',
      items,
      views: ['list', 'board', 'table'],
      statusField: 'status', statusOptions: STATUS_OPTS,
      filters: [
        { key: 'type', label: 'Type', options: ['movie', 'show', 'book', 'game'].map(t => ({ value: t, label: TYPE_LABEL[t] })) }
      ],
      columns: [
        { key: 'title', label: 'Title', render: it => UI.esc(it.title) },
        { key: 'type', label: 'Type', render: it => `${TYPE_EMOJI[it.type] || ''} ${UI.esc(TYPE_LABEL[it.type] || it.type)}` },
        { key: 'status', label: 'Status', render: it => statusPill(it.status) },
        { key: 'rating', label: 'Rating', render: it => starsStatic(it.rating) }
      ],
      renderCard(it) {
        return `<div style="font-weight:540;font-size:13.5px">${TYPE_EMOJI[it.type] || ''} ${UI.esc(it.title)}</div>
          <div class="row tight" style="margin-top:6px">${UI.starRating(it.rating, 5)}</div>
          <div class="row tight" style="margin-top:6px">${statusPill(it.status)}</div>`;
      },
      emptyLabel: 'Nothing on your watchlist yet — add a movie, show, book, or game.',
      onOpen: it => watchlistModal(main, it.id)
    });
  }

  function render(main) {
    const items = Store.list('watchlist');
    main.innerHTML = `
      <div class="page-head">
        <div><h1>Watchlist</h1><div class="sub">${items.length} item${items.length === 1 ? '' : 's'} · movies, shows, books &amp; games</div></div>
        <button class="btn primary" id="newWatch">${UI.icon('plus')} Add to watchlist</button>
      </div>
      <section class="card"><div id="watchlistView"></div></section>`;
    main.querySelector('#newWatch').onclick = () => watchlistModal(main, null);
    renderList(main);
  }

  window.Pages.watchlist = { render };
})();
