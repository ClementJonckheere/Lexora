import { describe, expect, it } from 'vitest';
import { createMemoryDatabase } from '../db/testing';
import { estimateMinutes, loadDailyProgress } from './progressRepo';

const DAY = 86_400_000;

async function withLogs(times: number[], duration = 8000) {
  const db = await createMemoryDatabase();
  for (const [i, t] of times.entries()) {
    await db.execute(
      `INSERT INTO review_logs (id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, reviewed_at, duration_ms, updated_at)
       VALUES (?, 'c', 3, 2, 0, 1, 5, 0, 0, 1, 0, ?, ?, ?)`,
      [`l${i}`, t, duration, t],
    );
  }
  return db;
}

describe('progression quotidienne', () => {
  const now = new Date(2026, 9, 26, 15, 0).getTime();
  it('série de jours consécutifs, aujourd’hui compris', async () => {
    const db = await withLogs([now - 3600_000, now - DAY, now - 2 * DAY, now - 4 * DAY]);
    const p = await loadDailyProgress(db, 4, now);
    expect(p).toMatchObject({ reviewsToday: 1, streakDays: 3, streakAtRisk: false, totalReviews: 4 });
  });
  it('rien aujourd’hui : la série d’hier est « à risque »', async () => {
    const db = await withLogs([now - DAY, now - 2 * DAY]);
    expect(await loadDailyProgress(db, 4, now)).toMatchObject({ reviewsToday: 0, streakDays: 2, streakAtRisk: true });
  });
  it('vitesse réelle et durée estimée', async () => {
    const db = await withLogs(Array.from({ length: 20 }, (_, i) => now - i * 60_000), 6000);
    expect((await loadDailyProgress(db, 4, now)).medianDurationMs).toBe(6000);
    expect(estimateMinutes(10, 2, 6000)).toBe(1);
    expect(estimateMinutes(30, 10, 10_000)).toBe(8);
  });
});
