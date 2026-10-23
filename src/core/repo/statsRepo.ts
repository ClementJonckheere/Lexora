import { State } from 'ts-fsrs';
import type { Queryable } from '../db/types';
import { addDays, dayKey, DAY, endOfStudyDay, startOfLocalDay, startOfStudyDay, startOfWeek } from '../domain/dates';
import { activeDirections, primaryDirection, type Settings } from '../domain/settings';
import type { Direction, Mastery, Note } from '../domain/types';
import { countDue, noteMastery, type DueCounts } from '../srs/queue';
import { cardMastery, retrievability, type Scheduler } from '../srs/scheduler';
import { countNewIntroduced, DIFFICULT_THRESHOLD, loadForgetCounts } from './reviewRepo';

export interface DayActivity {
  day: string;
  date: number;
  reviews: number;
  forgotten: number;
}

export interface Stats {
  totalNotes: number;
  newThisWeek: number;
  addedLast7Days: number;
  due: DueCounts;
  mastery: Record<Mastery, number>;
  masteredByDirection: Record<Direction, number>;
  /** Rétention mesurée : part des fiches en phase « Révision » retenues (note ≥ 2), 30 derniers jours. */
  retention30d: { rate: number | null; sample: number };
  /** Probabilité moyenne de rappel actuelle (modèle FSRS), fiches en phase « Révision ». */
  estimatedRecall: number | null;
  reviewsToday: number;
  totalReviews: number;
  streakDays: number;
  activity: DayActivity[];
  forecast: { day: string; date: number; count: number }[];
  hardest: { noteId: number; fails: number }[];
}

export async function computeStats(
  db: Queryable,
  notes: Note[],
  settings: Settings,
  scheduler: Scheduler,
  now = Date.now(),
): Promise<Stats> {
  const dirs = activeDirections(settings);
  const startToday = startOfStudyDay(now, settings.dayStartHour);
  const since30 = startOfLocalDay(addDays(now, -29));
  const since400 = startOfLocalDay(addDays(now, -400));

  const [newIntroducedToday, logs, totalRow, forgetCounts] = await Promise.all([
    countNewIntroduced(db, startToday, primaryDirection(settings)),
    db.select<{ reviewed_at: number; rating: number; state: number }>(
      'SELECT reviewed_at, rating, state FROM review_logs WHERE reviewed_at >= ? ORDER BY reviewed_at',
      [since400],
    ),
    db.select<{ n: number }>('SELECT COUNT(*) AS n FROM review_logs'),
    loadForgetCounts(db),
  ]);

  const mastery: Record<Mastery, number> = { new: 0, learning: 0, mastered: 0 };
  const masteredByDirection: Record<Direction, number> = { fr_en: 0, en_fr: 0 };
  let recallSum = 0;
  let recallN = 0;
  const weekStart = startOfWeek(now);
  let newThisWeek = 0;
  let addedLast7Days = 0;

  const forecastStart = startOfLocalDay(now);
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(forecastStart, i);
    return { day: dayKey(date), date, count: 0 };
  });
  const forecastIndex = new Map(forecast.map((f, i) => [f.day, i]));
  const endToday = endOfStudyDay(now, settings.dayStartHour);

  for (const note of notes) {
    mastery[noteMastery(note, settings)]++;
    if (note.createdAt >= weekStart) newThisWeek++;
    if (note.createdAt >= now - 7 * DAY) addedLast7Days++;
    for (const d of dirs) {
      const card = note.cards[d];
      if (!card) continue;
      if (cardMastery(card, settings.masteryThresholdDays) === 'mastered') masteredByDirection[d]++;
      if (card.state === State.Review) {
        recallSum += retrievability(scheduler, card, now);
        recallN++;
      }
      if (card.state !== State.New) {
        // Tout ce qui est en retard ou dû aujourd'hui est compté dans la colonne du jour.
        const idx = card.due < endToday ? 0 : forecastIndex.get(dayKey(card.due));
        if (idx !== undefined) forecast[idx].count++;
      }
    }
  }

  const activity: DayActivity[] = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(since30, i);
    return { day: dayKey(date), date, reviews: 0, forgotten: 0 };
  });
  const activityIndex = new Map(activity.map((a, i) => [a.day, i]));
  const reviewDays = new Set<string>();
  let retained = 0;
  let sample = 0;
  let reviewsToday = 0;
  for (const l of logs) {
    const t = Number(l.reviewed_at);
    const key = dayKey(t);
    reviewDays.add(key);
    if (t >= startToday) reviewsToday++;
    const idx = activityIndex.get(key);
    if (idx !== undefined) {
      activity[idx].reviews++;
      if (Number(l.rating) === 1) activity[idx].forgotten++;
      if (Number(l.state) === State.Review) {
        sample++;
        if (Number(l.rating) > 1) retained++;
      }
    }
  }

  let streakDays = 0;
  let cursor = startOfLocalDay(now);
  if (!reviewDays.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  while (reviewDays.has(dayKey(cursor))) {
    streakDays++;
    cursor = addDays(cursor, -1);
  }

  const noteIds = new Set(notes.map((n) => n.id));
  const hardest = [...forgetCounts.entries()]
    .filter(([id, fails]) => fails >= DIFFICULT_THRESHOLD && noteIds.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([noteId, fails]) => ({ noteId, fails }));

  return {
    totalNotes: notes.length,
    newThisWeek,
    addedLast7Days,
    due: countDue(notes, { now, settings, scheduler, newIntroducedToday }),
    mastery,
    masteredByDirection,
    retention30d: { rate: sample ? retained / sample : null, sample },
    estimatedRecall: recallN ? recallSum / recallN : null,
    reviewsToday,
    totalReviews: Number(totalRow[0]?.n ?? 0),
    streakDays,
    activity,
    forecast,
    hardest,
  };
}
