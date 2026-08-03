'use strict';
/* =========================================================================
   Second Brain — optional cloud sync (window.Sync)
   =========================================================================
   Entirely opt-in. Until Sync.configure(url, anonKey) is called with a real
   Supabase project's values, this module is fully inert — the app behaves
   exactly as the local-only version did. Nothing here ever runs unless the
   user has explicitly set up sync from the Data page.

   Backend: one Supabase table holds a single JSON blob per signed-in user.
     create table app_state (
       user_id uuid primary key references auth.users(id) on delete cascade,
       data jsonb not null default '{}'::jsonb,
       updated_at timestamptz not null default now()
     );
     alter table app_state enable row level security;
     create policy "own row" on app_state for all
       using (auth.uid() = user_id) with check (auth.uid() = user_id);
     alter publication supabase_realtime add table app_state; -- optional, live push

   Sync strategy: last-write-wins by `updated_at`, which is fine for one
   person editing from at most a couple of devices. On first sign-in on a
   device that already has real local data AND a remote row already exists,
   the user is asked once which copy to keep (Sync.status becomes
   'needs-choice'; resolve with Sync.keepLocal() or Sync.keepRemote()).
   After that, changes push ~1.5s after you stop typing, pull on page load
   and every 45s, and — if you ran the optional `alter publication` line —
   arrive live over Supabase Realtime while both devices are open.

   Public API (all safe to call before configure(); no-ops until then):
     Sync.isConfigured() -> bool
     Sync.configure(url, anonKey)
     Sync.disconnect()                    -- forgets config + signs out
     Sync.signUp(email, password) -> {ok, message}
     Sync.signIn(email, password) -> {ok, message}
     Sync.signOut()
     Sync.syncNow()                       -- manual push+pull
     Sync.keepLocal() / Sync.keepRemote() -- resolve a 'needs-choice' state
     Sync.getState() -> {status, email, lastSyncedAt, error}
        status: 'unconfigured'|'signed-out'|'connecting'|'needs-choice'|
                'syncing'|'synced'|'offline'|'error'
     Sync.onStatusChange(fn) -> unsubscribe(). fn(state) fires whenever
        getState() changes; used by js/pages/data.js to keep its Sync
        section live without polling. Call the returned unsubscribe() when
        the section is torn down (e.g. navigating away) to avoid piling up
        listeners across repeat visits.
   ========================================================================= */
