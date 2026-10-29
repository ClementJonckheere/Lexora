import { useApp, errorMessage } from './store';
import { supabase } from '@/core/platform/auth';
import { syncOnce } from '@/core/sync/engine';
import { SupabaseRemote } from '@/core/sync/supabaseRemote';
import { loadSettings } from '@/core/repo/settingsRepo';
import { createScheduler } from '@/core/srs/scheduler';

/**
 * Planification de la synchronisation :
 * - quelques secondes après chaque modification locale ;
 * - toutes les 2 minutes, au retour du réseau et quand la fenêtre reprend le focus.
 * Une seule synchronisation à la fois ; une demande pendant un cycle en relance un autre ensuite.
 */

const DEBOUNCE_MS = 3_000;
const INTERVAL_MS = 2 * 60_000;

let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;

const onOnline = () => void runSync();
const onFocus = () => void runSync();

function setStatus(patch: Partial<ReturnType<typeof useApp.getState>['sync']>) {
  useApp.setState((s) => ({ sync: { ...s.sync, ...patch } }));
}

/** Avertissement « schéma à mettre à jour » : une fois par lancement. */
let schemaWarned = false;

export function runSync(opts: { manual?: boolean } = {}): Promise<void> {
  const s = useApp.getState();
  const user = s.auth.user;
  if (!s.db || !user || s.sync.state === 'disabled') return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline' });
    if (opts.manual) s.toast('info', 'Hors ligne : la synchronisation reprendra dès le retour du réseau.');
    return Promise.resolve();
  }
  const db = s.db;
  running = (async () => {
    setStatus({ state: 'syncing', error: null });
    try {
      const { pulled, skipped } = await syncOnce(db, new SupabaseRemote(supabase(), user.id));
      if (skipped.length && !schemaWarned) {
        schemaWarned = true;
        useApp
          .getState()
          .toast(
            'info',
            "Base Supabase à mettre à jour : relancez supabase/schema.sql dans l'éditeur SQL de Supabase pour synchroniser vos mots connus et votre test de vocabulaire. Le reste est synchronisé.",
          );
      }
      setStatus({ state: 'idle', lastSync: Date.now(), error: null });
      if (pulled > 0) {
        const settings = await loadSettings(db);
        useApp.setState({ settings, scheduler: createScheduler(settings) });
        await useApp.getState().refresh();
      }
      if (opts.manual) useApp.getState().toast('success', 'Synchronisé');
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus({ state: offline ? 'offline' : 'error', error: errorMessage(err) });
      if (opts.manual) useApp.getState().toast('error', `Synchronisation impossible : ${errorMessage(err)}`);
    } finally {
      running = null;
      if (again) {
        again = false;
        void runSync();
      }
    }
  })();
  return running;
}

/** Synchronisation différée après une modification locale. */
export function scheduleSync(): void {
  if (useApp.getState().auth.phase !== 'in') return;
  clearTimeout(debounce);
  debounce = setTimeout(() => void runSync(), DEBOUNCE_MS);
}

export function startSyncLoop(): void {
  stopSyncLoop();
  interval = setInterval(() => void runSync(), INTERVAL_MS);
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
}

export function stopSyncLoop(): void {
  clearInterval(interval);
  clearTimeout(debounce);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('focus', onFocus);
}

