/**
 * Budget quotidien en minutes : « je dispose de 10 minutes par jour ». Le nombre de nouveaux mots introduits chaque
 * jour s'adapte à la charge de révision prévue, pour garder une pratique régulière sans accumuler les révisions.
 *
 * Estimation prudente, recalée sur l'historique :
 * - charge de révision : le plus grand de la journée (fiches déjà révisées + encore dues) et de la moyenne des 7 jours
 *   suivants (échéances FSRS déjà connues) : ajouter des mots aujourd'hui ne doit pas rendre la semaine intenable ;
 * - coût d'une fiche due : réponses observées par fiche et par jour (rappels après un oubli compris) × durée médiane ;
 * - coût d'un nouveau mot : réponses observées le jour de son introduction (étapes 1 min, 10 min) plus ses premières
 *   révisions de la semaine, × durée médiane ; doublé quand les deux directions sont révisées (la seconde fiche
 *   arrive le lendemain).
 * Les nouveaux mots ne dépassent jamais le plafond réglé (par langue) : le budget ne fait que le réduire.
 */

/** Réponses par fiche due et par jour, tant que l'historique est trop court pour les mesurer. */
export const DEFAULT_ANSWERS_PER_REVIEW = 1.3;
/** Réponses le jour de l'introduction d'un mot (première vue, 1 min, 10 min, parfois un rappel). */
export const DEFAULT_ANSWERS_PER_NEW = 3;
/** Révisions d'un nouveau mot dans la semaine qui suit son introduction (environ J+1 et J+3 ou J+4). */
export const WEEK_REVIEWS_PER_NEW = 2;
/** En dessous, le profil observé n'est pas fiable : valeurs par défaut. */
const MIN_SAMPLES = 30;
const DAY = 86_400_000;

export interface LoadProfile {
  medianMs: number;
  answersPerReview: number;
  answersPerNew: number;
}

export interface BudgetPlan {
  /** Minutes de révision prévues (charge prudente). */
  reviewMinutes: number;
  /** Minutes d'un nouveau mot (jour même et première semaine). */
  minutesPerNew: number;
  /** Nouveaux mots permis par le budget, toutes langues (avant plafonds). */
  allowedNew: number;
  /** Fiches retenues comme charge de révision du jour. */
  reviewCards: number;
}

/** Journal minimal d'une réponse : fiche, instant, état de la fiche avant la réponse (0 : nouvelle, 2 : révision). */
export interface LogRow {
  cardId: string;
  at: number;
  state: number;
}

/**
 * Profil observé sur les 30 derniers jours : pour chaque fiche et chaque jour, le nombre de réponses, selon que la
 * fiche était nouvelle ou en révision à sa première réponse du jour.
 */
export function observedProfile(logs: readonly LogRow[], medianMs: number, dayOf: (t: number) => string): LoadProfile {
  const firstOfDay = new Map<string, { state: number; n: number }>();
  for (const l of [...logs].sort((a, b) => a.at - b.at)) {
    const key = `${l.cardId}|${dayOf(l.at)}`;
    const g = firstOfDay.get(key);
    if (g) g.n++;
    else firstOfDay.set(key, { state: l.state, n: 1 });
  }
  const groups = [...firstOfDay.values()];
  const mean = (state: number, fallback: number) => {
    const xs = groups.filter((g) => (state === 0 ? g.state === 0 : g.state !== 0)).map((g) => g.n);
    return xs.length >= MIN_SAMPLES ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;
  };
  return { medianMs, answersPerReview: mean(2, DEFAULT_ANSWERS_PER_REVIEW), answersPerNew: mean(0, DEFAULT_ANSWERS_PER_NEW) };
}

/** Échéances des `days` jours suivant aujourd'hui (fiches en révision), par jour. */
export function upcomingDue(dues: readonly number[], endOfToday: number, days = 7): number[] {
  const out = new Array<number>(days).fill(0);
  for (const due of dues) {
    const i = Math.floor((due - endOfToday) / DAY);
    if (due >= endOfToday && i < days) out[i]++;
  }
  return out;
}

export function planBudget(input: {
  budgetMinutes: number;
  profile: LoadProfile;
  /** Fiches déjà révisées aujourd'hui (hors nouvelles) + fiches encore dues aujourd'hui, toutes langues. */
  todayCards: number;
  /** Échéances des 7 jours suivants, toutes langues. */
  upcoming: readonly number[];
  bothDirections: boolean;
}): BudgetPlan {
  const { budgetMinutes, profile, todayCards, upcoming, bothDirections } = input;
  const minute = 60_000;
  const weekAverage = upcoming.length ? upcoming.reduce((a, b) => a + b, 0) / upcoming.length : 0;
  const reviewCards = Math.max(todayCards, weekAverage);
  const reviewMinutes = (reviewCards * profile.answersPerReview * profile.medianMs) / minute;
  const minutesPerNew = ((profile.answersPerNew + WEEK_REVIEWS_PER_NEW) * profile.medianMs * (bothDirections ? 2 : 1)) / minute;
  const allowedNew = minutesPerNew > 0 ? Math.max(0, Math.floor((budgetMinutes - reviewMinutes) / minutesPerNew)) : 0;
  return { reviewMinutes, minutesPerNew, allowedNew, reviewCards };
}

