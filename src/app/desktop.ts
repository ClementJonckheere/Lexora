import { useApp } from './store';
import { dayKey } from '@/core/domain/dates';
import { settingsFor } from '@/core/domain/settings';
import { checkForUpdate, notify, onTrayAction, setCloseToTray, setTrayTooltip } from '@/core/platform/desktop';
import { countDue } from '@/core/srs/queue';
import { readPref, writePref } from '@/ui/prefs';

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
      { now, settings: settingsFor(s.settings, u), scheduler: s.scheduler, newIntroducedToday: u.id === s.universe?.id ? s.newIntroducedToday : 0 },
    ).total,
  }));
}

function reminderMessage(): string | null {
  const parts = dueByUniverse().filter((d) => d.total > 0);
  const total = parts.reduce((a, d) => a + d.total, 0);
  if (!total) return null;
  const detail = parts.length > 1 ? ` (${parts.map((d) => `${d.name} ${d.total}`).join(', ')})` : '';
  return `${total} fiche${total > 1 ? 's' : ''} à réviser${detail}. Quelques minutes suffisent.`;
}

/** Rappel une fois par jour, à partir de l'heure choisie, s'il reste des révisions. */
async function maybeRemind(now = new Date()) {
  const { settings } = useApp.getState();
  if (!settings.reminderEnabled) return;
  const [h, m] = settings.reminderTime.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const today = dayKey(now.getTime());
  if (readPref<string>('reminder.lastDay', '') === today) return;
  const message = reminderMessage();
  writePref('reminder.lastDay', today);
  if (message) await notify("C'est l'heure de réviser", message);
}

async function refreshTooltip() {
  const total = dueByUniverse().reduce((a, d) => a + d.total, 0);
  await setTrayTooltip(total ? `Lexora : ${total} fiche${total > 1 ? 's' : ''} à réviser` : 'Lexora : tout est à jour').catch(() => undefined);
}

export async function checkUpdates(manual = false): Promise<void> {
  const { setUpdate, toast } = useApp.getState();
  try {
    const update = await checkForUpdate();
    setUpdate(update);
    if (manual) toast('info', update ? `Version ${update.version} disponible.` : 'Lexora est à jour.');
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
  void checkUpdates();
  const updateTimer = setInterval(() => void checkUpdates(), UPDATE_EVERY_MS);
  const tick = setInterval(() => void maybeRemind(), TICK_MS);
  void maybeRemind();
  cleanups.push(() => clearInterval(updateTimer), () => clearInterval(tick));

  return () => cleanups.forEach((c) => c());
}