(function () {
  const CONFIG_KEY = 'sb.syncConfig';       // {url, anonKey} — anon key is a public, client-safe key by design
  const MARK_KEY = 'sb.remoteUpdatedAt';    // ms timestamp of the last remote version we've applied or pushed
  const RECONCILED_KEY = 'sb.reconciled';   // '1' once this device has resolved (or skipped) the first-sync choice
  const TABLE = 'app_state';
  const POLL_MS = 45000;

  let client = null;
  let session = null;
  let channel = null;
  let pollTimer = null;
  let pushTimer = null;
  let suppressPush = false;
  let pendingRemote = null; // set while status === 'needs-choice'

  const listeners = [];
  const st = { status: 'unconfigured', email: null, lastSyncedAt: null, error: null, remoteUpdatedAt: null };
  function setStatus(status, extra) {
    st.status = status;
    if (status !== 'error') st.error = null;
    Object.assign(st, extra || {});
    listeners.forEach(fn => { try { fn(Object.assign({}, st)); } catch (e) { console.error('Sync listener threw', e); } });
  }
  function onStatusChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
  }
  function getState() { return Object.assign({}, st); }

  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'); } catch (e) { return null; }
  }
  function isConfigured() { return !!loadConfig(); }

  function hasRealLocalData() {
    const s = Store.state;
    return (s.areas.length + s.projects.length + s.goals.length + s.tasks.length + s.habits.length +
      s.notes.filter(n => !n.daily).length + s.ideas.length + s.watchlist.length + s.contacts.length) > 0;
  }

  function applyRemote(row) {
    suppressPush = true;
    Store.replaceState(row.data);
    localStorage.setItem(MARK_KEY, String(new Date(row.updated_at).getTime()));
    setTimeout(() => { suppressPush = false; }, 300);
    if (window.App) App.render();
  }

  async function fetchRemoteRow() {
    const { data, error } = await client.from(TABLE).select('data,updated_at').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function pushNow() {
    if (!client || !session || suppressPush) return;
    setStatus('syncing');
    const nowIso = new Date().toISOString();
    const { error } = await client.from(TABLE).upsert({ user_id: session.user.id, data: Store.state, updated_at: nowIso });
    if (error) { setStatus('error', { error: error.message }); return; }
    localStorage.setItem(MARK_KEY, String(Date.parse(nowIso)));
    setStatus('synced', { lastSyncedAt: Date.now() });
  }

  async function pullOnce() {
    const row = await fetchRemoteRow();
    if (!row) return 'no-remote';
    const remoteMs = new Date(row.updated_at).getTime();
    const seenMs = Number(localStorage.getItem(MARK_KEY) || 0);
    if (remoteMs > seenMs) applyRemote(row);
    return 'ok';
  }

  async function reconcileFirstSync() {
    let row = null;
    try { row = await fetchRemoteRow(); } catch (e) { setStatus('error', { error: e.message }); return; }
    const reconciled = localStorage.getItem(RECONCILED_KEY) === '1';
    if (!row) {
      // Nothing in the cloud yet — this device's local copy becomes the seed.
      await pushNow();
      localStorage.setItem(RECONCILED_KEY, '1');
      return;
    }
    if (reconciled || !hasRealLocalData()) {
      applyRemote(row);
      localStorage.setItem(RECONCILED_KEY, '1');
      setStatus('synced', { lastSyncedAt: Date.now() });
      return;
    }
    // Both a remote row and real local data exist, and this device has never
    // resolved that before — ask once rather than silently picking a winner.
    pendingRemote = row;
    setStatus('needs-choice', { remoteUpdatedAt: row.updated_at });
  }

  async function keepLocal() {
    if (!pendingRemote) return;
    pendingRemote = null;
    localStorage.setItem(RECONCILED_KEY, '1');
    await pushNow();
  }
  async function keepRemote() {
    if (!pendingRemote) return;
    applyRemote(pendingRemote);
    pendingRemote = null;
    localStorage.setItem(RECONCILED_KEY, '1');
    setStatus('synced', { lastSyncedAt: Date.now() });
  }

  function startBackgroundSync() {
    Store.onChange(() => {
      if (!client || !session || suppressPush) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushNow, 1500);
    });
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!client || !session || st.status === 'needs-choice') return;
      pullOnce().catch(e => setStatus('error', { error: e.message }));
    }, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && client && session && st.status !== 'needs-choice') {
        pullOnce().catch(e => setStatus('error', { error: e.message }));
      }
    });
    window.addEventListener('online', () => {
      if (client && session) pullOnce().catch(() => {});
    });
    window.addEventListener('offline', () => setStatus('offline'));
  }

  function subscribeRealtime() {
    if (!client || !session) return;
    if (channel) client.removeChannel(channel);
    channel = client.channel('app_state:' + session.user.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE, filter: `user_id=eq.${session.user.id}` },
        payload => { if (payload.new) applyRemote(payload.new); })
      .subscribe();
  }

  async function afterSignedIn() {
    st.email = session.user.email;
    setStatus('connecting');
    subscribeRealtime();
    await reconcileFirstSync();
  }

  function configure(url, anonKey) {
    if (!window.supabase || !window.supabase.createClient) {
      setStatus('error', { error: 'Supabase library did not load — check your internet connection and reload.' });
      return;
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, anonKey }));
    client = window.supabase.createClient(url, anonKey);
    setStatus('signed-out');
    client.auth.onAuthStateChange((_event, s) => {
      session = s;
      if (session) afterSignedIn().catch(e => setStatus('error', { error: e.message }));
      else setStatus('signed-out');
    });
    client.auth.getSession().then(({ data }) => {
      session = data.session;
      if (session) afterSignedIn().catch(e => setStatus('error', { error: e.message }));
    });
    startBackgroundSync();
  }

  function disconnect() {
    if (client && session) client.auth.signOut().catch(() => {});
    if (channel && client) client.removeChannel(channel);
    clearInterval(pollTimer); clearTimeout(pushTimer);
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(MARK_KEY);
    localStorage.removeItem(RECONCILED_KEY);
    client = null; session = null; channel = null; pendingRemote = null;
    st.email = null; st.lastSyncedAt = null;
    setStatus('unconfigured');
  }

  async function signUp(email, password) {
    if (!client) return { ok: false, message: 'Connect to Supabase first.' };
    setStatus('connecting');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) { setStatus('signed-out'); return { ok: false, message: error.message }; }
    if (!data.session) { setStatus('signed-out'); return { ok: true, message: 'Check your email to confirm your account, then sign in.' }; }
    return { ok: true, message: 'Account created and signed in.' };
  }
  async function signIn(email, password) {
    if (!client) return { ok: false, message: 'Connect to Supabase first.' };
    setStatus('connecting');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) { setStatus('signed-out'); return { ok: false, message: error.message }; }
    return { ok: true, message: 'Signed in.' };
  }
  function signOut() {
    if (client) client.auth.signOut().catch(() => {});
    if (channel && client) { client.removeChannel(channel); channel = null; }
    session = null; st.email = null;
    setStatus('signed-out');
  }

  async function syncNow() {
    if (!client || !session) return;
    try { await pushNow(); await pullOnce(); }
    catch (e) { setStatus('error', { error: e.message }); }
  }

  // Auto-reconnect using previously saved config, if any. Set the status
  // synchronously so the very first render (before the deferred configure()
  // below runs) doesn't flash an "unconfigured" state it's about to leave.
  const saved = loadConfig();
  if (saved && saved.url && saved.anonKey) {
    st.status = 'connecting';
    // Give the Supabase CDN script (loaded just before this file) a tick to attach window.supabase.
    setTimeout(() => configure(saved.url, saved.anonKey), 0);
  }

  window.Sync = {
    isConfigured, configure, disconnect,
    signUp, signIn, signOut,
    syncNow, keepLocal, keepRemote,
    getState, onStatusChange
  };
})();
