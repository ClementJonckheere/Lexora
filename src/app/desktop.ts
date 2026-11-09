import { useApp } from './store';
import { dayKey } from '@/core/domain/dates';
import { settingsFor } from '@/core/domain/settings';
import { checkForUpdate, notify, onTrayAction, setCloseToTray, setTrayTooltip, type AvailableUpdate } from '@/core/platform/desktop';
import { countDue } from '@/core/srs/queue';
import { readPref, writePref } from '@/ui/prefs';
import { loadDailyProgress, type DailyProgress } from '@/core/repo/progressRepo';
import { reminderHour, reminderText } from '@/core/progress/reminder';

/**
 * Intégration au bureau, active tant que l'application tourne (y compris masquée) :
 * menu de l'icône, infobulle avec le nombre de révisions, rappel quotidien, mises à jour.
 */

const UPDATE_EVERY_MS = 6 * 3600_000;
const TICK_MS = 60_000;

/** Fiches à réviser, par univers. */
export function dueByUniverse(): { name: string; total: number }[] {
  const s = useApp.getState();
  const now = Date.now();
  return s.universes.map((u) => ({
    name: u.name,
    total: countDue(
      s.allNotes.filter((n) => n.universeId === u.id),
      { now, settings: settingsFor(s.settings, u, s.dayBudget?.quotas), scheduler: s.scheduler, newIntroducedToday: u.id === s.universe?.id ? s.newIntroducedToday : 0 },
    ).total,
  }));
}

/** Progression (série, heure habituelle), relue au plus toutes les 10 minutes ou après une modification. */
let progressCache: { at: number; revision: number; progress: DailyProgress } | null = null;
async function currentProgress(): Promise<DailyProgress | null> {
  const { db, settings, revision } = useApp.getState();
  if (!db) return null;
  if (progressCache && progressCache.revision === revision && Date.now() - progressCache.at < 10 * 60_000) return progressCache.progress;
  const progress = await loadDailyProgress(db, settings.dayStartHour);
  progressCache = { at: Date.now(), revision, progress };
  return progress;
}

/**
 * Rappel une fois par jour, à partir de l'heure où vous révisez le plus souvent (ou de l'heure choisie) : série à
 * garder, série à sauver avec un bouclier, ou révisions en attente.
 */
async function maybeRemind(now = new Date()) {
  const { settings } = useApp.getState();
  if (!settings.reminderEnabled) return;
  const progress = await currentProgress().catch(() => null);
  if (!progress) return;
  const { hour, minute } = reminderHour(settings.reminderTime, settings.reminderAuto, progress.usualHour);
  if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) return;
  const today = dayKey(now.getTime());
  if (readPref<string>('reminder.lastDay', '') === today) return;
  const parts = dueByUniverse().filter((d) => d.total > 0);
  const due = parts.reduce((a, d) => a + d.total, 0);
  const text = reminderText({
    streak: progress.streakDays,
    atRisk: progress.streakAtRisk,
    doneToday: progress.reviewsToday > 0,
    repairable: progress.missedDays.length && progress.shields >= progress.missedDays.length ? progress.missedDays.length : 0,
    due,
    dueDetail: parts.length > 1 ? ` (${parts.map((d) => `${d.name} ${d.total}`).join(', ')})` : '',
  });
  writePref('reminder.lastDay', today);
  if (text) await notify(text.title, text.body);
}

async function refreshTooltip() {
  const total = dueByUniverse().reduce((a, d) => a + d.total, 0);
  await setTrayTooltip(total ? `Lexora : ${total} fiche${total > 1 ? 's' : ''} à réviser` : 'Lexora : tout est à jour').catch(() => undefined);
}

/**
 * Télécharge et installe la nouvelle version, puis redémarre Lexora (installateur Windows en mode passif : une
 * petite fenêtre de progression, aucune question). Avancement partagé par le bandeau et les Paramètres.
 */
export async function installUpdate(update: AvailableUpdate): Promise<void> {
  if (useApp.getState().updateProgress !== undefined) return;
  useApp.setState({ updateProgress: null });
  try {
    await update.install((p) => useApp.setState({ updateProgress: p }));
  } catch (err) {
    useApp.setState({ updateProgress: undefined });
    useApp.getState().toast('error', `Mise à jour impossible : ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Une installation automatique ratée n'est pas retentée en boucle : une seule tentative par version et par jour. */
const AUTO_RETRY_MS = 24 * 3600_000;

export async function checkUpdates(manual = false, atStartup = false): Promise<void> {
  const { setUpdate, toast } = useApp.getState();
  try {
    const update = await checkForUpdate();
    setUpdate(update);
    if (manual) toast('info', update ? `Version ${update.version} disponible.` : 'Lexora est à jour.');
    // Au démarrage : installation sans attendre l'utilisateur (réglage « Mises à jour automatiques »).
    if (update && atStartup && useApp.getState().settings.autoUpdate) {
      const tried = readPref<{ version: string; at: number } | null>('update.autoTried', null);
      if (tried?.version === update.version && Date.now() - tried.at < AUTO_RETRY_MS) return;
      writePref('update.autoTried', { version: update.version, at: Date.now() });
      toast('info', `Installation de la version ${update.version}… Lexora va redémarrer.`);
      await installUpdate(update);
    }
  } catch (err) {
    if (manual) toast('error', `Vérification impossible : ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startDesktopIntegration(): () => void {
  const cleanups: (() => void)[] = [];

  void setCloseToTray(useApp.getState().settings.closeToTray);
  let lastClose = useApp.getState().settings.closeToTray;
  let lastRevision = -1;
  cleanups.push(
    useApp.subscribe((s) => {
      if (s.settings.closeToTray !== lastClose) {
        lastClose = s.settings.closeToTray;
        void setCloseToTray(lastClose);
      }
      if (s.revision !== lastRevision) {
        lastRevision = s.revision;
        void refreshTooltip();
      }
    }),
  );

  void onTrayAction((action) => {
    const s = useApp.getState();
    if (action === 'add') {
      if (!s.editor) s.openEditor();
    } else s.navigate({ name: 'review' });
  }).then((un) => cleanups.push(un));

  void refreshTooltip();
  void checkUpdates(false, true);
  const updateTimer = setInterval(() => void checkUpdates(), UPDATE_EVERY_MS);
  const tick = setInterval(() => void maybeRemind(), TICK_MS);
  void maybeRemind();
  cleanups.push(() => clearInterval(updateTimer), () => clearInterval(tick));

  return () => cleanups.forEach((c) => c());
}
