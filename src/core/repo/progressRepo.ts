import type { Queryable } from '../db/types';
import { addDays, dayKey, startOfLocalDay, startOfStudyDay } from '../domain/dates';
import { computeStreak } from '../progress/streak';
import { usualHour } from '../progress/reminder';

/** Progression quotidienne, toutes langues confondues (accueil, durée estimée des sessions). */
export interface DailyProgress {
  /** Réponses données aujourd'hui (journée de révision). */
  reviewsToday: number;
  /** Jours consécutifs avec au moins une révision (aujourd'hui compris s'il y en a déjà une). */
  streakDays: number;
  /** La série continue si l'on révise aujourd'hui (rien encore aujourd'hui, mais hier oui). */
  streakAtRisk: boolean;
  /** Boucliers (src/core/progress/streak.ts) : disponibles, jours manqués à couvrir, série à sauver. */
  shields: number;
  missedDays: string[];
  lostStreak: number;
  nextShieldIn: number;
  /** Heure (0-23) à laquelle vous révisez le plus souvent, sur les 30 derniers jours (null : pas assez de recul). */
  usualHour: number | null;
  /** Temps médian passé sur une fiche (ms), sur les dernières réponses. */
  medianDurationMs: number;
  totalReviews: number;
}

/** Valeur prudente tant qu'il y a peu de réponses pour mesurer la vitesse réelle. */
export const DEFAULT_DURATION_MS = 12_000;

export async function loadDailyProgress(db: Queryable, dayStartHour: number, now = Date.now()): Promise<DailyProgress> {
  const since = startOfLocalDay(addDays(now, -400));
  const [days, today, durations, total, shieldRows] = await Promise.all([
    db.select<{ reviewed_at: number }>('SELECT reviewed_at FROM review_logs WHERE deleted = 0 AND reviewed_at >= ?', [since]),
    db.select<{ n: number }>('SELECT COUNT(*) AS n FROM review_logs WHERE deleted = 0 AND reviewed_at >= ?', [startOfStudyDay(now, dayStartHour)]),
    db.select<{ duration_ms: number }>('SELECT duration_ms FROM review_logs WHERE deleted = 0 AND duration_ms > 0 ORDER BY reviewed_at DESC LIMIT 300'),
    db.select<{ n: number }>('SELECT COUNT(*) AS n FROM review_logs WHERE deleted = 0'),
    db.select<{ day: string }>('SELECT day FROM streak_shields WHERE deleted = 0'),
  ]);
  // Journée de révision : une révision à 1 h du matin compte pour la veille (heure de bascule).
  const key = (t: number) => dayKey(startOfStudyDay(t, dayStartHour));
  const reviewDays = new Set(days.map((d) => key(Number(d.reviewed_at))));
  const streak = computeStreak(reviewDays, new Set(shieldRows.map((r) => r.day)), key(now));
  // Durée médiane, bornée : une fiche laissée ouverte pendant une pause ne fausse pas l'estimation.
  const ds = durations.map((d) => Math.min(60_000, Math.max(1_500, Number(d.duration_ms)))).sort((a, b) => a - b);
  const medianDurationMs = ds.length >= 10 ? ds[Math.floor(ds.length / 2)] : DEFAULT_DURATION_MS;
  return {
    reviewsToday: Number(today[0]?.n ?? 0),
    streakDays: streak.streak,
    streakAtRisk: streak.atRisk,
    shields: streak.shields,
    missedDays: streak.missed,
    lostStreak: streak.lost,
    nextShieldIn: streak.nextShieldIn,
    usualHour: usualHour(days.map((d) => Number(d.reviewed_at)), now),
    medianDurationMs,
    totalReviews: Number(total[0]?.n ?? 0),
  };
}

/** Durée estimée d'une session (minutes, arrondie, au moins 1) : un nouveau mot prend environ deux fois plus de temps. */
export function estimateMinutes(reviews: number, newCards: number, medianDurationMs: number): number {
  const ms = (reviews + newCards * 2) * medianDurationMs;
  return Math.max(1, Math.round(ms / 60_000));
}

/** Couvre des jours manqués avec des boucliers (la série continue). */
export async function spendStreakShields(db: Queryable, days: readonly string[], now = Date.now()): Promise<void> {
  for (const day of days) {
    await db.execute('INSERT OR REPLACE INTO streak_shields (day, used_at, updated_at, deleted, dirty) VALUES (?, ?, ?, 0, 1)', [day, now, now]);
  }
}
