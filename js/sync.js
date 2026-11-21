// Sync with a Google Sheet through the Apps Script in apps-script/Code.gs.
// One POST does everything: send local changes, receive all rows back.

import { settings, pendingChanges, mergeRemote } from './store.js';

let running = null;

export const syncConfigured = () => !!(settings().syncUrl && settings().syncKey);

export function sync() {
  if (!syncConfigured()) return Promise.resolve({ ok: false, error: 'Sync is not set up' });
  if (running) return running;
  running = (async () => {
    const { syncUrl, syncKey } = settings();
    const changes = pendingChanges();
    const startedAt = Date.now();
    try {
      // text/plain keeps this a "simple" request (no CORS preflight, which Apps Script can't answer)
      const res = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key: syncKey, action: 'sync', ...changes }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, error: data.error || 'Sync failed' };
      mergeRemote(data, startedAt);
      return { ok: true, sent: changes.items.length + changes.log.length };
    } catch (err) {
      return { ok: false, error: navigator.onLine ? String(err.message || err) : 'Offline — will sync later' };
    } finally {
      running = null;
    }
  })();
  return running;
}

let debounce = null;
/** Sync a little after changes, and when the app comes back to the foreground. */
export function scheduleSync(ms = 4000) {
  if (!syncConfigured()) return;
  clearTimeout(debounce);
  debounce = setTimeout(sync, ms);
}
