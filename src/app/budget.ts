import { activeDirections, primaryDirection, type Settings } from '@/core/domain/settings';
import { dayKey, endOfStudyDay, startOfStudyDay } from '@/core/domain/dates';
import type { Note, Universe } from '@/core/domain/types';
import type { Queryable } from '@/core/db/types';
import { loadBudgetData } from '@/core/repo/budgetRepo';
import { budgetHistory, dayBudget, type BudgetDay, type DayBudget } from '@/core/srs/dailyBudget';
import { State } from '@/core/srs/scheduler';
import { readPref, writePref } from '@/ui/prefs';

/** Durée d'une réponse tant que l'historique est trop court (valeur prudente, comme l'estimation de l'accueil). */
const DEFAULT_MEDIAN_MS = 12_000;

/** Budget du jour et, pour les jours passés, prévu contre réel (cet appareil). */
export type AppDayBudget = DayBudget & { history: BudgetDay[] };

/**
 * Budget quotidien en minutes (réglage `dailyMinutes`) : plafond de nouveaux mots du jour par langue, recalculé à
 * chaque rafraîchissement ; null quand le budget est désactivé. La prévision du jour est notée (une fois par jour,
 * sur cet appareil) pour comparer prévu et réel.
 */
export async function computeDayBudget(
  db: Queryable,
  settings: Settings,
  universes: readonly Universe[],
  notes: readonly Note[],
  currentId: string | null,
  now = Date.now(),
): Promise<AppDayBudget | null> {
  if (!settings.dailyMinutes) return null;
  const start = startOfStudyDay(now, settings.dayStartHour);
  const end = endOfStudyDay(now, settings.dayStartHour);
  const { logs, introducedToday } = await loadBudgetData(db, start, primaryDirection(settings), now);
  const durations = logs
    .map((l) => l.durationMs)
    .filter((d) => d > 0)
    .slice(-300)
    .map((d) => Math.min(60_000, Math.max(1_500, d)))
    .sort((a, b) => a - b);
  const medianMs = durations.length >= 10 ? durations[Math.floor(durations.length / 2)] : DEFAULT_MEDIAN_MS;
  const dayOf = (t: number) => dayKey(startOfStudyDay(t, settings.dayStartHour));
  const directions = activeDirections(settings);
  const reviewDues: number[] = [];
  for (const n of notes) {
    if (n.suspended) continue;
    for (const d of directions) {
      const c = n.cards[d];
      if (c && c.state === State.Review) reviewDues.push(c.due);
    }
  }
  const budget = dayBudget({
    budgetMinutes: settings.dailyMinutes,
    logs,
    medianMs,
    startOfToday: start,
    endOfToday: end,
    reviewDues,
    universes: universes.map((u) => ({ id: u.id, cap: u.newPerDay ?? settings.newPerDay, introducedToday: introducedToday[u.id] ?? 0 })),
    currentId,
    bothDirections: settings.directions === 'both',
    dayOf,
  });
  const today = dayKey(start);
  recordPrediction(today, budget.predictedMinutes);
  return { ...budget, history: budgetHistory(recordedPredictions(), logs, dayOf, today) };
}

const PREDICTIONS = 'budget.predictions';

/** Première prévision de chaque journée (les suivantes la remplaceraient par une valeur déjà influencée par la séance). */
function recordPrediction(day: string, minutes: number) {
  const all = readPref<Record<string, number>>(PREDICTIONS, {});
  if (all[day] !== undefined) return;
  const kept = Object.fromEntries(Object.entries(all).sort().slice(-29));
  writePref(PREDICTIONS, { ...kept, [day]: Math.round(minutes * 10) / 10 });
}

/** Prévisions des jours passés (cet appareil), pour la comparaison avec le temps réel. */
export function recordedPredictions(): Record<string, number> {
  return readPref<Record<string, number>>(PREDICTIONS, {});
}
