import { useEffect, useState } from 'react';
import { useApp } from '@/app/store';
import { DEFAULT_DURATION_MS, loadDailyProgress, type DailyProgress } from '@/core/repo/progressRepo';

/** Valeurs avant le premier chargement (comparer l'identité pour savoir si les vraies sont arrivées). */
export const EMPTY_PROGRESS: DailyProgress = {
  reviewsToday: 0,
  streakDays: 0,
  streakAtRisk: false,
  shields: 0,
  missedDays: [],
  lostStreak: 0,
  nextShieldIn: 6,
  usualHour: null,
  medianDurationMs: DEFAULT_DURATION_MS,
  totalReviews: 0,
};

/** Progression du jour (série, objectif, vitesse), relue après chaque modification. */
export function useDailyProgress(): DailyProgress {
  const db = useApp((s) => s.db);
  const revision = useApp((s) => s.revision);
  const dayStartHour = useApp((s) => s.settings.dayStartHour);
  const [p, setP] = useState<DailyProgress>(EMPTY_PROGRESS);
  useEffect(() => {
    if (!db) return;
    let alive = true;
    loadDailyProgress(db, dayStartHour)
      .then((r) => alive && setP(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [db, revision, dayStartHour]);
  return p;
}
