'use strict';
/* Data & Settings — export/import/erase for the whole Store.state blob, plus
   a quick tally of what's stored, plus the optional cross-device Sync
   section (js/sync.js). No ViewEngine here (nothing to list), and export/
   import/erase route through Store.replaceState/resetState per the warning
   in store.js's header comment — never `Store.state = x`. */
(function () {
  const SETUP_SQL = `create table app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;
create policy "own row" on app_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter publication supabase_realtime add table app_state;`;

  let unsubscribeSync = null;

  function relOrNever(ts) { return ts ? Store.date.relTime(ts) : 'never'; }

  function syncBodyHtml(s) {
    if (s.status === 'unconfigured') {
      return `
        <p class="sub" style="margin-top:0">Connect a free <a href="https://supabase.com" target="_blank" rel="noopener">Supabase</a> project to keep this Second Brain in sync between your computer and your phone. Your data still lives locally first — this just adds a private copy in your own Supabase project that every signed-in device pulls from and pushes to.</p>
        <details style="margin-bottom:14px">
          <summary style="cursor:pointer;font-weight:560;font-size:13.5px;color:var(--accent)">Setup instructions (one-time, ~5 minutes)</summary>
          <ol style="margin:10px 0 0;padding-left:20px;font-size:13.5px;color:var(--muted);line-height:1.9">
            <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> and wait for it to finish setting up (~2 min).</li>
            <li>Open <strong>SQL Editor</strong> in your project, paste the snippet below, and run it.</li>
            <li>Click the <strong>Connect</strong> button near the top of your project's dashboard — it shows your <strong>Project URL</strong> and a key together. (No Connect button? The URL is under <strong>Integrations → Data API</strong>; the key is under <strong>Settings → API Keys</strong> — grab the <strong>anon</strong> key, or a <strong>Publishable key</strong> (starts <code>sb_publishable_...</code>) if that's what you're shown. Either works here.)</li>
            <li>Paste the URL and key into the fields below and click Connect.</li>
          </ol>
          <div style="position:relative;margin-top:10px">
            <pre style="background:var(--panel-2);padding:12px;border-radius:10px;overflow:auto;font-size:12px;white-space:pre-wrap" id="setupSql">${UI.esc(SETUP_SQL)}</pre>
            <button class="btn sm ghost" id="copySql" style="position:absolute;top:8px;right:8px">Copy</button>
          </div>
        </details>
        <label class="fld"><span>Supabase Project URL</span><input type="text" id="fUrl" placeholder="https://xxxxxxxx.supabase.co"></label>
        <label class="fld"><span>Supabase anon public key</span><input type="text" id="fKey" placeholder="eyJhbGciOi..."></label>
        <button class="btn primary" id="btnConnect">Connect</button>`;
    }
    if (s.status === 'connecting') {
      return `<p class="sub" style="margin:0">Connecting…</p>`;
    }
    if (s.status === 'signed-out') {
      return `
        <p class="sub" style="margin-top:0">Sign in with the same email on every device you want synced.</p>
        <label class="fld"><span>Email</span><input type="text" id="fEmail" placeholder="you@example.com"></label>
        <label class="fld"><span>Password</span><input type="text" id="fPass" placeholder="••••••••"></label>
        <div class="row"><button class="btn primary" id="btnSignIn">Sign in</button><button class="btn" id="btnSignUp">Create account</button></div>
        <p class="sub" id="authMsg" style="min-height:1.2em"></p>
        <button class="btn ghost sm" id="btnForget" style="margin-top:8px">Forget this connection</button>`;
    }
    if (s.status === 'needs-choice') {
      return `
        <div class="empty" style="padding:16px 4px;text-align:left">
          <b style="display:block;margin-bottom:6px">This device and the cloud both have data</b>
          This device has its own data, and your Supabase account already has a synced copy from ${UI.esc(relOrNever(s.remoteUpdatedAt ? new Date(s.remoteUpdatedAt).getTime() : null))}. Pick which one to keep — the other will be replaced.
        </div>
        <div class="row">
          <button class="btn primary" id="btnKeepLocal">Keep this device's data</button>
          <button class="btn" id="btnKeepRemote">Use the cloud data</button>
        </div>`;
    }
    const statusLine = {
      syncing: '⏳ Syncing…',
      synced: `✓ Synced ${relOrNever(s.lastSyncedAt)}`,
      offline: '📴 Offline — will sync when you\'re back online',
      error: `⚠ ${UI.esc(s.error || 'Sync error')}`
    }[s.status] || s.status;
    return `
      <div class="kv"><span class="k">Account</span><span>${UI.esc(s.email || '')}</span></div>
      <div class="kv"><span class="k">Status</span><span>${statusLine}</span></div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="btnSyncNow">Sync now</button>
        <button class="btn ghost" id="btnSignOut">Sign out</button>
        <button class="btn ghost" id="btnForget" style="color:var(--danger)">Disconnect</button>
      </div>`;
  }

  function renderSyncSection(el) {
    const s = Sync.getState();
    el.innerHTML = `<div class="card-h"><h2>Sync across devices</h2></div><div class="card-b">${syncBodyHtml(s)}</div>`;
    wireSyncSection(el, s);
  }

  function wireSyncSection(el, s) {
    const q = sel => el.querySelector(sel);
    const copyBtn = q('#copySql');
    if (copyBtn) copyBtn.onclick = () => {
      navigator.clipboard.writeText(SETUP_SQL).then(() => UI.toast('SQL copied')).catch(() => UI.toast('Could not copy — select and copy manually'));
    };
    const connectBtn = q('#btnConnect');
    if (connectBtn) connectBtn.onclick = () => {
      const url = q('#fUrl').value.trim();
      const key = q('#fKey').value.trim();
      if (!url || !key) { UI.toast('Paste both the URL and the anon key'); return; }
      Sync.configure(url, key);
    };
    const signInBtn = q('#btnSignIn');
    if (signInBtn) signInBtn.onclick = async () => {
      const email = q('#fEmail').value.trim(), pass = q('#fPass').value;
      if (!email || !pass) { q('#authMsg').textContent = 'Enter an email and password.'; return; }
      const r = await Sync.signIn(email, pass);
      q('#authMsg').textContent = r.message || '';
    };
    const signUpBtn = q('#btnSignUp');
    if (signUpBtn) signUpBtn.onclick = async () => {
      const email = q('#fEmail').value.trim(), pass = q('#fPass').value;
      if (!email || pass.length < 6) { q('#authMsg').textContent = 'Enter an email and a password of at least 6 characters.'; return; }
      const r = await Sync.signUp(email, pass);
      q('#authMsg').textContent = r.message || '';
    };
    const forgetBtn = q('#btnForget');
    if (forgetBtn) forgetBtn.onclick = async () => {
      if (!(await UI.confirm('Forget this Supabase connection on this device? Your data stays put, both locally and in the cloud — you can reconnect any time.'))) return;
      Sync.disconnect();
    };
    const syncNowBtn = q('#btnSyncNow');
    if (syncNowBtn) syncNowBtn.onclick = () => Sync.syncNow();
    const signOutBtn = q('#btnSignOut');
    if (signOutBtn) signOutBtn.onclick = () => Sync.signOut();
    const keepLocalBtn = q('#btnKeepLocal');
    if (keepLocalBtn) keepLocalBtn.onclick = () => Sync.keepLocal();
    const keepRemoteBtn = q('#btnKeepRemote');
    if (keepRemoteBtn) keepRemoteBtn.onclick = () => Sync.keepRemote();
  }

  function computeStats() {
    const habits = Store.habitEngine.active();
    const checkins = habits.reduce((sum, h) => sum + Store.habitEngine.totalDone(h), 0);
    const kb = new Blob([JSON.stringify(Store.state)]).size / 1024;
    return {
      areas: Store.list('areas').length,
      projects: Store.list('projects').length,
      goals: Store.list('goals').length,
      tasks: Store.list('tasks').length,
      habits: habits.length,
      checkins,
      notes: Store.list('notes').length,
      ideas: Store.list('ideas').length,
      watchlist: Store.list('watchlist').length,
      contacts: Store.list('contacts').length,
      kb
    };
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(Store.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `second-brain-${Store.date.key(Store.date.today())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    UI.toast('Exported');
  }

  function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (e) {
        UI.toast('That file is not valid JSON.');
        return;
      }
      const looksValid = data && typeof data === 'object' && Array.isArray(data.areas);
      if (!looksValid) {
        UI.toast('That file doesn’t look like a Second Brain export.');
        return;
      }
      if (!(await UI.confirm('Import this file? It will replace everything currently in Second Brain.'))) return;
      Store.replaceState(data);
      App.applyTheme();
      App.render();
      UI.toast('Imported');
    };
    reader.onerror = () => UI.toast('Could not read that file.');
    reader.readAsText(file);
  }

  async function doEraseAll() {
    if (!(await UI.confirm('Erase ALL data in Second Brain? This cannot be undone.', { okLabel: 'Erase everything' }))) return;
    if (!(await UI.confirm('Really erase everything — areas, projects, tasks, habits, notes, all of it? Last chance to back out.', { okLabel: 'Yes, erase it all' }))) return;
    Store.resetState();
    App.applyTheme();
    App.go('dashboard');
    UI.toast('All data erased');
  }

  function render(container) {
    const s = computeStats();
    if (unsubscribeSync) { unsubscribeSync(); unsubscribeSync = null; }

    container.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Data &amp; Settings</h1>
          <div class="sub">Local-first: everything works fully offline. Sync below is optional and only sends data to a Supabase project you own.</div>
        </div>
      </div>

      <div class="stats">
        <div class="card stat"><div class="k">Areas</div><div class="v">${s.areas}</div></div>
        <div class="card stat"><div class="k">Projects</div><div class="v">${s.projects}</div></div>
        <div class="card stat"><div class="k">Goals</div><div class="v">${s.goals}</div></div>
        <div class="card stat"><div class="k">Tasks</div><div class="v">${s.tasks}</div></div>
        <div class="card stat"><div class="k">Habits</div><div class="v">${s.habits}</div><div class="n">${s.checkins} check-ins logged</div></div>
        <div class="card stat"><div class="k">Notes &amp; resources</div><div class="v">${s.notes}</div></div>
        <div class="card stat"><div class="k">Ideas</div><div class="v">${s.ideas}</div></div>
        <div class="card stat"><div class="k">Watchlist</div><div class="v">${s.watchlist}</div></div>
        <div class="card stat"><div class="k">Contacts</div><div class="v">${s.contacts}</div></div>
        <div class="card stat"><div class="k">Storage used</div><div class="v">${s.kb.toFixed(1)}</div><div class="n">KB as JSON</div></div>
      </div>

      <section class="card" id="syncCard" style="margin-bottom:18px"></section>

      <section class="card">
        <div class="card-h"><h2>Backup &amp; restore</h2></div>
        <div class="card-b">
          <p class="sub" style="margin-top:0">Export a full backup any time, or restore from one you saved earlier. Importing <strong>replaces everything</strong> currently stored, so export a fresh copy first if you want a safety net.</p>
          <div class="row">
            <button class="btn primary" id="btnExport">${UI.icon('database')} Export JSON</button>
            <button class="btn" id="btnImport">Import JSON…</button>
          </div>
          <input type="file" id="fileImport" accept="application/json" class="hidden">
        </div>
      </section>

      <section class="card" style="margin-top:18px;border-color:var(--danger)">
        <div class="card-h"><h2>Danger zone</h2></div>
        <div class="card-b">
          <p class="sub" style="margin-top:0">Erase every area, project, goal, task, habit, note, idea, watchlist entry and contact. This cannot be undone.</p>
          <button class="btn danger" id="btnErase">Erase all data</button>
        </div>
      </section>

      <p class="sub" style="margin-top:18px;text-align:center">Second Brain always keeps a full local copy in this browser. Nothing is sent anywhere unless you connect Sync above, and then only to the Supabase project you configured.</p>
    `;

    container.querySelector('#btnExport').onclick = doExport;
    const fileInput = container.querySelector('#fileImport');
    container.querySelector('#btnImport').onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) handleImportFile(file);
    };
    container.querySelector('#btnErase').onclick = doEraseAll;

    const syncCard = container.querySelector('#syncCard');
    renderSyncSection(syncCard);
    unsubscribeSync = Sync.onStatusChange(() => renderSyncSection(syncCard));
  }

  window.Pages.data = { render };
})();