/**
 * Répartition entre langues : la langue ouverte d'abord, puis les autres dans l'ordre, chacune jusqu'à son plafond.
 * Renvoie, par univers, le nombre de nouveaux mots du jour (déjà introduits compris), à utiliser comme plafond.
 */
export function shareNewCards(
  allowedNew: number,
  universes: readonly { id: string; cap: number; introducedToday: number }[],
  currentId: string | null,
): Record<string, number> {
  const ordered = [...universes].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
  let left = Math.max(0, allowedNew - universes.reduce((a, u) => a + Math.min(u.introducedToday, u.cap), 0));
  const out: Record<string, number> = {};
  for (const u of ordered) {
    const more = Math.min(left, Math.max(0, u.cap - u.introducedToday));
    left -= more;
    out[u.id] = Math.min(u.cap, u.introducedToday + more);
  }
  return out;
}

/** Minutes réellement passées un jour donné : somme des durées de réponse, bornées (une pause ne compte pas). */
export function spentMinutes(durationsMs: readonly number[]): number {
  return durationsMs.reduce((a, d) => a + Math.min(60_000, Math.max(0, d)), 0) / 60_000;
}

export interface DayBudget {
  plan: BudgetPlan;
  profile: LoadProfile;
  /** Plafond de nouveaux mots du jour, par univers (déjà introduits compris). */
  quotas: Record<string, number>;
  /** Minutes prévues aujourd'hui : révisions du jour et nouveaux mots permis (comparées ensuite au temps réel). */
  predictedMinutes: number;
  /** Minutes déjà passées aujourd'hui. */
  spentToday: number;
}

/**
 * Budget du jour, toutes langues : fiches révisées aujourd'hui et encore dues, échéances des 7 jours suivants, profil
 * observé ; puis répartition des nouveaux mots entre les langues (la langue ouverte d'abord).
 */
export function dayBudget(input: {
  budgetMinutes: number;
  logs: readonly (LogRow & { durationMs: number })[];
  medianMs: number;
  startOfToday: number;
  endOfToday: number;
  /** Échéances des fiches en révision, toutes langues (actives, non suspendues). */
  reviewDues: readonly number[];
  universes: readonly { id: string; cap: number; introducedToday: number }[];
  currentId: string | null;
  bothDirections: boolean;
  dayOf: (t: number) => string;
}): DayBudget {
  const { logs, startOfToday, endOfToday } = input;
  const profile = observedProfile(logs, input.medianMs, input.dayOf);
  const today = logs.filter((l) => l.at >= startOfToday);
  // Fiches déjà révisées aujourd'hui (hors nouvelles) : elles font partie de la charge du jour.
  const firstToday = new Map<string, number>();
  for (const l of [...today].sort((a, b) => a.at - b.at)) if (!firstToday.has(l.cardId)) firstToday.set(l.cardId, l.state);
  const reviewedToday = [...firstToday.values()].filter((s) => s !== 0).length;
  const remaining = input.reviewDues.filter((d) => d < endOfToday).length;
  const plan = planBudget({
    budgetMinutes: input.budgetMinutes,
    profile,
    todayCards: reviewedToday + remaining,
    upcoming: upcomingDue(input.reviewDues, endOfToday),
    bothDirections: input.bothDirections,
  });
  const quotas = shareNewCards(plan.allowedNew, input.universes, input.currentId);
  const newToday = Object.values(quotas).reduce((a, b) => a + b, 0);
  const minute = 60_000;
  const predictedMinutes =
    ((reviewedToday + remaining) * profile.answersPerReview * profile.medianMs + newToday * profile.answersPerNew * profile.medianMs) / minute;
  return { plan, profile, quotas, predictedMinutes, spentToday: spentMinutes(today.map((l) => l.durationMs)) };
}

export interface BudgetDay {
  day: string;
  predicted: number;
  spent: number;
}

/**
 * Prévu et réel des jours passés (aujourd'hui exclu, la journée n'est pas finie) : seulement les jours où une
 * prévision a été notée. Le temps réel vient des durées de réponse, bornées comme `spentMinutes`.
 */
export function budgetHistory(
  predictions: Readonly<Record<string, number>>,
  logs: readonly { at: number; durationMs: number }[],
  dayOf: (t: number) => string,
  today: string,
): BudgetDay[] {
  const durations = new Map<string, number[]>();
  for (const l of logs) {
    const d = dayOf(l.at);
    const xs = durations.get(d);
    if (xs) xs.push(l.durationMs);
    else durations.set(d, [l.durationMs]);
  }
  return Object.entries(predictions)
    .filter(([day]) => day < today)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, predicted]) => ({ day, predicted, spent: spentMinutes(durations.get(day) ?? []) }));
}
